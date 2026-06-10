# `/auth/magiclink` Route Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `POST /auth/magiclink` route to the CUG Cloudflare Worker that accepts an email address, checks the CUG domain mapping, and emails a signed JWT magic link — or notifies the admin when the domain is not in the CUG list.

**Architecture:** Two new source modules keep concerns separate: `notification.js` owns all Adobe Post Office (APO) email logic (IMS token fetch + APO HTTP call), while `magiclink.js` owns the route handler (email validation, CUG mapping lookup, JWT creation, orchestration). A new `createMagicLinkToken` export is added to `session.js` as the natural counterpart to the existing `verifyMagicLink`. The route is wired in `index.js` alongside the other `/auth/*` routes.

**Tech Stack:** Cloudflare Workers, Web Crypto API (HMAC-SHA256 JWT), Adobe IMS OAuth2, Adobe Post Office (APO) XML API, Vitest. No new runtime dependencies.

---

## File Map

| File | Change | Responsibility |
|------|--------|----------------|
| `src/session.js` | Modify | Add `createMagicLinkToken(email, env)` export |
| `src/notification.js` | **Create** | IMS token fetch + APO email: `sendMagicLinkConfirm`, `sendMagicLinkNotFound` |
| `src/magiclink.js` | **Create** | POST handler: parse email, fetch CUG mapping, create token, orchestrate notification |
| `src/index.js` | Modify | Import `handleMagicLinkRequest`, add `/auth/magiclink` route |
| `wrangler.toml` | Modify | Document new APO env vars and secrets |
| `test/session.test.js` | Modify | Add `createMagicLinkToken` unit tests |
| `test/notification.test.js` | **Create** | APO function unit tests (mock `fetch`) |
| `test/magiclink.test.js` | **Create** | Route handler unit tests (mock notification module + `fetch`) |
| `test/index.test.js` | Modify | Integration test for `/auth/magiclink` routing |

---

## Background: APO email system

(From handoff document — do not re-derive these.)

**IMS token** — `POST {imsHost}/ims/token/v3` with form body:
- `client_credentials` flow (default): `grant_type=client_credentials&client_id=...&client_secret=...&scope=...`
- `authorization_code` flow (when `APO_AUTHORIZATION_CODE` is set): `grant_type=authorization_code&code=...&client_id=...&client_secret=...&scope=...`
- Stage IMS: `https://ims-na1-stg1.adobelogin.com` — Prod IMS: `https://ims-na1.adobelogin.com`
- Response: `{ "access_token": "..." }`

**APO send** — `POST {apoHost}/po-server/message?templateName={name}&locale=en-us`
- Header: `Authorization: IMS {access_token}` (note "IMS", not "Bearer")
- Body: XML `<sendTemplateEmailReq>` (see Task 2 for exact format)
- Stage APO: `https://stage.postoffice.adobe.com` — Prod APO: `https://postoffice.adobe.com`
- Success response contains `status="OK"` in XML text

**Templates:**
- `expdev_portal_magic_link_confirm` — to: user, CC: `aemsitestrial@adobe.com`, vars: `magic_link`, `email`
- `expdev_portal_magic_link_notify` — to: `aemsitestrial@adobe.com`, no CC, vars: `email`

**CUG mapping shape** — `GET https://{ORIGIN_HOSTNAME}/closed-user-groups-mapping.json`:
```json
{ "data": [{ "group": "adobe.com", "url": "/members/adobe" }] }
```
`group` is matched against the email domain; `url` becomes the path in the magic link.

**Magic link URL format** — `{request.origin}{entry.url}?token={jwt}`
(e.g. `https://act.aem.now/members/adobe?token=eyJ...`)

---

## Task 1: Add `createMagicLinkToken` to `session.js`

`signJwt` is private; the natural home for magic link token creation is `session.js` alongside `verifyMagicLink`. Creates a JWT with `{ email, iat, exp }` using the same secret, fully compatible with the existing `verifyMagicLink` verifier.

**Files:**
- Modify: `workers/cloudflare/cug-adobe-oauth-worker/src/session.js`
- Modify: `workers/cloudflare/cug-adobe-oauth-worker/test/session.test.js`

- [ ] **Step 1.1 — Write failing tests in `test/session.test.js`**

Add `createMagicLinkToken` to the existing session.js import (line 2–4):
```js
import {
  createSession, getSession, sessionCookie, clearSessionCookie, verifyMagicLink, createMagicLinkToken,
} from '../src/session.js';
```

Add the following `describe` block inside the outer `describe('session (JWT)', ...)`, after the `verifyMagicLink` describe block (before the final `});`):
```js
  describe('createMagicLinkToken', () => {
    it('returns a three-part JWT string', async () => {
      const token = await createMagicLinkToken('alice@adobe.com', env);

      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3);
    });

    it('produces a token that verifyMagicLink accepts (round-trip)', async () => {
      const token = await createMagicLinkToken('alice@adobe.com', env);

      const result = await verifyMagicLink(token, env);

      expect(result).not.toBeNull();
      expect(result.email).toBe('alice@adobe.com');
    });

    it('embeds email, iat and exp=iat+1800 in the payload', async () => {
      const before = Math.floor(Date.now() / 1000);
      const token = await createMagicLinkToken('bob@test.com', env);
      const after = Math.floor(Date.now() / 1000);

      const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));

      expect(payload.email).toBe('bob@test.com');
      expect(payload.iat).toBeGreaterThanOrEqual(before);
      expect(payload.iat).toBeLessThanOrEqual(after);
      expect(payload.exp).toBe(payload.iat + 1800);
    });
  });
```

- [ ] **Step 1.2 — Run tests to confirm they fail**
```bash
cd /Users/mhaack/source/playground/summit-portal/workers/cloudflare/cug-adobe-oauth-worker && npm test 2>&1 | grep -E "createMagicLinkToken|FAIL" | head -10
```
Expected: 3 failures about `createMagicLinkToken` not being exported.

- [ ] **Step 1.3 — Implement `createMagicLinkToken` in `src/session.js`**

Append after `clearSessionCookie` (before `verifyMagicLink`):
```js
/** Create a signed JWT for use as a magic link. Valid for 30 minutes. */
export async function createMagicLinkToken(email, env) {
  const now = Math.floor(Date.now() / 1000);
  return signJwt({ email, iat: now, exp: now + MAGIC_LINK_MAX_AGE }, env.JWT_SECRET);
}
```

- [ ] **Step 1.4 — Run tests to confirm all pass**
```bash
cd /Users/mhaack/source/playground/summit-portal/workers/cloudflare/cug-adobe-oauth-worker && npm test 2>&1 | grep -E "createMagicLinkToken|PASS|FAIL"
```
Expected: 3 new tests pass, no regressions.

- [ ] **Step 1.5 — Commit**
```bash
git -C /Users/mhaack/source/playground/summit-portal add \
  workers/cloudflare/cug-adobe-oauth-worker/src/session.js \
  workers/cloudflare/cug-adobe-oauth-worker/test/session.test.js
git -C /Users/mhaack/source/playground/summit-portal commit -m "$(cat <<'EOF'
feat(cug-worker): add createMagicLinkToken to session.js

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Create `notification.js`

Handles all Adobe Post Office integration. Two exported functions, one private `sendApoEmail` helper, one private `getImsToken` helper.

**Files:**
- Create: `workers/cloudflare/cug-adobe-oauth-worker/src/notification.js`
- Create: `workers/cloudflare/cug-adobe-oauth-worker/test/notification.test.js`

- [ ] **Step 2.1 — Create `test/notification.test.js` with failing tests**

Create the file at `workers/cloudflare/cug-adobe-oauth-worker/test/notification.test.js`:
```js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sendMagicLinkConfirm, sendMagicLinkNotFound } from '../src/notification.js';
import { createMockEnv } from './helpers.js';

const APO_OK = '<result status="OK"><messageId>123</messageId></result>';

function mockImsAndApo({ imsStatus = 200, apoStatus = 200, apoBody = APO_OK } = {}) {
  return vi.fn()
    .mockResolvedValueOnce(new Response(
      JSON.stringify({ access_token: 'test-token' }),
      { status: imsStatus, headers: { 'Content-Type': 'application/json' } },
    ))
    .mockResolvedValueOnce(new Response(apoBody, { status: apoStatus }));
}

describe('notification', () => {
  let env;

  beforeEach(() => {
    env = createMockEnv({
      APO_CLIENT_ID: 'apo-client',
      APO_CLIENT_SECRET: 'apo-secret',
      APO_SCOPE: 'openid,email',
      ENVIRONMENT: 'stage',
    });
    vi.unstubAllGlobals();
  });

  describe('sendMagicLinkConfirm', () => {
    it('fetches an IMS token using client_credentials then calls the APO stage endpoint', async () => {
      const fetchMock = mockImsAndApo();
      vi.stubGlobal('fetch', fetchMock);

      await sendMagicLinkConfirm('alice@adobe.com', 'https://act.aem.now/adobe?token=abc', env);

      expect(fetchMock).toHaveBeenCalledTimes(2);
      const [imsUrl, imsOpts] = fetchMock.mock.calls[0];
      expect(imsUrl).toContain('ims-na1-stg1.adobelogin.com/ims/token/v3');
      expect(imsOpts.body.toString()).toContain('grant_type=client_credentials');
      expect(fetchMock.mock.calls[1][0]).toContain('stage.postoffice.adobe.com');
    });

    it('sends to the user with admin CC, correct template, and magic_link + email data', async () => {
      const fetchMock = mockImsAndApo();
      vi.stubGlobal('fetch', fetchMock);

      await sendMagicLinkConfirm('alice@adobe.com', 'https://act.aem.now/adobe?token=abc', env);

      const [apoUrl, apoOpts] = fetchMock.mock.calls[1];
      expect(apoUrl).toContain('templateName=expdev_portal_magic_link_confirm');
      expect(apoOpts.headers.Authorization).toBe('IMS test-token');
      expect(apoOpts.body).toContain('<toList>alice@adobe.com</toList>');
      expect(apoOpts.body).toContain('<ccList>aemsitestrial@adobe.com</ccList>');
      expect(apoOpts.body).toContain('<key>magic_link</key>');
      expect(apoOpts.body).toContain('<value>https://act.aem.now/adobe?token=abc</value>');
      expect(apoOpts.body).toContain('<key>email</key>');
      expect(apoOpts.body).toContain('<value>alice@adobe.com</value>');
    });

    it('uses prod IMS and APO hosts when ENVIRONMENT is prod', async () => {
      const fetchMock = mockImsAndApo();
      vi.stubGlobal('fetch', fetchMock);

      await sendMagicLinkConfirm(
        'alice@adobe.com', 'https://act.aem.now/adobe?token=abc',
        createMockEnv({ APO_CLIENT_ID: 'c', APO_CLIENT_SECRET: 's', APO_SCOPE: 'o', ENVIRONMENT: 'prod' }),
      );

      expect(fetchMock.mock.calls[0][0]).toContain('ims-na1.adobelogin.com');
      expect(fetchMock.mock.calls[0][0]).not.toContain('stg1');
      expect(fetchMock.mock.calls[1][0]).toContain('postoffice.adobe.com');
      expect(fetchMock.mock.calls[1][0]).not.toContain('stage.');
    });

    it('uses authorization_code grant when APO_AUTHORIZATION_CODE is set', async () => {
      const fetchMock = mockImsAndApo();
      vi.stubGlobal('fetch', fetchMock);

      await sendMagicLinkConfirm(
        'alice@adobe.com', 'https://act.aem.now/adobe?token=abc',
        createMockEnv({
          APO_CLIENT_ID: 'c', APO_CLIENT_SECRET: 's', APO_SCOPE: 'o',
          ENVIRONMENT: 'stage', APO_AUTHORIZATION_CODE: 'code123',
        }),
      );

      const imsBody = fetchMock.mock.calls[0][1].body.toString();
      expect(imsBody).toContain('grant_type=authorization_code');
      expect(imsBody).toContain('code=code123');
    });

    it('throws when IMS returns a non-2xx status', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response('', { status: 401 })));

      await expect(sendMagicLinkConfirm('alice@adobe.com', 'https://act.aem.now/adobe?token=abc', env))
        .rejects.toThrow('IMS auth failed: 401');
    });

    it('throws when APO returns a non-2xx status', async () => {
      vi.stubGlobal('fetch', mockImsAndApo({ apoStatus: 500 }));

      await expect(sendMagicLinkConfirm('alice@adobe.com', 'https://act.aem.now/adobe?token=abc', env))
        .rejects.toThrow('APO request failed: 500');
    });

    it('throws when APO response body does not contain status="OK"', async () => {
      vi.stubGlobal('fetch', mockImsAndApo({ apoBody: '<result status="ERROR"><message>fail</message></result>' }));

      await expect(sendMagicLinkConfirm('alice@adobe.com', 'https://act.aem.now/adobe?token=abc', env))
        .rejects.toThrow('APO returned non-OK');
    });
  });

  describe('sendMagicLinkNotFound', () => {
    it('sends the notify template to admin with email data and no ccList', async () => {
      const fetchMock = mockImsAndApo();
      vi.stubGlobal('fetch', fetchMock);

      await sendMagicLinkNotFound('unknown@mystery.com', env);

      const [apoUrl, apoOpts] = fetchMock.mock.calls[1];
      expect(apoUrl).toContain('templateName=expdev_portal_magic_link_notify');
      expect(apoOpts.body).toContain('<toList>aemsitestrial@adobe.com</toList>');
      expect(apoOpts.body).not.toContain('<ccList>');
      expect(apoOpts.body).toContain('<key>email</key>');
      expect(apoOpts.body).toContain('<value>unknown@mystery.com</value>');
    });
  });
});
```

- [ ] **Step 2.2 — Run tests to confirm they fail**
```bash
cd /Users/mhaack/source/playground/summit-portal/workers/cloudflare/cug-adobe-oauth-worker && npm test 2>&1 | grep -E "notification|Cannot find" | head -10
```
Expected: errors about `../src/notification.js` not existing.

- [ ] **Step 2.3 — Create `src/notification.js`**

Create `workers/cloudflare/cug-adobe-oauth-worker/src/notification.js`:
```js
const IMS_HOSTS = {
  prod: 'https://ims-na1.adobelogin.com',
  stage: 'https://ims-na1-stg1.adobelogin.com',
};

const APO_HOSTS = {
  prod: 'https://postoffice.adobe.com',
  stage: 'https://stage.postoffice.adobe.com',
};

const ADMIN_EMAIL = 'aemsitestrial@adobe.com';

function xmlEscape(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

async function getImsToken(env) {
  const imsHost = IMS_HOSTS[env.ENVIRONMENT] ?? IMS_HOSTS.stage;
  const params = new URLSearchParams({
    client_id: env.APO_CLIENT_ID,
    client_secret: env.APO_CLIENT_SECRET,
    scope: env.APO_SCOPE,
  });
  if (env.APO_AUTHORIZATION_CODE) {
    params.set('grant_type', 'authorization_code');
    params.set('code', env.APO_AUTHORIZATION_CODE);
  } else {
    params.set('grant_type', 'client_credentials');
  }

  const resp = await fetch(`${imsHost}/ims/token/v3`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params,
  });
  if (!resp.ok) throw new Error(`IMS auth failed: ${resp.status}`);
  const { access_token } = await resp.json();
  return access_token;
}

async function sendApoEmail({ templateName, toEmails, ccEmails = [], data, env }) {
  const token = await getImsToken(env);
  const apoHost = APO_HOSTS[env.ENVIRONMENT] ?? APO_HOSTS.stage;

  const dataXml = Object.entries(data)
    .map(([k, v]) => `<data><key>${xmlEscape(k)}</key><value>${xmlEscape(v)}</value></data>`)
    .join('');
  const ccBlock = ccEmails.length ? `<ccList>${xmlEscape(ccEmails.join(','))}</ccList>` : '';
  const body = `<sendTemplateEmailReq><toList>${xmlEscape(toEmails.join(','))}</toList>${ccBlock}<templateData>${dataXml}</templateData></sendTemplateEmailReq>`;

  const resp = await fetch(
    `${apoHost}/po-server/message?templateName=${encodeURIComponent(templateName)}&locale=en-us`,
    {
      method: 'POST',
      headers: {
        Authorization: `IMS ${token}`,
        Accept: 'application/xml',
        'Content-Type': 'application/xml',
      },
      body,
    },
  );
  if (!resp.ok) throw new Error(`APO request failed: ${resp.status}`);
  const text = await resp.text();
  if (!text.includes('status="OK"')) throw new Error(`APO returned non-OK: ${text}`);
}

export async function sendMagicLinkConfirm(email, magicLinkUrl, env) {
  await sendApoEmail({
    templateName: 'expdev_portal_magic_link_confirm',
    toEmails: [email],
    ccEmails: [ADMIN_EMAIL],
    data: { magic_link: magicLinkUrl, email },
    env,
  });
}

export async function sendMagicLinkNotFound(email, env) {
  await sendApoEmail({
    templateName: 'expdev_portal_magic_link_notify',
    toEmails: [ADMIN_EMAIL],
    data: { email },
    env,
  });
}
```

- [ ] **Step 2.4 — Run tests to confirm all pass**
```bash
cd /Users/mhaack/source/playground/summit-portal/workers/cloudflare/cug-adobe-oauth-worker && npm test 2>&1 | grep -E "notification|PASS|FAIL"
```
Expected: all 8 notification tests pass, no regressions in other suites.

- [ ] **Step 2.5 — Commit**
```bash
git -C /Users/mhaack/source/playground/summit-portal add \
  workers/cloudflare/cug-adobe-oauth-worker/src/notification.js \
  workers/cloudflare/cug-adobe-oauth-worker/test/notification.test.js
git -C /Users/mhaack/source/playground/summit-portal commit -m "$(cat <<'EOF'
feat(cug-worker): add notification.js for APO magic link emails

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Create `magiclink.js`

Route handler. Validates email, fetches CUG mapping, creates token, calls notification. The notification module is mocked in tests via `vi.mock`.

**Files:**
- Create: `workers/cloudflare/cug-adobe-oauth-worker/src/magiclink.js`
- Create: `workers/cloudflare/cug-adobe-oauth-worker/test/magiclink.test.js`

- [ ] **Step 3.1 — Create `test/magiclink.test.js` with failing tests**

Create the file at `workers/cloudflare/cug-adobe-oauth-worker/test/magiclink.test.js`:
```js
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/notification.js', () => ({
  sendMagicLinkConfirm: vi.fn().mockResolvedValue(undefined),
  sendMagicLinkNotFound: vi.fn().mockResolvedValue(undefined),
}));

import { handleMagicLinkRequest } from '../src/magiclink.js';
import { sendMagicLinkConfirm, sendMagicLinkNotFound } from '../src/notification.js';
import { createMockEnv } from './helpers.js';

function mockCugFetch(entries) {
  return vi.fn().mockResolvedValueOnce(
    new Response(JSON.stringify({ data: entries }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
}

describe('magiclink', () => {
  let env;

  beforeEach(() => {
    env = createMockEnv();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('returns 405 for a non-POST request', async () => {
    const resp = await handleMagicLinkRequest(
      new Request('https://mysite.com/auth/magiclink', { method: 'GET' }),
      env,
    );
    expect(resp.status).toBe(405);
  });

  it('returns 400 when the body is not valid JSON', async () => {
    const resp = await handleMagicLinkRequest(
      new Request('https://mysite.com/auth/magiclink', {
        method: 'POST',
        body: 'not-json',
        headers: { 'Content-Type': 'application/json' },
      }),
      env,
    );
    expect(resp.status).toBe(400);
    expect(await resp.json()).toMatchObject({ error: 'Invalid JSON body' });
  });

  it('returns 400 when email is absent', async () => {
    const resp = await handleMagicLinkRequest(
      new Request('https://mysite.com/auth/magiclink', {
        method: 'POST',
        body: JSON.stringify({}),
        headers: { 'Content-Type': 'application/json' },
      }),
      env,
    );
    expect(resp.status).toBe(400);
    expect(await resp.json()).toMatchObject({ error: 'Invalid email address' });
  });

  it('returns 400 for a malformed email', async () => {
    const resp = await handleMagicLinkRequest(
      new Request('https://mysite.com/auth/magiclink', {
        method: 'POST',
        body: JSON.stringify({ email: 'notanemail' }),
        headers: { 'Content-Type': 'application/json' },
      }),
      env,
    );
    expect(resp.status).toBe(400);
  });

  it('returns { result: "success" } and calls sendMagicLinkConfirm when domain matches CUG', async () => {
    vi.stubGlobal('fetch', mockCugFetch([{ group: 'adobe.com', url: '/members/adobe' }]));

    const resp = await handleMagicLinkRequest(
      new Request('https://mysite.com/auth/magiclink', {
        method: 'POST',
        body: JSON.stringify({ email: 'alice@adobe.com' }),
        headers: { 'Content-Type': 'application/json' },
      }),
      env,
    );

    expect(resp.status).toBe(200);
    expect(await resp.json()).toEqual({ result: 'success' });
    expect(sendMagicLinkConfirm).toHaveBeenCalledOnce();
    const [calledEmail, calledUrl] = sendMagicLinkConfirm.mock.calls[0];
    expect(calledEmail).toBe('alice@adobe.com');
    expect(calledUrl).toMatch(/^https:\/\/mysite\.com\/members\/adobe\?token=.+/);
  });

  it('returns { result: "not_found" } and calls sendMagicLinkNotFound when domain is not in CUG', async () => {
    vi.stubGlobal('fetch', mockCugFetch([{ group: 'adobe.com', url: '/members/adobe' }]));

    const resp = await handleMagicLinkRequest(
      new Request('https://mysite.com/auth/magiclink', {
        method: 'POST',
        body: JSON.stringify({ email: 'stranger@unknown.com' }),
        headers: { 'Content-Type': 'application/json' },
      }),
      env,
    );

    expect(resp.status).toBe(200);
    expect(await resp.json()).toEqual({ result: 'not_found' });
    expect(sendMagicLinkNotFound).toHaveBeenCalledOnce();
    expect(sendMagicLinkNotFound.mock.calls[0][0]).toBe('stranger@unknown.com');
  });

  it('normalises email to lowercase before domain matching', async () => {
    vi.stubGlobal('fetch', mockCugFetch([{ group: 'adobe.com', url: '/members/adobe' }]));

    await handleMagicLinkRequest(
      new Request('https://mysite.com/auth/magiclink', {
        method: 'POST',
        body: JSON.stringify({ email: 'ALICE@ADOBE.COM' }),
        headers: { 'Content-Type': 'application/json' },
      }),
      env,
    );

    expect(sendMagicLinkConfirm.mock.calls[0][0]).toBe('alice@adobe.com');
  });

  it('returns { result: "not_found" } when the CUG mapping fetch fails (network error)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network error')));

    const resp = await handleMagicLinkRequest(
      new Request('https://mysite.com/auth/magiclink', {
        method: 'POST',
        body: JSON.stringify({ email: 'alice@adobe.com' }),
        headers: { 'Content-Type': 'application/json' },
      }),
      env,
    );

    expect(resp.status).toBe(200);
    expect(await resp.json()).toEqual({ result: 'not_found' });
  });

  it('sends ORIGIN_AUTHENTICATION as authorization header when fetching the CUG mapping', async () => {
    const fetchMock = mockCugFetch([]);
    vi.stubGlobal('fetch', fetchMock);

    await handleMagicLinkRequest(
      new Request('https://mysite.com/auth/magiclink', {
        method: 'POST',
        body: JSON.stringify({ email: 'alice@adobe.com' }),
        headers: { 'Content-Type': 'application/json' },
      }),
      createMockEnv({ ORIGIN_AUTHENTICATION: 'site-token-xyz' }),
    );

    expect(fetchMock.mock.calls[0][1].headers.authorization).toBe('token site-token-xyz');
  });
});
```

- [ ] **Step 3.2 — Run tests to confirm they fail**
```bash
cd /Users/mhaack/source/playground/summit-portal/workers/cloudflare/cug-adobe-oauth-worker && npm test 2>&1 | grep -E "magiclink|Cannot find" | head -10
```
Expected: errors about `../src/magiclink.js` not existing.

- [ ] **Step 3.3 — Create `src/magiclink.js`**

Create `workers/cloudflare/cug-adobe-oauth-worker/src/magiclink.js`:
```js
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
    const token = await createMagicLinkToken(email, env);
    const magicLinkUrl = `${new URL(request.url).origin}${match.url}?token=${token}`;
    await sendMagicLinkConfirm(email, magicLinkUrl, env);
    return new Response(JSON.stringify({ result: 'success' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  await sendMagicLinkNotFound(email, env);
  return new Response(JSON.stringify({ result: 'not_found' }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
```

- [ ] **Step 3.4 — Run tests to confirm all pass**
```bash
cd /Users/mhaack/source/playground/summit-portal/workers/cloudflare/cug-adobe-oauth-worker && npm test 2>&1 | tail -8
```
Expected: all 9 magiclink tests pass, no regressions (total: ~72 tests, same 7 pre-existing failures in portal/oauth).

- [ ] **Step 3.5 — Commit**
```bash
git -C /Users/mhaack/source/playground/summit-portal add \
  workers/cloudflare/cug-adobe-oauth-worker/src/magiclink.js \
  workers/cloudflare/cug-adobe-oauth-worker/test/magiclink.test.js
git -C /Users/mhaack/source/playground/summit-portal commit -m "$(cat <<'EOF'
feat(cug-worker): add magiclink.js route handler

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Wire `/auth/magiclink` in `index.js` + document env vars in `wrangler.toml`

**Files:**
- Modify: `workers/cloudflare/cug-adobe-oauth-worker/src/index.js`
- Modify: `workers/cloudflare/cug-adobe-oauth-worker/test/index.test.js`
- Modify: `workers/cloudflare/cug-adobe-oauth-worker/wrangler.toml`

- [ ] **Step 4.1 — Add failing integration test to `test/index.test.js`**

At the top of `test/index.test.js`, add a `vi.mock` for notification before the other imports. Vitest hoists `vi.mock` calls, so placement is fine:
```js
vi.mock('../src/notification.js', () => ({
  sendMagicLinkConfirm: vi.fn().mockResolvedValue(undefined),
  sendMagicLinkNotFound: vi.fn().mockResolvedValue(undefined),
}));
```

Add the following `describe` block inside the outer `describe('index (request routing)', ...)`, after the last existing describe block:
```js
  describe('POST /auth/magiclink', () => {
    it('routes to the magic link handler and returns { result: "success" } for a known domain', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(
        new Response(
          JSON.stringify({ data: [{ group: 'adobe.com', url: '/members/adobe' }] }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ));

      const request = new Request('https://mysite.com/auth/magiclink', {
        method: 'POST',
        body: JSON.stringify({ email: 'alice@adobe.com' }),
        headers: { 'Content-Type': 'application/json' },
      });
      const resp = await worker.fetch(request, env);

      expect(resp.status).toBe(200);
      expect(await resp.json()).toEqual({ result: 'success' });
    });

    it('returns 400 for an invalid email', async () => {
      const request = new Request('https://mysite.com/auth/magiclink', {
        method: 'POST',
        body: JSON.stringify({ email: 'bad' }),
        headers: { 'Content-Type': 'application/json' },
      });
      const resp = await worker.fetch(request, env);

      expect(resp.status).toBe(400);
    });
  });
```

- [ ] **Step 4.2 — Run tests to confirm they fail**
```bash
cd /Users/mhaack/source/playground/summit-portal/workers/cloudflare/cug-adobe-oauth-worker && npm test 2>&1 | grep -E "magiclink route|auth/magiclink|FAIL" | head -10
```
Expected: 2 new failures because the route is not wired in index.js yet.

- [ ] **Step 4.3 — Wire the route in `src/index.js`**

**Change 1:** Add import (with the existing imports at the top of the file, around line 15–18):
```js
import { handleMagicLinkRequest } from './magiclink.js';
```

**Change 2:** Update the top-of-file JSDoc comment to include the new route. Change:
```
 *   /auth/me           — Returns current user info as JSON (email, name, groups)
```
to:
```
 *   /auth/me           — Returns current user info as JSON (email, name, groups)
 *   /auth/magiclink    — POST email, check CUG mapping, send signed magic link
```

**Change 3:** Add the route inside `handleRequest`, in the `// --- Auth routes ---` section, right before the `/auth/callback` block:
```js
  // Magic link request: POST email, validate CUG domain, send signed link
  if (url.pathname === '/auth/magiclink') {
    return handleMagicLinkRequest(request, env);
  }
```

- [ ] **Step 4.4 — Update `wrangler.toml`** to document the new env vars

In the default `[vars]` section, add:
```toml
ENVIRONMENT = "stage"
```

In the default secrets comment block, add:
```toml
# APO_CLIENT_ID = "..."
# APO_CLIENT_SECRET = "..."
# APO_SCOPE = "..."
# APO_AUTHORIZATION_CODE = "..."  (optional — enables authorization_code IMS grant)
```

In `[env.summit.vars]`, add:
```toml
ENVIRONMENT = "prod"
```

In the summit secrets comment block, add the same APO secret comments.

- [ ] **Step 4.5 — Run full test suite**
```bash
cd /Users/mhaack/source/playground/summit-portal/workers/cloudflare/cug-adobe-oauth-worker && npm test
```
Expected output summary:
```
Test Files  X passed (X)
Tests       XX passed (XX)
```
- 2 new integration tests pass
- All previously passing tests still pass
- 7 pre-existing failures in `portal.test.js` and `oauth.test.js` remain

- [ ] **Step 4.6 — Commit**
```bash
git -C /Users/mhaack/source/playground/summit-portal add \
  workers/cloudflare/cug-adobe-oauth-worker/src/index.js \
  workers/cloudflare/cug-adobe-oauth-worker/test/index.test.js \
  workers/cloudflare/cug-adobe-oauth-worker/wrangler.toml
git -C /Users/mhaack/source/playground/summit-portal commit -m "$(cat <<'EOF'
feat(cug-worker): wire POST /auth/magiclink route in index.js

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review

**Spec coverage:**

| Requirement | Covered by |
|-------------|-----------|
| POST /auth/magiclink route | Task 4 — wired in index.js |
| Accept email as POST body | Task 3 — `request.json()` + `EMAIL_RE` validation |
| Validate email format | Task 3 — returns 400 on invalid |
| Fetch CUG mapping for email domain | Task 3 — `fetchCugMapping` + domain match |
| Create signed magic link JWT | Task 1 — `createMagicLinkToken` |
| Magic link URL uses request origin + CUG path | Task 3 — `${new URL(request.url).origin}${match.url}?token=...` |
| Send confirm email to user + admin CC | Task 2 — `sendMagicLinkConfirm` |
| Send notify email to admin on no match | Task 2 — `sendMagicLinkNotFound` |
| Return `{ result: 'success' }` on match | Task 3 |
| Return `{ result: 'not_found' }` on no match | Task 3 |
| Code separate: notification.js + magiclink.js | Tasks 2 and 3 |
| New `wrangler.toml` vars documented | Task 4 |

**Placeholder scan:** None found.

**Type consistency:**
- `createMagicLinkToken(email, env)` defined in Task 1, imported in `magiclink.js` Task 3 with same signature ✓
- `sendMagicLinkConfirm(email, magicLinkUrl, env)` defined in Task 2, called in Task 3 with same 3-arg signature ✓
- `sendMagicLinkNotFound(email, env)` defined in Task 2, called in Task 3 with same 2-arg signature ✓
- `handleMagicLinkRequest(request, env)` defined in Task 3, imported and called in Task 4 with same 2-arg signature ✓
