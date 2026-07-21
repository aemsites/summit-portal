import { createMagicLinkToken } from './session.js';
import { sendMagicLinkConfirm, sendMagicLinkInternalNotify, sendMagicLinkNotFound } from './notification.js';

const MAPPING_PATH = '/closed-user-groups-mapping.json';
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Reject characters that could break out of the URL or smuggle CRLF.
// eslint-disable-next-line no-control-regex
const UNSAFE_PATH_RE = /[\u0000-\u001F\u007F\s\\]/;

// eslint-disable-next-line no-console
const log = (...args) => console.log('[magiclink]', ...args);
// eslint-disable-next-line no-console
const logError = (...args) => console.error('[magiclink]', ...args);

/** JSON response helper shared by the magic-link and share-link handlers. */
export function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Pick the APO email template for a given link kind + CUG org. The naming
 * convention (`expdev_actnow_<kind>` with a `_semrush` suffix for Semrush
 * customers) lives here so the magic-link and share-link handlers stay in sync.
 */
export function templateForOrg(kind, org) {
  const suffix = (org || '').trim().toLowerCase() === 'semrush' ? '_semrush' : '';
  return `expdev_actnow_${kind}${suffix}`;
}

/**
 * Validate a caller-supplied redirect path. Must be a same-origin path:
 *   - starts with '/' (not '//' which would be protocol-relative)
 *   - contains no control characters, whitespace, or backslashes
 *   - parses as a relative URL
 * Returns the cleaned path+search (no fragment) or null when invalid.
 */
export function safeRedirectPath(raw) {
  if (typeof raw !== 'string') return null;
  if (!raw.startsWith('/') || raw.startsWith('//')) return null;
  if (UNSAFE_PATH_RE.test(raw)) return null;
  try {
    const parsed = new URL(raw, 'https://placeholder.invalid');
    if (parsed.origin !== 'https://placeholder.invalid') return null;
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return null;
  }
}

/** Append `token=<jwt>` to a path, preserving any existing query string. */
export function appendTokenParam(path, token) {
  const separator = path.includes('?') ? '&' : '?';
  return `${path}${separator}token=${token}`;
}

export async function fetchCugMapping(env) {
  const url = `https://${env.ORIGIN_HOSTNAME}${MAPPING_PATH}`;
  const headers = {};
  if (env.ORIGIN_AUTHENTICATION) headers.authorization = `token ${env.ORIGIN_AUTHENTICATION}`;
  try {
    log(`fetching CUG mapping from ${url}`);
    const resp = await fetch(url, { headers });
    if (!resp.ok) {
      logError(`mapping fetch failed with status ${resp.status}`);
      return { error: `mapping fetch failed (${resp.status})`, entries: [] };
    }
    const json = await resp.json();
    const entries = Array.isArray(json.data) ? json.data : [];
    log(`CUG mapping loaded entries=${entries.length}`);
    return { entries };
  } catch (err) {
    logError(`mapping fetch threw: ${err.message}`);
    return { error: err.message || 'mapping fetch failed', entries: [] };
  }
}

/**
 * Fetch the target page's ACTUAL CUG requirement straight from the origin
 * (the same `x-aem-cug-required` / `x-aem-cug-groups` headers `cug.js` reads
 * on every real request), instead of trusting the separately-maintained
 * mapping sheet above. The mapping sheet can drift from a page's real access
 * group — seen in production, where the mapping listed `hsbc.co.uk` for an
 * account whose live CUG group is actually `hsbc.com`. A link minted purely
 * from stale mapping data opens fine but then 403s the moment it's used.
 *
 * Returns `null` on any fetch failure (network error, non-2xx) so callers can
 * fall back to the mapping instead of hard-failing the mint over a transient
 * origin issue — this is a cross-check, not a hard dependency.
 */
export async function fetchLiveCugGroups(path, env) {
  const url = new URL(path, `https://${env.ORIGIN_HOSTNAME}`);
  const headers = {};
  if (env.ORIGIN_AUTHENTICATION) headers.authorization = `token ${env.ORIGIN_AUTHENTICATION}`;
  try {
    const resp = await fetch(url, { method: 'HEAD', headers });
    if (!resp.ok) {
      logError(`live CUG header fetch failed with status ${resp.status} for path=${path}`);
      return null;
    }
    const required = resp.headers.get('x-aem-cug-required') === 'true';
    const groups = (resp.headers.get('x-aem-cug-groups') || '')
      .split(',')
      .map((g) => g.trim().toLowerCase())
      .filter(Boolean);
    log(`live CUG check path=${path} required=${required} groups=${groups.join(',') || '(none)'}`);
    return { required, groups };
  } catch (err) {
    logError(`live CUG header fetch threw: ${err.message}`);
    return null;
  }
}

export async function handleMagicLinkRequest(request, env) {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  let email;
  let redirectRaw;
  try {
    const body = await request.json();
    email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    redirectRaw = typeof body.redirect === 'string' ? body.redirect : undefined;
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  if (!EMAIL_RE.test(email)) {
    return jsonResponse({ error: 'Invalid email address' }, 400);
  }

  // Optional deep-link target: where the user should land after clicking the
  // magic link. Falls back to the group's mapped URL when absent or invalid.
  const redirectPath = redirectRaw ? safeRedirectPath(redirectRaw) : null;
  if (redirectRaw && !redirectPath) {
    log(`ignoring invalid redirect path raw=${JSON.stringify(redirectRaw)}`);
  }

  const domain = email.split('@')[1];
  log(`request for domain=${domain}${redirectPath ? ` redirect=${redirectPath}` : ''}`);

  const { entries, error: mappingError } = await fetchCugMapping(env);
  const match = entries.find((e) => (e.group || '').trim().toLowerCase() === domain);

  if (match) {
    log(`CUG match found group=${match.group} url=${match.url} org=${match.org || '(none)'}`);

    if (!match.url || !match.url.startsWith('/') || match.url.startsWith('//')) {
      logError(`invalid CUG url value: ${match.url}`);
      return jsonResponse({ error: 'Invalid CUG mapping entry' }, 500);
    }

    let token;
    try {
      token = await createMagicLinkToken(email, env);
      log('magic link token created');
    } catch (err) {
      logError(`createMagicLinkToken failed: ${err.message}`);
      return jsonResponse({ error: 'Failed to create magic link token' }, 500);
    }

    // Prefer the caller-supplied deep link (e.g. the page that triggered the
    // login redirect) over the group's default mapped URL.
    const targetPath = redirectPath || match.url;
    const magicLinkUrl = `${new URL(request.url).origin}${appendTokenParam(targetPath, token)}`;
    log(`magic link target=${targetPath}${redirectPath ? ' (from redirect)' : ' (from CUG mapping)'}`);
    const templateName = templateForOrg('magiclink', match.org);
    log(`sending magic link to domain=${domain} template=${templateName}`);

    try {
      await sendMagicLinkConfirm(email, magicLinkUrl, env, templateName);
      log('magic link email dispatched successfully');
    } catch (err) {
      logError(`sendMagicLinkConfirm failed: ${err.message}`);
      return jsonResponse({ error: 'Failed to send magic link email' }, 502);
    }

    const notifyOrg = (match.org || '').trim() || 'Adobe';
    log(`sending internal notification domain=${domain} org=${notifyOrg}`);
    try {
      await sendMagicLinkInternalNotify(email, domain, notifyOrg, env);
      log('internal notification dispatched');
    } catch (err) {
      logError(`sendMagicLinkInternalNotify failed: ${err.message}`);
    }

    return jsonResponse({ result: 'sent' });
  }

  log(`no CUG match for domain=${domain}${mappingError ? ` (mapping error: ${mappingError})` : ''}`);

  try {
    await sendMagicLinkNotFound(email, env);
    log('not-found notification dispatched');
  } catch (err) {
    logError(`sendMagicLinkNotFound failed: ${err.message}`);
    return jsonResponse({ error: 'Failed to send notification email' }, 502);
  }

  return jsonResponse(mappingError
    ? { result: 'not_found', reason: mappingError }
    : { result: 'not_found' });
}
