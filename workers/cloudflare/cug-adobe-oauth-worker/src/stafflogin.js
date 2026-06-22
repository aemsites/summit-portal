import { createSession, sessionCookie, signedInMarkerCookie, EVENT_SESSION_TTL } from './session.js';
import { jsonResponse } from './magiclink.js';

const STAFF_GROUPS = ['adobe.com', 'semrush.com'];
const FAILED_LOGIN_DELAY_MS = 350; // blunt brute-forcing

// eslint-disable-next-line no-console
const log = (...args) => console.log('[stafflogin]', ...args);

/** Lowercase hex SHA-256 of a string. */
export async function sha256hex(str) {
  const data = new TextEncoder().encode(str);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Constant-time string comparison (avoids early-exit timing leaks). */
export function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) {
    // eslint-disable-next-line no-bitwise
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

/**
 * Parse EVENT_STAFF_CREDENTIALS into a username→hash map. Pairs are
 * `username:sha256hex(password)`, separated by newlines or commas.
 */
export function parseCredentials(env) {
  const raw = (env && env.EVENT_STAFF_CREDENTIALS) || '';
  const map = new Map();
  raw.split(/[\n,]+/).forEach((pair) => {
    const trimmed = pair.trim();
    if (!trimmed) return;
    const idx = trimmed.indexOf(':');
    if (idx < 1) return;
    const user = trimmed.slice(0, idx).trim().toLowerCase();
    const hash = trimmed.slice(idx + 1).trim().toLowerCase();
    if (user && hash) map.set(user, hash);
  });
  return map;
}

/**
 * Generic staff credential login. POST { username, password }.
 *
 * Verifies against the EVENT_STAFF_CREDENTIALS secret and, on success, mints a
 * full 4-day staff session (groups adobe.com + semrush.com → opens every
 * customer page) carrying the current EVENT_CRED_EPOCH as a kill-switch claim.
 * Designed for non-managed event iPads that cannot do Adobe SSO/Okta.
 */
export async function handleStaffLoginRequest(request, env) {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  let username;
  let password;
  try {
    const body = await request.json();
    username = typeof body.username === 'string' ? body.username.trim().toLowerCase() : '';
    password = typeof body.password === 'string' ? body.password : '';
  } catch {
    return jsonResponse({ error: 'Invalid request' }, 400);
  }

  const expected = parseCredentials(env).get(username);
  // Always hash the provided password so timing doesn't reveal unknown users.
  const provided = await sha256hex(password);
  const ok = !!expected && timingSafeEqual(provided, expected);

  if (!ok) {
    log(`rejected username=${username || '(empty)'}`);
    await new Promise((resolve) => { setTimeout(resolve, FAILED_LOGIN_DELAY_MS); });
    return jsonResponse({ error: 'Incorrect username or password' }, 401);
  }

  const email = `${username}@adobe.com`;
  const userInfo = {
    email,
    name: username,
    groups: [...STAFF_GROUPS],
    method: 'staff',
    gen_epoch: String((env && env.EVENT_CRED_EPOCH) ?? ''),
  };
  const token = await createSession(env, userInfo, EVENT_SESSION_TTL);
  log(`session minted for ${username} (4-day, epoch=${userInfo.gen_epoch})`);

  const headers = new Headers({ 'Content-Type': 'application/json' });
  headers.append('Set-Cookie', sessionCookie(token, EVENT_SESSION_TTL));
  headers.append('Set-Cookie', signedInMarkerCookie());
  return new Response(JSON.stringify({ result: 'ok' }), { status: 200, headers });
}
