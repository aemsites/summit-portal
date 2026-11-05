import { createAuthorizedShareLink } from './sharelink.js';
import { EMAIL_RE, jsonResponse, safeRedirectPath } from './magiclink.js';

const ENDPOINT = '/auth/sharelink/dih';
const MAX_BODY_BYTES = 8192;
const encoder = new TextEncoder();

function respond(body, status) {
  const response = jsonResponse(body, status);
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}

/** Bound streamed bodies as well as requests with a Content-Length header. */
async function readBody(request) {
  const reader = request.body?.getReader();
  if (!reader) return { text: '' };
  const chunks = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > MAX_BODY_BYTES) {
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

/** Service-only copy adapter; browser sessions and IMS tokens are not consulted. */
export async function handleDihShareLinkRequest(request, env) {
  if (request.method !== 'POST') {
    const response = respond({ error: 'Method Not Allowed' }, 405);
    response.headers.set('Allow', 'POST');
    return response;
  }
  const secret = env.DIH_SHARE_LINK_SECRET;
  if (typeof secret !== 'string' || [...secret].length < 32 || secret.trim() !== secret
    || [...secret].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) {
    return respond({ error: 'DIH share link service is not configured' }, 503);
  }

  const timestamp = request.headers.get('X-DIH-Timestamp') || '';
  const seconds = Number(timestamp);
  const signature = request.headers.get('X-DIH-Signature') || '';
  if (!/^\d+$/.test(timestamp) || !Number.isSafeInteger(seconds)
    || Math.abs(Math.floor(Date.now() / 1000) - seconds) > 300
    || !/^[a-f0-9]{64}$/.test(signature)) {
    return respond({ error: 'Invalid service authentication' }, 401);
  }

  let body;
  try {
    body = await readBody(request);
  } catch {
    return respond({ error: 'Invalid UTF-8 body' }, 400);
  }
  if (body.oversized) return respond({ error: 'Request body too large' }, 413);

  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  const mac = Uint8Array.from(signature.match(/../g), (pair) => parseInt(pair, 16));
  const valid = await crypto.subtle.verify('HMAC', key, mac, encoder.encode(`${timestamp}\nPOST\n${ENDPOINT}\n${body.text}`));
  if (!valid) return respond({ error: 'Invalid service authentication' }, 401);

  const contentType = request.headers.get('Content-Type') || '';
  if (!/^application\/json(?:\s*;\s*charset\s*=\s*utf-8)?$/i.test(contentType)) {
    return respond({ error: 'Content-Type must be application/json with UTF-8 encoding' }, 415);
  }
  let payload;
  try {
    payload = JSON.parse(body.text);
  } catch {
    return respond({ error: 'Invalid JSON body' }, 400);
  }
  if (!payload || Array.isArray(payload) || typeof payload !== 'object'
    || Object.keys(payload).length !== 2
    || typeof payload.path !== 'string' || typeof payload.actor_email !== 'string'
    || !EMAIL_RE.test(payload.actor_email)) {
    return respond({ error: 'Expected exactly path and a valid actor_email' }, 400);
  }
  const path = safeRedirectPath(payload.path);
  if (!path) return respond({ error: 'Invalid page path' }, 400);

  // Log only a masked actor and pathname: never query strings or signed links.
  const audit = {
    path: new URL(path, request.url).pathname,
    actor: `***@${payload.actor_email.split('@')[1].toLowerCase()}`,
  };
  // eslint-disable-next-line no-console
  console.log('[dih-sharelink]', JSON.stringify(audit));
  try {
    const response = await createAuthorizedShareLink(request, env, path);
    response.headers.set('Cache-Control', 'private, no-store');
    return response;
  } catch {
    // Keep unexpected CUG failures out of the global handler and its raw error log.
    return respond({ error: 'Failed to create share link' }, 500);
  }
}
