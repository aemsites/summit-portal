import { createAuthorizedShareLink } from './sharelink.js';
import { EMAIL_RE, jsonResponse, safeRedirectPath } from './magiclink.js';
import normalizePublicCampaignId, { canonicalCampaignReportPath } from './campaign-id.js';

const ENDPOINT = '/auth/sharelink/dih';
const MAX_BODY_BYTES = 8192;
const encoder = new TextEncoder();

export function isCampaignShareAnalyticsConfigured(env) {
  return env.BOOTH_ANALYTICS_HOSTNAME === 'act.aem.now' && Boolean(env.DIH_SHARE_LINK_SECRET);
}

function respond(body, status) {
  const response = jsonResponse(body, status);
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}

/** Bound streamed bodies as well as requests with a Content-Length header. */
export async function readBody(request, maxBodyBytes) {
  const reader = request.body?.getReader();
  if (!reader) return { text: '' };
  const chunks = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > maxBodyBytes) {
      await reader.cancel();
      return { oversized: true };
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  chunks.forEach((chunk) => {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  });
  // Preserve a BOM rather than silently changing the signed text.
  return { text: new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes) };
}

/** Verify the signed JSON envelope shared by the private Hub routes. */
export async function authenticateDihJson(request, options) {
  const { endpoint, secret, configurationError, maxBodyBytes = MAX_BODY_BYTES } = options;
  if (request.method !== 'POST') {
    const response = respond({ error: 'Method Not Allowed' }, 405);
    response.headers.set('Allow', 'POST');
    return { response };
  }
  if (typeof secret !== 'string' || [...secret].length < 32 || secret.trim() !== secret
    || [...secret].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) {
    return { response: respond({ error: configurationError }, 503) };
  }

  const timestamp = request.headers.get('X-DIH-Timestamp') || '';
  const seconds = Number(timestamp);
  const signature = request.headers.get('X-DIH-Signature') || '';
  if (!/^\d+$/.test(timestamp) || !Number.isSafeInteger(seconds)
    || Math.abs(Math.floor(Date.now() / 1000) - seconds) > 300
    || !/^[a-f0-9]{64}$/.test(signature)) {
    return { response: respond({ error: 'Invalid service authentication' }, 401) };
  }

  let body;
  try {
    body = await readBody(request, maxBodyBytes);
  } catch {
    return { response: respond({ error: 'Invalid UTF-8 body' }, 400) };
  }
  if (body.oversized) return { response: respond({ error: 'Request body too large' }, 413) };

  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  const mac = Uint8Array.from(signature.match(/../g), (pair) => parseInt(pair, 16));
  const valid = await crypto.subtle.verify('HMAC', key, mac, encoder.encode(`${timestamp}\nPOST\n${endpoint}\n${body.text}`));
  if (!valid) return { response: respond({ error: 'Invalid service authentication' }, 401) };

  const contentType = request.headers.get('Content-Type') || '';
  if (!/^application\/json(?:\s*;\s*charset\s*=\s*utf-8)?$/i.test(contentType)) {
    return { response: respond({ error: 'Content-Type must be application/json with UTF-8 encoding' }, 415) };
  }
  try {
    return { payload: JSON.parse(body.text) };
  } catch {
    return { response: respond({ error: 'Invalid JSON body' }, 400) };
  }
}

/** Service-only copy adapter; browser sessions and IMS tokens are not consulted. */
export async function handleDihShareLinkRequest(request, env) {
  const { payload, response: authError } = await authenticateDihJson(request, {
    endpoint: ENDPOINT,
    secret: env.DIH_SHARE_LINK_SECRET,
    configurationError: 'DIH share link service is not configured',
  });
  if (authError) return authError;
  const tagged = Object.hasOwn(payload || {}, 'public_campaign_id');
  if (!payload || Array.isArray(payload) || typeof payload !== 'object'
    || Object.keys(payload).length !== (tagged ? 3 : 2)
    || typeof payload.path !== 'string' || typeof payload.actor_email !== 'string'
    || !EMAIL_RE.test(payload.actor_email)) {
    return respond({ error: 'Expected exactly path and a valid actor_email' }, 400);
  }
  const path = safeRedirectPath(payload.path);
  if (!path) return respond({ error: 'Invalid page path' }, 400);
  const campaignId = tagged && normalizePublicCampaignId(payload.public_campaign_id);
  const reportPath = tagged && canonicalCampaignReportPath(payload.path);
  if (tagged && (!campaignId || !reportPath)) {
    return respond({ error: 'Expected a lowercase campaign UUID and published report path' }, 400);
  }
  if (tagged && !isCampaignShareAnalyticsConfigured(env)) {
    return respond({
      error: 'Campaign share analytics is not configured',
      code: 'campaign_share_analytics_unconfigured',
    }, 503);
  }

  // Log only a masked actor and pathname: never query strings or signed links.
  const audit = {
    path: new URL(path, request.url).pathname,
    actor: `***@${payload.actor_email.split('@')[1].toLowerCase()}`,
  };
  // eslint-disable-next-line no-console
  console.log('[dih-sharelink]', JSON.stringify(audit));
  try {
    const campaign = tagged ? { id: campaignId, path: reportPath } : undefined;
    const response = await createAuthorizedShareLink(request, env, campaign ? `${reportPath}/` : path, { campaign });
    response.headers.set('Cache-Control', 'private, no-store');
    return response;
  } catch {
    // Keep unexpected CUG failures out of the global handler and its raw error log.
    return respond({ error: 'Failed to create share link' }, 500);
  }
}
