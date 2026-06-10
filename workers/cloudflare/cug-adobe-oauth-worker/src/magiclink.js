import { createMagicLinkToken } from './session.js';
import { sendMagicLinkConfirm, sendMagicLinkNotFound } from './notification.js';

const MAPPING_PATH = '/closed-user-groups-mapping.json';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function fetchCugMapping(env) {
  const url = `https://${env.ORIGIN_HOSTNAME}${MAPPING_PATH}`;
  const headers = {};
  if (env.ORIGIN_AUTHENTICATION) headers.authorization = `token ${env.ORIGIN_AUTHENTICATION}`;
  try {
    const resp = await fetch(url, { headers });
    if (!resp.ok) return { error: `mapping fetch failed (${resp.status})`, entries: [] };
    const json = await resp.json();
    return { entries: Array.isArray(json.data) ? json.data : [] };
  } catch (err) {
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
  const { entries, error: mappingError } = await fetchCugMapping(env);
  const match = entries.find((e) => (e.group || '').trim().toLowerCase() === domain);

  if (match) {
    // Guard against absolute URLs or missing paths in the CUG mapping
    if (!match.url || !match.url.startsWith('/') || match.url.startsWith('//')) {
      return new Response(JSON.stringify({ error: 'Invalid CUG mapping entry' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    const token = await createMagicLinkToken(email, env);
    const magicLinkUrl = `${new URL(request.url).origin}${match.url}?token=${token}`;
    const org = (match.org || '').trim().toLowerCase();
    const templateName = org === 'semrush' ? 'expdev_actnow_magiclink_semrush' : 'expdev_actnow_magiclink';
    // eslint-disable-next-line no-console
    console.log(`[magiclink] sending magic link to domain=${domain} template=${templateName}`);
    try {
      await sendMagicLinkConfirm(email, magicLinkUrl, env, templateName);
    } catch {
      return new Response(JSON.stringify({ error: 'Failed to send magic link email' }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ result: 'sent' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    await sendMagicLinkNotFound(email, env);
  } catch {
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
