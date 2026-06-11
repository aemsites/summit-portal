import { createMagicLinkToken } from './session.js';
import { sendMagicLinkConfirm, sendMagicLinkInternalNotify, sendMagicLinkNotFound } from './notification.js';

const MAPPING_PATH = '/closed-user-groups-mapping.json';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// eslint-disable-next-line no-console
const log = (...args) => console.log('[magiclink]', ...args);
// eslint-disable-next-line no-console
const logError = (...args) => console.error('[magiclink]', ...args);

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
  try {
    const body = await request.json();
    email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
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

  const domain = email.split('@')[1];
  log(`request for domain=${domain}`);

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

    const magicLinkUrl = `${new URL(request.url).origin}${match.url}?token=${token}`;
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
