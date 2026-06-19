# Cannes On-Site iPad Access Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Adobe/Semrush field staff log into shared, non-managed iPads at Cannes 2026 without Okta, and stay logged in for the whole 4-day event, so they can search and open any customer's report and share it.

**Architecture:** All work lives in the Cloudflare auth worker (`workers/cloudflare/cug-adobe-oauth-worker/`) plus the login block. We add (1) a 4-day session TTL applied to staff-domain logins, (2) a new `POST /auth/staff-login` endpoint that verifies a generic username/password against a worker secret and mints a full staff session, (3) an epoch "kill switch" claim to revoke all generic sessions at once, and (4) a de-emphasized staff-login form in the login UI. No CUG-row edits — staff domains (`adobe.com`, `semrush.com`) are already in every customer page's CUG, so a staff session already opens every report.

**Tech Stack:** Cloudflare Workers (ES modules, Web Crypto `crypto.subtle`), Vitest, vanilla JS blocks (ak.js), Airbnb ESLint.

## Global Constraints

- **Staff domains:** `adobe.com, semrush.com` — the same set `sharelink.js` already gates on (`STAFF_DOMAINS` env, default `adobe.com,semrush.com`).
- **Event session TTL:** `EVENT_SESSION_TTL = 345600` seconds (4 days). Applies to ALL staff-domain logins (generic credential, Adobe ID OAuth, staff magic link). Customer magic-link sessions keep `SESSION_TTL = 14400` (4h).
- **Generic account scope:** FULL — synthetic identity `<username>@adobe.com` so it passes the share-link staff gate.
- **Kill switch:** generic-login tokens carry a `gen_epoch` claim equal to `env.EVENT_CRED_EPOCH`; a request whose token's `gen_epoch` ≠ current env value is rejected. Real-staff tokens carry no `gen_epoch` and are unaffected.
- **Secrets never in repo:** `EVENT_STAFF_CREDENTIALS` is a worker secret (`wrangler secret put`). Stored as `username:sha256hex(password)` pairs, separated by newlines or commas.
- **Run tests from:** `workers/cloudflare/cug-adobe-oauth-worker/` with `npm test` (alias `vitest run`).
- **Lint:** `npm run lint` from repo root must pass (Airbnb + stylelint). `.js` extensions required in imports.

---

## File Structure

- `src/session.js` (modify) — owns session minting/verification. Adds `EVENT_SESSION_TTL`, optional `ttl` on `createSession`, optional `maxAge` on `sessionCookie`, the staff-domain helpers (`staffDomains`, `isStaffEmail`, `sessionTtlForEmail`), the `gen_epoch` claim write, and the `gen_epoch` reject in `getSession`.
- `src/sharelink.js` (modify) — drop its private `DEFAULT_STAFF_DOMAINS`/`staffDomains` and import `staffDomains` from `session.js` (DRY — single owner of the staff-domain set).
- `src/stafflogin.js` (create) — the `/auth/staff-login` handler + its helpers (`sha256hex`, `timingSafeEqual`, `parseCredentials`).
- `src/index.js` (modify) — route `/auth/staff-login`; apply `sessionTtlForEmail` on the OAuth callback and magic-`?token=` session-minting paths.
- `wrangler.toml` (modify) — add `EVENT_CRED_EPOCH` var to `[vars]` and `[env.summit.vars]`; document the `EVENT_STAFF_CREDENTIALS` secret.
- `blocks/portal-login/portal-login.js` (modify) + `blocks/portal-login/portal-login.css` (modify) — append a collapsible "Event staff access" username/password form posting to `/auth/staff-login`.
- Tests: `test/session.test.js` (modify), `test/stafflogin.test.js` (create), `test/index.test.js` (modify).
- `PROJECT.md` (modify) — document the on-site access model.

---

## Task 1: Session TTL, staff helpers, and epoch kill-switch (`session.js`)

**Files:**
- Modify: `workers/cloudflare/cug-adobe-oauth-worker/src/session.js`
- Modify: `workers/cloudflare/cug-adobe-oauth-worker/src/sharelink.js`
- Test: `workers/cloudflare/cug-adobe-oauth-worker/test/session.test.js`

**Interfaces:**
- Produces:
  - `export const EVENT_SESSION_TTL = 345600`
  - `export function staffDomains(env): Set<string>`
  - `export function isStaffEmail(email: string, env): boolean`
  - `export function sessionTtlForEmail(email: string, env): number`
  - `createSession(env, userInfo, ttl = SESSION_TTL)` — `userInfo` may include `gen_epoch` (string); when present it is written to the JWT payload as `gen_epoch`.
  - `sessionCookie(token, maxAge = SESSION_TTL)` — `Max-Age` uses `maxAge`.
  - `getSession(request, env)` — returns `null` when the token carries a `gen_epoch` that ≠ `String(env.EVENT_CRED_EPOCH ?? '')`.
- Consumes: existing `signJwt`, `verifyJwt`, `SESSION_TTL`, `COOKIE_NAME`.

- [ ] **Step 1: Write failing tests in `test/session.test.js`**

Append these tests (the file already imports from `../src/session.js` and `./helpers.js`; add the new symbols to the existing import line):

```javascript
import {
  createSession, getSession, sessionCookie,
  EVENT_SESSION_TTL, staffDomains, isStaffEmail, sessionTtlForEmail,
} from '../src/session.js';

describe('staff-domain helpers', () => {
  it('treats adobe.com and semrush.com as staff by default', () => {
    const env = createMockEnv();
    expect(isStaffEmail('a@adobe.com', env)).toBe(true);
    expect(isStaffEmail('b@semrush.com', env)).toBe(true);
    expect(isStaffEmail('c@apple.com', env)).toBe(false);
  });

  it('sessionTtlForEmail returns 4 days for staff, default for others', () => {
    const env = createMockEnv();
    expect(sessionTtlForEmail('a@adobe.com', env)).toBe(EVENT_SESSION_TTL);
    expect(sessionTtlForEmail('c@apple.com', env)).toBe(14400);
  });

  it('staffDomains honours STAFF_DOMAINS override', () => {
    const env = createMockEnv({ STAFF_DOMAINS: 'foo.com' });
    expect(staffDomains(env).has('foo.com')).toBe(true);
    expect(isStaffEmail('a@adobe.com', env)).toBe(false);
  });
});

describe('createSession ttl + gen_epoch', () => {
  it('honours an explicit ttl in the JWT exp', async () => {
    const env = createMockEnv();
    const token = await createSession(env, { email: 'a@adobe.com', name: 'A', groups: ['adobe.com'] }, EVENT_SESSION_TTL);
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    expect(payload.exp - payload.iat).toBe(EVENT_SESSION_TTL);
    expect(payload.gen_epoch).toBeUndefined();
  });

  it('writes gen_epoch when present on userInfo', async () => {
    const env = createMockEnv();
    const token = await createSession(env, { email: 'a@adobe.com', name: 'A', groups: ['adobe.com'], gen_epoch: '1' }, EVENT_SESSION_TTL);
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    expect(payload.gen_epoch).toBe('1');
  });
});

describe('sessionCookie maxAge', () => {
  it('uses the provided maxAge', () => {
    expect(sessionCookie('tok', EVENT_SESSION_TTL)).toContain(`Max-Age=${EVENT_SESSION_TTL}`);
  });
  it('defaults to the 4h session TTL', () => {
    expect(sessionCookie('tok')).toContain('Max-Age=14400');
  });
});

describe('getSession gen_epoch kill switch', () => {
  function cookieReq(token) {
    return new Request('https://mysite.com/x', { headers: { Cookie: `auth_token=${token}` } });
  }
  it('accepts a token whose gen_epoch matches env', async () => {
    const env = createMockEnv({ EVENT_CRED_EPOCH: '2' });
    const token = await createSession(env, { email: 'a@adobe.com', name: 'A', groups: ['adobe.com'], gen_epoch: '2' }, EVENT_SESSION_TTL);
    const session = await getSession(cookieReq(token), env);
    expect(session?.email).toBe('a@adobe.com');
  });
  it('rejects a token whose gen_epoch no longer matches env', async () => {
    const env = createMockEnv({ EVENT_CRED_EPOCH: '2' });
    const token = await createSession(env, { email: 'a@adobe.com', name: 'A', groups: ['adobe.com'], gen_epoch: '1' }, EVENT_SESSION_TTL);
    const session = await getSession(cookieReq(token), { ...env, EVENT_CRED_EPOCH: '2' });
    expect(session).toBeNull();
  });
  it('leaves tokens without gen_epoch untouched', async () => {
    const env = createMockEnv({ EVENT_CRED_EPOCH: '2' });
    const token = await createSession(env, { email: 'a@adobe.com', name: 'A', groups: ['adobe.com'] }, EVENT_SESSION_TTL);
    const session = await getSession(cookieReq(token), env);
    expect(session?.email).toBe('a@adobe.com');
  });
});
```

- [ ] **Step 2: Run the new tests to verify they fail**

Run: `cd workers/cloudflare/cug-adobe-oauth-worker && npx vitest run test/session.test.js`
Expected: FAIL — `EVENT_SESSION_TTL`/`staffDomains`/`isStaffEmail`/`sessionTtlForEmail` are not exported; ttl/maxAge/gen_epoch behaviors absent.

- [ ] **Step 3: Implement in `session.js`**

Add the constant and helpers near the top (after the existing `const SHARE_LINK_TTL = ...` line, before `base64url`):

```javascript
const EVENT_SESSION_TTL = 345600; // 4 days — staff/event sessions
const STAFF_DOMAINS_DEFAULT = 'adobe.com,semrush.com';

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
```

Change `createSession` to accept a ttl and copy `gen_epoch`:

```javascript
export async function createSession(env, userInfo, ttl = SESSION_TTL) {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    email: userInfo.email,
    name: userInfo.name,
    groups: userInfo.groups,
    iat: now,
    exp: now + ttl,
  };
  if (userInfo.gen_epoch !== undefined && userInfo.gen_epoch !== null) {
    payload.gen_epoch = String(userInfo.gen_epoch);
  }
  return signJwt(payload, env.JWT_SECRET);
}
```

Change `sessionCookie` to take a maxAge:

```javascript
export function sessionCookie(token, maxAge = SESSION_TTL) {
  return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}
```

Change `getSession` to enforce the epoch:

```javascript
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
```

- [ ] **Step 4: DRY the staff-domain set into `sharelink.js`**

In `sharelink.js`, delete the local `DEFAULT_STAFF_DOMAINS` constant and the local `staffDomains` function, and import the shared one. Update the import block:

```javascript
import { getSession, createShareLinkToken, staffDomains } from './session.js';
```

The existing call site `staffDomains(env).has(callerDomain)` keeps working unchanged.

- [ ] **Step 5: Run the full worker suite to verify pass + no regressions**

Run: `cd workers/cloudflare/cug-adobe-oauth-worker && npm test`
Expected: PASS — new session tests green; existing `sharelink`/`index`/`session` tests still green (sharelink now uses the imported `staffDomains`).

- [ ] **Step 6: Commit**

```bash
git add workers/cloudflare/cug-adobe-oauth-worker/src/session.js \
        workers/cloudflare/cug-adobe-oauth-worker/src/sharelink.js \
        workers/cloudflare/cug-adobe-oauth-worker/test/session.test.js
git commit -m "feat(worker): 4-day staff session TTL, staff-domain helpers, epoch kill-switch

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Generic staff-login endpoint (`stafflogin.js`)

**Files:**
- Create: `workers/cloudflare/cug-adobe-oauth-worker/src/stafflogin.js`
- Test: `workers/cloudflare/cug-adobe-oauth-worker/test/stafflogin.test.js`
- Modify: `workers/cloudflare/cug-adobe-oauth-worker/wrangler.toml`

**Interfaces:**
- Consumes: `createSession`, `sessionCookie`, `signedInMarkerCookie`, `EVENT_SESSION_TTL` from `session.js`; `jsonResponse` from `magiclink.js`.
- Produces:
  - `export async function sha256hex(str: string): Promise<string>` — lowercase hex SHA-256.
  - `export function timingSafeEqual(a: string, b: string): boolean` — constant-time string compare.
  - `export function parseCredentials(env): Map<string,string>` — `username → sha256hex(password)`.
  - `export async function handleStaffLoginRequest(request, env): Promise<Response>` — `POST {username, password}` → on success sets `auth_token` (4-day, `gen_epoch`) + `signed_in` cookies and returns `{result:'ok'}`; on failure returns `401 {error}`.

- [ ] **Step 1: Write failing tests in `test/stafflogin.test.js`**

```javascript
import {
  describe, it, expect, beforeEach, vi,
} from 'vitest';
import {
  handleStaffLoginRequest, sha256hex, timingSafeEqual, parseCredentials,
} from '../src/stafflogin.js';
import { getSession } from '../src/session.js';
import { createMockEnv } from './helpers.js';

function postLogin(body) {
  return new Request('https://mysite.com/auth/staff-login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// auth_token cookie value out of a Set-Cookie header list
function authTokenFrom(resp) {
  const cookies = resp.headers.getSetCookie ? resp.headers.getSetCookie() : [resp.headers.get('set-cookie')];
  const line = cookies.find((c) => c && c.startsWith('auth_token='));
  return line ? line.split(';')[0].slice('auth_token='.length) : null;
}

describe('stafflogin helpers', () => {
  it('sha256hex matches a known vector', async () => {
    // echo -n "secret" | shasum -a 256
    expect(await sha256hex('secret')).toBe('2bb80d537b1da3e38bd30361aa855686bde0eacd7162fef6a25fe97bf527a25b');
  });
  it('timingSafeEqual compares correctly', () => {
    expect(timingSafeEqual('abc', 'abc')).toBe(true);
    expect(timingSafeEqual('abc', 'abd')).toBe(false);
    expect(timingSafeEqual('abc', 'abcd')).toBe(false);
  });
  it('parseCredentials parses newline and comma separated pairs', () => {
    const env = { EVENT_STAFF_CREDENTIALS: 'cannes-ipad:HASH1\nbooth2:HASH2, x:HASH3' };
    const map = parseCredentials(env);
    expect(map.get('cannes-ipad')).toBe('hash1');
    expect(map.get('booth2')).toBe('hash2');
    expect(map.get('x')).toBe('hash3');
  });
});

describe('handleStaffLoginRequest', () => {
  let env;
  beforeEach(async () => {
    env = createMockEnv({
      EVENT_STAFF_CREDENTIALS: `cannes-ipad:${await sha256hex('letmein')}`,
      EVENT_CRED_EPOCH: '3',
    });
  });

  it('rejects non-POST', async () => {
    const resp = await handleStaffLoginRequest(new Request('https://mysite.com/auth/staff-login'), env);
    expect(resp.status).toBe(405);
  });

  it('mints a 4-day full-staff session on valid credentials', async () => {
    const resp = await handleStaffLoginRequest(postLogin({ username: 'cannes-ipad', password: 'letmein' }), env);
    expect(resp.status).toBe(200);
    const token = authTokenFrom(resp);
    expect(token).toBeTruthy();
    const session = await getSession(
      new Request('https://mysite.com/x', { headers: { Cookie: `auth_token=${token}` } }),
      env,
    );
    expect(session.email).toBe('cannes-ipad@adobe.com');
    expect(session.groups).toEqual(['adobe.com', 'semrush.com']);
    expect(session.exp - session.iat).toBe(345600);
    expect(session.gen_epoch).toBe('3');
  });

  it('rejects a wrong password', async () => {
    const resp = await handleStaffLoginRequest(postLogin({ username: 'cannes-ipad', password: 'nope' }), env);
    expect(resp.status).toBe(401);
    expect(authTokenFrom(resp)).toBeNull();
  });

  it('rejects an unknown username', async () => {
    const resp = await handleStaffLoginRequest(postLogin({ username: 'ghost', password: 'letmein' }), env);
    expect(resp.status).toBe(401);
  });

  it('rejects invalid JSON', async () => {
    const req = new Request('https://mysite.com/auth/staff-login', { method: 'POST', body: '{' });
    const resp = await handleStaffLoginRequest(req, env);
    expect(resp.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd workers/cloudflare/cug-adobe-oauth-worker && npx vitest run test/stafflogin.test.js`
Expected: FAIL — module `../src/stafflogin.js` does not exist.

- [ ] **Step 3: Implement `src/stafflogin.js`**

```javascript
import {
  createSession, sessionCookie, signedInMarkerCookie, EVENT_SESSION_TTL,
} from './session.js';
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
  for (let i = 0; i < a.length; i += 1) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
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
    gen_epoch: String((env && env.EVENT_CRED_EPOCH) ?? ''),
  };
  const token = await createSession(env, userInfo, EVENT_SESSION_TTL);
  log(`session minted for ${username} (4-day, epoch=${userInfo.gen_epoch})`);

  const headers = new Headers({ 'Content-Type': 'application/json' });
  headers.append('Set-Cookie', sessionCookie(token, EVENT_SESSION_TTL));
  headers.append('Set-Cookie', signedInMarkerCookie());
  return new Response(JSON.stringify({ result: 'ok' }), { status: 200, headers });
}
```

- [ ] **Step 4: Run to verify pass**

Run: `cd workers/cloudflare/cug-adobe-oauth-worker && npx vitest run test/stafflogin.test.js`
Expected: PASS (all cases). If `getSetCookie` is unavailable in the test runtime, the helper falls back to the single `set-cookie` header; the token assertions still pass because `auth_token` is appended first.

- [ ] **Step 5: Add config to `wrangler.toml`**

Under the top-level `[vars]` block (after `ENVIRONMENT = "stage"`), add:

```toml
EVENT_CRED_EPOCH = "1"
```

Under `[env.summit.vars]` (after `ENVIRONMENT = "prod"`), add:

```toml
EVENT_CRED_EPOCH = "1"
```

In BOTH secret-comment blocks, add a line documenting the new secret, e.g. after the `# JWT_SECRET = "..."` comment:

```toml
# EVENT_STAFF_CREDENTIALS = "..."  (newline/comma list of username:sha256hex(password) for on-site iPad logins)
```

- [ ] **Step 6: Commit**

```bash
git add workers/cloudflare/cug-adobe-oauth-worker/src/stafflogin.js \
        workers/cloudflare/cug-adobe-oauth-worker/test/stafflogin.test.js \
        workers/cloudflare/cug-adobe-oauth-worker/wrangler.toml
git commit -m "feat(worker): generic staff-login endpoint for event iPads

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Wire the route and apply staff TTL on existing logins (`index.js`)

**Files:**
- Modify: `workers/cloudflare/cug-adobe-oauth-worker/src/index.js`
- Test: `workers/cloudflare/cug-adobe-oauth-worker/test/index.test.js`

**Interfaces:**
- Consumes: `handleStaffLoginRequest` from `stafflogin.js`; `sessionTtlForEmail` from `session.js`.
- Produces: routes `POST /auth/staff-login`; OAuth-callback and magic-`?token=` paths now mint sessions whose TTL/cookie maxAge come from `sessionTtlForEmail(email, env)`.

- [ ] **Step 1: Write failing tests in `test/index.test.js`**

Add a describe block (the file already imports `worker`, `createMockEnv`, `signedJwt`). Add `EVENT_SESSION_TTL` to a `session.js` import if needed, and a helper to read the cookie like in Task 2:

```javascript
describe('staff-login route', () => {
  it('routes POST /auth/staff-login and mints a session', async () => {
    const { sha256hex } = await import('../src/stafflogin.js');
    const env = createMockEnv({
      EVENT_STAFF_CREDENTIALS: `cannes:${await sha256hex('pw')}`,
      EVENT_CRED_EPOCH: '1',
    });
    const req = new Request('https://mysite.com/auth/staff-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'cannes', password: 'pw' }),
    });
    const resp = await worker.fetch(req, env);
    expect(resp.status).toBe(200);
    const setCookie = resp.headers.getSetCookie ? resp.headers.getSetCookie().join(';') : resp.headers.get('set-cookie');
    expect(setCookie).toContain('auth_token=');
    expect(setCookie).toContain('Max-Age=345600');
  });
});
```

For the OAuth-callback TTL, locate the existing callback test (around `test/index.test.js:160`) that asserts a session is created, and add an assertion that the `auth_token` cookie for an `@adobe.com` user has `Max-Age=345600`. If the existing test mocks `handleCallback` to return `userInfo` with an adobe.com email, assert the long maxAge; if it uses a non-staff email, add a sibling test with an `@adobe.com` userInfo expecting `Max-Age=345600` and keep/clone one with a customer email expecting `Max-Age=14400`.

- [ ] **Step 2: Run to verify failure**

Run: `cd workers/cloudflare/cug-adobe-oauth-worker && npx vitest run test/index.test.js`
Expected: FAIL — no `/auth/staff-login` route (falls through to proxy/CUG); callback cookie still `Max-Age=14400`.

- [ ] **Step 3: Implement in `index.js`**

Add to the imports from `./session.js` (the existing multi-line import): `sessionTtlForEmail`. Add a new import:

```javascript
import { handleStaffLoginRequest } from './stafflogin.js';
```

Add the route immediately after the `/auth/sharelink` block (after line ~128):

```javascript
  // Generic staff credential login for on-site event iPads (no Okta).
  if (url.pathname === '/auth/staff-login') {
    return handleStaffLoginRequest(request, env);
  }
```

In the OAuth callback block, apply the staff TTL:

```javascript
  if (url.pathname === '/auth/callback') {
    const result = await handleCallback(request, env);
    if (result instanceof Response) return result;

    const ttl = sessionTtlForEmail(result.userInfo.email, env);
    const token = await createSession(env, result.userInfo, ttl);
    const headers = new Headers({ Location: result.originalUrl });
    headers.append('Set-Cookie', sessionCookie(token, ttl));
    headers.append('Set-Cookie', signedInMarkerCookie());
    return new Response(null, { status: 302, headers });
  }
```

In the magic-`?token=` block, apply the staff TTL when minting the session (replace the `createSession(...)` + `sessionCookie(newToken)` lines):

```javascript
    const ttl = sessionTtlForEmail(email, env);
    const newToken = await createSession(env, { email, name: claims.name || email, groups }, ttl);

    const cleanUrl = new URL(url.href);
    cleanUrl.searchParams.delete('token');
    // eslint-disable-next-line no-console
    console.log(`[magiclink] session created, redirecting to ${cleanUrl.pathname}`);

    const headers = new Headers({ Location: cleanUrl.href });
    headers.append('Set-Cookie', sessionCookie(newToken, ttl));
    headers.append('Set-Cookie', signedInMarkerCookie());
    return new Response(null, { status: 302, headers });
```

- [ ] **Step 4: Run the full suite**

Run: `cd workers/cloudflare/cug-adobe-oauth-worker && npm test`
Expected: PASS — staff-login route works; staff-domain logins get `Max-Age=345600`; customer magic-link sessions keep `Max-Age=14400`.

- [ ] **Step 5: Lint the worker changes**

Run: `cd /Users/josec/code/summit-portal && npm run lint`
Expected: no errors in the worker files (fix any Airbnb issues, e.g. import ordering).

- [ ] **Step 6: Commit**

```bash
git add workers/cloudflare/cug-adobe-oauth-worker/src/index.js \
        workers/cloudflare/cug-adobe-oauth-worker/test/index.test.js
git commit -m "feat(worker): route /auth/staff-login and apply staff session TTL

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Login UI — "Event staff access" form (`portal-login`)

**Files:**
- Modify: `blocks/portal-login/portal-login.js`
- Modify: `blocks/portal-login/portal-login.css`

**Interfaces:**
- Consumes: `POST /auth/staff-login` (same-origin), `getRedirectPath()` (already in the file).
- Produces: a collapsible staff-access form appended to the login block; on success it navigates to the redirect path or `/adobe/dashboard`.

No worker test here — this is browser JS. Verified manually in Step 4.

- [ ] **Step 1: Add the staff-login form builder + handler to `portal-login.js`**

Add a constant near the top (after `MAGIC_LINK_ENDPOINT`):

```javascript
const STAFF_LOGIN_ENDPOINT = '/auth/staff-login';
```

Add these functions above `export default function init`:

```javascript
function createStaffForm() {
  const details = document.createElement('details');
  details.className = 'pl-staff';

  const summary = document.createElement('summary');
  summary.className = 'pl-staff-summary';
  summary.textContent = 'Event staff access';
  details.append(summary);

  const form = document.createElement('form');
  form.className = 'pl-staff-form';

  const userLabel = document.createElement('label');
  userLabel.className = 'pl-label';
  userLabel.htmlFor = 'pl-staff-user';
  userLabel.textContent = 'Username';
  const userInput = document.createElement('input');
  userInput.className = 'pl-input';
  userInput.type = 'text';
  userInput.id = 'pl-staff-user';
  userInput.name = 'username';
  userInput.autocomplete = 'username';
  userInput.required = true;

  const passLabel = document.createElement('label');
  passLabel.className = 'pl-label';
  passLabel.htmlFor = 'pl-staff-pass';
  passLabel.textContent = 'Password';
  const passInput = document.createElement('input');
  passInput.className = 'pl-input';
  passInput.type = 'password';
  passInput.id = 'pl-staff-pass';
  passInput.name = 'password';
  passInput.autocomplete = 'current-password';
  passInput.required = true;

  const btn = document.createElement('button');
  btn.className = 'pl-submit';
  btn.type = 'submit';
  btn.textContent = 'Sign in';

  const error = document.createElement('p');
  error.className = 'pl-error';
  error.setAttribute('role', 'alert');
  error.hidden = true;
  error.textContent = 'Incorrect username or password.';

  form.append(userLabel, userInput, passLabel, passInput, btn, error);
  details.append(form);
  return { details, form };
}

function attachStaffHandler(form) {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = form.querySelector('#pl-staff-user').value.trim();
    const password = form.querySelector('#pl-staff-pass').value;
    const btn = form.querySelector('.pl-submit');
    const errorEl = form.querySelector('.pl-error');

    errorEl.hidden = true;
    btn.disabled = true;
    btn.textContent = 'Signing in…';

    try {
      const resp = await fetch(STAFF_LOGIN_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      window.location.assign(getRedirectPath() || '/adobe/dashboard');
    } catch {
      btn.disabled = false;
      btn.textContent = 'Sign in';
      errorEl.hidden = false;
    }
  });
}
```

In `init`, after `injectDivider(row);`, append the staff form to the block element:

```javascript
  const { details, form: staffForm } = createStaffForm();
  el.append(details);
  attachStaffHandler(staffForm);
```

- [ ] **Step 2: Add styles to `portal-login.css`**

Append:

```css
.portal-login .pl-staff {
  margin-top: 24px;
  padding-top: 16px;
  border-top: 1px solid light-dark(#e0e0e0, #333);
  max-width: 360px;
}

.portal-login .pl-staff-summary {
  cursor: pointer;
  font-size: 0.85rem;
  color: light-dark(#6e6e6e, #9b9b9b);
  list-style: none;
}

.portal-login .pl-staff-summary::-webkit-details-marker {
  display: none;
}

.portal-login .pl-staff-form {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 12px;
}
```

- [ ] **Step 3: Lint**

Run: `cd /Users/josec/code/summit-portal && npm run lint`
Expected: PASS (no JS or CSS lint errors in the portal-login files).

- [ ] **Step 4: Manual smoke test (best-effort, document result)**

Because the staff endpoint is served by the deployed worker (not the local AEM CLI), full end-to-end requires a deployed worker with `EVENT_STAFF_CREDENTIALS` set. At minimum, preview `http://localhost:3000/login` (or wherever the portal-login block is authored) and confirm with a Playwright snapshot/evaluate that:
- the "Event staff access" disclosure renders below the existing options,
- expanding it shows Username + Password fields and a "Sign in" button,
- submitting with the worker unreachable shows the inline error (no crash).

Record what was verified in the PR description (note that live credential auth is validated against the deployed worker, not locally).

- [ ] **Step 5: Commit**

```bash
git add blocks/portal-login/portal-login.js blocks/portal-login/portal-login.css
git commit -m "feat(portal-login): event staff username/password access

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Document the on-site access model (`PROJECT.md`)

**Files:**
- Modify: `PROJECT.md`

**Interfaces:** none (docs).

- [ ] **Step 1: Add a section to `PROJECT.md`**

Find the authentication/portal section (search for "CUG" or "magic link" or "auth"). Add a subsection documenting:
- staff sessions open every customer page because `adobe.com`/`semrush.com` are in every CUG row;
- the three login paths (Adobe ID OAuth, staff/customer magic link, generic `/auth/staff-login`);
- staff-domain logins last 4 days (`EVENT_SESSION_TTL`), customers stay short;
- `EVENT_STAFF_CREDENTIALS` secret format (`username:sha256hex(password)`) and how to set it (`wrangler secret put EVENT_STAFF_CREDENTIALS --env summit`);
- the `EVENT_CRED_EPOCH` kill switch (bump it to revoke all generic sessions; rotate password post-event).

Write it as a concise reference matching the surrounding PROJECT.md style.

- [ ] **Step 2: Commit**

```bash
git add PROJECT.md
git commit -m "docs(project): on-site iPad access + generic staff login

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: Final verification and PR

- [ ] **Step 1: Full test suite + lint**

Run: `cd /Users/josec/code/summit-portal/workers/cloudflare/cug-adobe-oauth-worker && npm test`
Expected: all green.

Run: `cd /Users/josec/code/summit-portal && npm run lint`
Expected: no errors.

- [ ] **Step 2: Open the PR**

The branch work should be on a dedicated branch `feat/cannes-onsite-ipad-access` (create it before Task 1 if not already, since the session started on the unrelated `feat/bv-banner-hero-cta-link`). Push and open a PR with `gh`, summarizing the four changes, the security model (full-scope generic account, epoch kill-switch), the required `wrangler secret put EVENT_STAFF_CREDENTIALS --env summit` deploy step, and the manual-test results from Task 4.

---

## Self-Review notes

- **Spec coverage:** Part 1 (event TTL) → Task 1 + Task 3; Part 2 (generic login + epoch + full scope) → Task 2 + Task 3; Part 3 (login UI) → Task 4; testing → tests in each task + Task 6; PROJECT.md → Task 5. All spec sections covered.
- **Type consistency:** `createSession(env, userInfo, ttl)`, `sessionCookie(token, maxAge)`, `sessionTtlForEmail(email, env)`, `staffDomains(env)`, `parseCredentials(env)`, `sha256hex`, `timingSafeEqual`, `handleStaffLoginRequest(request, env)` are named identically across tasks. `gen_epoch` claim name is consistent in session.js, stafflogin.js, and tests.
- **No placeholders:** all steps contain real code/commands.
- **Pre-existing-branch caveat** is called out (create `feat/cannes-onsite-ipad-access`).
