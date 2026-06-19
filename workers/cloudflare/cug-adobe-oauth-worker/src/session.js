/**
 * JWT-based session management.
 *
 * The session is a signed JWT stored in the `auth_token` cookie.
 * No server-side state — verification is done locally via HMAC-SHA256.
 * The SESSIONS KV namespace is still used for PKCE state during OAuth.
 */

const SESSION_TTL = 14400; // 4 hours
const EVENT_SESSION_TTL = 345600; // 4 days — staff/event sessions
const STAFF_DOMAINS_DEFAULT = 'adobe.com,semrush.com';
const COOKIE_NAME = 'auth_token';
const MAGIC_LINK_MAX_AGE = 30 * 60; // 30 minutes in seconds
const SHARE_LINK_TTL = 7 * 24 * 60 * 60; // 7 days in seconds
const MARKER_NAME = 'signed_in';
// Marker outlives the session by a day so a timed-out session still shows the
// "session expired" notice when the user returns to a long-open tab.
const MARKER_MAX_AGE = SESSION_TTL + 86400;

function base64url(bytes) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function base64urlDecode(str) {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (str.length % 4)) % 4);
  const binary = atob(padded);
  return new Uint8Array([...binary].map((c) => c.charCodeAt(0)));
}

async function getSigningKey(secret) {
  const enc = new TextEncoder().encode(secret);
  return crypto.subtle.importKey('raw', enc, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

async function signJwt(payload, secret) {
  const header = base64url(new TextEncoder().encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const body = base64url(new TextEncoder().encode(JSON.stringify(payload)));
  const data = new TextEncoder().encode(`${header}.${body}`);
  const key = await getSigningKey(secret);
  const sig = await crypto.subtle.sign('HMAC', key, data);
  return `${header}.${body}.${base64url(sig)}`;
}

async function verifyJwt(token, secret) {
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [header, body, sig] = parts;
  const data = new TextEncoder().encode(`${header}.${body}`);
  const key = await getSigningKey(secret);
  const sigBytes = base64urlDecode(sig);
  const valid = await crypto.subtle.verify('HMAC', key, sigBytes, data);
  if (!valid) return null;

  const payload = JSON.parse(new TextDecoder().decode(base64urlDecode(body)));
  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;

  return payload;
}

/** The set of internal staff email domains (lowercased). */
export function staffDomains(env) {
  const raw = (env && env.STAFF_DOMAINS) || STAFF_DOMAINS_DEFAULT;
  return new Set(raw.split(',').map((d) => d.trim().toLowerCase()).filter(Boolean));
}

/** True when an email's domain is an internal staff domain. */
export function isStaffEmail(email, env) {
  const domain = (String(email || '').split('@')[1] || '').toLowerCase();
  return staffDomains(env).has(domain);
}

/** Staff logins get the 4-day event TTL; everyone else the short default. */
export function sessionTtlForEmail(email, env) {
  return isStaffEmail(email, env) ? EVENT_SESSION_TTL : SESSION_TTL;
}

export { EVENT_SESSION_TTL };

/** Create a signed JWT containing the user info. Returns the token string. */
export async function createSession(env, userInfo, ttl = SESSION_TTL) {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    email: userInfo.email,
    name: userInfo.name,
    groups: userInfo.groups,
    iat: now,
    exp: now + ttl,
  };
  // Generic-credential sessions carry a kill-switch epoch; real-staff sessions do not.
  if (userInfo.gen_epoch !== undefined && userInfo.gen_epoch !== null) {
    payload.gen_epoch = String(userInfo.gen_epoch);
  }
  return signJwt(payload, env.JWT_SECRET);
}

/** Verify the JWT from the cookie. Returns the payload or null. */
export async function getSession(request, env) {
  const cookie = request.headers.get('Cookie') || '';
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^\\s;]+)`));
  if (!match) return null;

  const payload = await verifyJwt(match[1], env.JWT_SECRET);
  if (!payload) return null;

  // Kill switch: a generic-credential token is only valid while its baked-in
  // epoch matches the current env value. Bumping EVENT_CRED_EPOCH revokes all
  // generic sessions at once. Real-staff tokens carry no gen_epoch.
  if (payload.gen_epoch !== undefined) {
    const current = String((env && env.EVENT_CRED_EPOCH) ?? '');
    if (String(payload.gen_epoch) !== current) return null;
  }

  return payload;
}

export function sessionCookie(token, maxAge = SESSION_TTL) {
  return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

export function clearSessionCookie() {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

/**
 * Non-HttpOnly companion cookie: a boolean hint that the user was signed in, so
 * client JS can tell "anonymous" from "session lapsed". Carries NO identity or
 * authorization — every access decision still uses the signed auth_token.
 */
export function signedInMarkerCookie() {
  return `${MARKER_NAME}=1; Path=/; Secure; SameSite=Lax; Max-Age=${MARKER_MAX_AGE}`;
}

export function clearSignedInMarkerCookie() {
  return `${MARKER_NAME}=; Path=/; Secure; SameSite=Lax; Max-Age=0`;
}

/** Create a signed JWT for use as a magic link. Valid for 30 minutes. */
export async function createMagicLinkToken(email, env) {
  const now = Math.floor(Date.now() / 1000);
  return signJwt({ purpose: 'magiclink', email, iat: now }, env.JWT_SECRET);
}

/**
 * Verify a magic link JWT produced by createMagicLinkToken.
 * Tokens carry `email` and `iat` but no `exp` — freshness is enforced
 * by the iat-age check (max 30 minutes).
 * Returns the payload when valid; null otherwise.
 */
export async function verifyMagicLink(token, env) {
  const payload = await verifyJwt(token, env.JWT_SECRET);
  if (!payload || !payload.email || payload.purpose !== 'magiclink') return null;

  const now = Math.floor(Date.now() / 1000);
  if (!payload.iat || payload.iat > now || now - payload.iat > MAGIC_LINK_MAX_AGE) return null;

  return payload;
}

/**
 * Create a signed JWT for a staff-shared link. Unlike the self-service magic
 * link (30-min iat freshness), share links carry an explicit `exp` and are
 * valid for 7 days so a customer can open the link after the booth hand-off.
 *
 * `grantGroups` (optional) are CUG groups baked into the link so the recipient's
 * session can open the page even when their own email domain isn't in the page's
 * CUG — used when staff share a page with another internal (Adobe/Semrush) email
 * so they can review it. The session still also includes the recipient's own
 * domain group. Only the authenticated staff share endpoint sets this.
 */
export async function createShareLinkToken(email, env, grantGroups = []) {
  const now = Math.floor(Date.now() / 1000);
  const payload = { purpose: 'sharelink', email, iat: now, exp: now + SHARE_LINK_TTL };
  if (Array.isArray(grantGroups) && grantGroups.length) payload.groups = grantGroups;
  return signJwt(payload, env.JWT_SECRET);
}

/**
 * Verify a share link JWT produced by createShareLinkToken.
 * Freshness is enforced by the standard `exp` check inside verifyJwt.
 * Returns the payload when valid; null otherwise.
 */
export async function verifyShareLink(token, env) {
  const payload = await verifyJwt(token, env.JWT_SECRET);
  if (!payload || !payload.email || payload.purpose !== 'sharelink') return null;
  return payload;
}
