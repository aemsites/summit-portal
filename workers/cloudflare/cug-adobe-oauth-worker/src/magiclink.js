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
    if (!resp.ok) return [];
    const json = await resp.json();
    return Array.isArray(json.data) ? json.data : [];
  } catch {
    return [];
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
  const entries = await fetchCugMapping(env);
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
    try {
      await sendMagicLinkConfirm(email, magicLinkUrl, env);
    } catch {
      return new Response(JSON.stringify({ error: 'Failed to send magic link email' }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ result: 'success' }), {
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
  return new Response(JSON.stringify({ result: 'not_found' }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
