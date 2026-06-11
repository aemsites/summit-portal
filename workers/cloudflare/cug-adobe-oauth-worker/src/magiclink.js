import { createMagicLinkToken } from './session.js';
import { sendMagicLinkConfirm, sendMagicLinkInternalNotify, sendMagicLinkNotFound } from './notification.js';

const MAPPING_PATH = '/closed-user-groups-mapping.json';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Reject characters that could break out of the URL or smuggle CRLF.
// eslint-disable-next-line no-control-regex
const UNSAFE_PATH_RE = /[\u0000-\u001F\u007F\s\\]/;

// eslint-disable-next-line no-console
const log = (...args) => console.log('[magiclink]', ...args);
// eslint-disable-next-line no-console
const logError = (...args) => console.error('[magiclink]', ...args);

/**
 * Validate a caller-supplied redirect path. Must be a same-origin path:
 *   - starts with '/' (not '//' which would be protocol-relative)
 *   - contains no control characters, whitespace, or backslashes
 *   - parses as a relative URL
 * Returns the cleaned path+search (no fragment) or null when invalid.
 */
function safeRedirectPath(raw) {
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
function appendTokenParam(path, token) {
  const separator = path.includes('?') ? '&' : '?';
  return `${path}${separator}token=${token}`;
}

async function fetchCugMapping(env) {
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
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!EMAIL_RE.test(email)) {
    return new Response(JSON.stringify({ error: 'Invalid email address' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
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
      return new Response(JSON.stringify({ error: 'Invalid CUG mapping entry' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    let token;
    try {
      token = await createMagicLinkToken(email, env);
      log('magic link token created');
    } catch (err) {
      logError(`createMagicLinkToken failed: ${err.message}`);
      return new Response(JSON.stringify({ error: 'Failed to create magic link token' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Prefer the caller-supplied deep link (e.g. the page that triggered the
    // login redirect) over the group's default mapped URL.
    const targetPath = redirectPath || match.url;
    const magicLinkUrl = `${new URL(request.url).origin}${appendTokenParam(targetPath, token)}`;
    log(`magic link target=${targetPath}${redirectPath ? ' (from redirect)' : ' (from CUG mapping)'}`);
    const org = (match.org || '').trim().toLowerCase();
    const templateName = org === 'semrush' ? 'expdev_actnow_magiclink_semrush' : 'expdev_actnow_magiclink';
    log(`sending magic link to domain=${domain} template=${templateName}`);

    try {
      await sendMagicLinkConfirm(email, magicLinkUrl, env, templateName);
      log('magic link email dispatched successfully');
    } catch (err) {
      logError(`sendMagicLinkConfirm failed: ${err.message}`);
      return new Response(JSON.stringify({ error: 'Failed to send magic link email' }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const notifyOrg = (match.org || '').trim() || 'Adobe';
    log(`sending internal notification domain=${domain} org=${notifyOrg}`);
    try {
      await sendMagicLinkInternalNotify(email, domain, notifyOrg, env);
      log('internal notification dispatched');
    } catch (err) {
      logError(`sendMagicLinkInternalNotify failed: ${err.message}`);
    }

    return new Response(JSON.stringify({ result: 'sent' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  log(`no CUG match for domain=${domain}${mappingError ? ` (mapping error: ${mappingError})` : ''}`);

  try {
    await sendMagicLinkNotFound(email, env);
    log('not-found notification dispatched');
  } catch (err) {
    logError(`sendMagicLinkNotFound failed: ${err.message}`);
    return new Response(JSON.stringify({ error: 'Failed to send notification email' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const body = mappingError
    ? { result: 'not_found', reason: mappingError }
    : { result: 'not_found' };
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
  });
}
