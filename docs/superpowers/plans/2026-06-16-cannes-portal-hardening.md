# Cannes 2026 Portal Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a staff "Recently viewed" shortcut to `customer-picker`, extend the logged-in session to 4 hours, and replace silent session-expiry with a clear, redirect-preserving re-login notice in the header.

**Architecture:** Two independent units. (1) Client-side localStorage in `customer-picker` records opened companies per mode and renders a band above the grid. (2) The Cloudflare auth worker bumps `SESSION_TTL` and sets a non-HttpOnly `signed_in` marker cookie alongside the session; the header reads that marker to distinguish "anonymous" from "session lapsed" and shows a notice plus a `?redirect=`-carrying Sign-in link.

**Tech Stack:** Vanilla ES6 EDS blocks (no build step, Airbnb ESLint, Stylelint), Cloudflare Worker (`src/*.js`), Vitest for worker tests.

**Spec:** `docs/superpowers/specs/2026-06-16-cannes-portal-hardening-design.md`

**Working directory for worker commands:** `workers/cloudflare/cug-adobe-oauth-worker`

---

## File Structure

| File | Responsibility | Change |
|------|----------------|--------|
| `workers/cloudflare/cug-adobe-oauth-worker/src/session.js` | Session/token crypto + cookie strings | `SESSION_TTL` 3600→14400; add `signedInMarkerCookie()` / `clearSignedInMarkerCookie()` |
| `workers/cloudflare/cug-adobe-oauth-worker/src/index.js` | Request routing + cookie setting | Set marker cookie wherever `auth_token` is set; clear it on logout |
| `workers/cloudflare/cug-adobe-oauth-worker/test/session.test.js` | session unit tests | Update TTL asserts; add marker-cookie tests |
| `workers/cloudflare/cug-adobe-oauth-worker/test/index.test.js` | routing tests | Assert marker cookie set on callback/token, cleared on logout |
| `blocks/customer-picker/customer-picker.js` | Picker UI + data | Recent storage helpers, `buildRecentBand`, hook into open/render |
| `blocks/customer-picker/customer-picker.css` | Picker styles | `.cp-recent*` band styles |
| `blocks/header/header.js` | Header + user info | Redirect-preserving Sign-in; expiry notice on (401 + marker) |
| `blocks/header/header.css` | Header styles | `.user-session-expired` notice styles |

---

## Part A — Worker: session lifetime + marker cookie

### Task A1: Extend SESSION_TTL to 4 hours

**Files:**
- Modify: `workers/cloudflare/cug-adobe-oauth-worker/src/session.js:9`
- Test: `workers/cloudflare/cug-adobe-oauth-worker/test/session.test.js`

- [ ] **Step 1: Update the two TTL assertions in the existing tests to expect 14400**

In `test/session.test.js`, change line ~35 inside the "embeds user info in the payload" test:

```js
      expect(payload.exp).toBe(payload.iat + 14400);
```

And change the `sessionCookie` assertion at line ~118:

```js
      expect(cookie).toBe('auth_token=jwt-token-here; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=14400');
```

- [ ] **Step 2: Run the tests to verify they now FAIL against the old code**

Run: `cd workers/cloudflare/cug-adobe-oauth-worker && npx vitest run test/session.test.js`
Expected: FAIL — two assertions expect 14400 but code still produces 3600.

- [ ] **Step 3: Change SESSION_TTL**

In `src/session.js:9`:

```js
const SESSION_TTL = 14400; // 4 hours
```

- [ ] **Step 4: Run the tests to verify they PASS**

Run: `npx vitest run test/session.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add workers/cloudflare/cug-adobe-oauth-worker/src/session.js workers/cloudflare/cug-adobe-oauth-worker/test/session.test.js
git commit -m "feat(auth): extend session lifetime to 4 hours"
```

---

### Task A2: Add signed-in marker cookie helpers

**Files:**
- Modify: `workers/cloudflare/cug-adobe-oauth-worker/src/session.js`
- Test: `workers/cloudflare/cug-adobe-oauth-worker/test/session.test.js`

The marker is a **non-HttpOnly** boolean hint readable by the header JS. It carries no identity or authorization — all access control stays in the signed `auth_token`. Its `Max-Age` deliberately outlives the session (`SESSION_TTL + 86400`) so a session that times out while a tab is left open still leaves the "was signed in" hint for the expiry notice.

- [ ] **Step 1: Write failing tests for the marker helpers**

Add this `describe` block to `test/session.test.js` (after the existing `sessionCookie` tests):

```js
  describe('signedInMarkerCookie', () => {
    it('is readable by JS (not HttpOnly) and outlives the session by a day', () => {
      const cookie = signedInMarkerCookie();
      expect(cookie).toContain('signed_in=1');
      expect(cookie).toContain('Path=/');
      expect(cookie).toContain('Secure');
      expect(cookie).toContain('SameSite=Lax');
      expect(cookie).not.toContain('HttpOnly');
      expect(cookie).toContain(`Max-Age=${14400 + 86400}`);
    });

    it('clearSignedInMarkerCookie expires the marker', () => {
      const cookie = clearSignedInMarkerCookie();
      expect(cookie).toContain('signed_in=');
      expect(cookie).toContain('Max-Age=0');
      expect(cookie).not.toContain('HttpOnly');
    });
  });
```

Add the two new names to the import at the top of `test/session.test.js`:

```js
import {
  createSession, getSession, sessionCookie, clearSessionCookie, verifyMagicLink, createMagicLinkToken,
  createShareLinkToken, verifyShareLink, signedInMarkerCookie, clearSignedInMarkerCookie,
} from '../src/session.js';
```

- [ ] **Step 2: Run to verify FAIL**

Run: `npx vitest run test/session.test.js`
Expected: FAIL — `signedInMarkerCookie is not a function` (not exported yet).

- [ ] **Step 3: Implement the helpers**

In `src/session.js`, add a constant near the other TTLs (after line 12):

```js
const MARKER_NAME = 'signed_in';
// Marker outlives the session by a day so a timed-out session still shows the
// "session expired" notice when the user returns to a long-open tab.
const MARKER_MAX_AGE = SESSION_TTL + 86400;
```

Add these exported functions next to `sessionCookie` / `clearSessionCookie`:

```js
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
```

- [ ] **Step 4: Run to verify PASS**

Run: `npx vitest run test/session.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add workers/cloudflare/cug-adobe-oauth-worker/src/session.js workers/cloudflare/cug-adobe-oauth-worker/test/session.test.js
git commit -m "feat(auth): add non-HttpOnly signed-in marker cookie helpers"
```

---

### Task A3: Emit the marker cookie at every session set/clear site

**Files:**
- Modify: `workers/cloudflare/cug-adobe-oauth-worker/src/index.js`
- Test: `workers/cloudflare/cug-adobe-oauth-worker/test/index.test.js`

Three sites set `auth_token` (OAuth callback, `?token=` mint) and one clears it (logout). A single `Response` can carry multiple `Set-Cookie` headers only via `Headers.append` — an object literal `{ 'Set-Cookie': ... }` holds just one. We switch those three responses to build a `Headers` object and append both cookies.

- [ ] **Step 1: Write failing tests asserting the marker accompanies the session**

In `test/index.test.js`, inside `describe('auth callback', ...)`, add after the existing callback test (around line 84):

```js
    it('also sets the non-HttpOnly signed-in marker cookie', async () => {
      const idToken = fakeJwt({ email: 'alice@adobe.com', name: 'Alice' });
      const state = 'state-123';
      await env.SESSIONS.put(`pkce:${state}`, JSON.stringify({
        verifier: 'v', originalUrl: 'https://mysite.com/members/adobe',
      }));
      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ id_token: idToken }), {
          status: 200, headers: { 'Content-Type': 'application/json' },
        }),
      );
      const request = new Request(`https://mysite.com/auth/callback?code=abc&state=${state}`);
      const resp = await worker.fetch(request, env);
      const cookies = resp.headers.getSetCookie();
      expect(cookies.some((c) => c.startsWith('auth_token='))).toBe(true);
      expect(cookies.some((c) => c.startsWith('signed_in=1'))).toBe(true);
    });
```

Inside `describe('auth logout', ...)`, add after the existing logout test (around line 96):

```js
    it('also clears the signed-in marker cookie', async () => {
      const request = new Request('https://mysite.com/auth/logout');
      const resp = await worker.fetch(request, env);
      const cookies = resp.headers.getSetCookie();
      expect(cookies.some((c) => c.startsWith('auth_token=') && c.includes('Max-Age=0'))).toBe(true);
      expect(cookies.some((c) => c.startsWith('signed_in=') && c.includes('Max-Age=0'))).toBe(true);
    });
```

Inside `describe('magic link (?token=)', ...)`, add after the existing token test (around line 290):

```js
    it('also sets the signed-in marker when minting a session from a token', async () => {
      const token = await createMagicLinkToken('alice@adobe.com', env);
      const request = new Request(`https://mysite.com/members/adobe?token=${token}`);
      const resp = await worker.fetch(request, env);
      const cookies = resp.headers.getSetCookie();
      expect(cookies.some((c) => c.startsWith('auth_token='))).toBe(true);
      expect(cookies.some((c) => c.startsWith('signed_in=1'))).toBe(true);
    });
```

Ensure the test file imports `createMagicLinkToken` (it already imports `createSession`; add `createMagicLinkToken` if missing) — check the top-of-file import from `../src/session.js` and add the name if absent.

- [ ] **Step 2: Run to verify FAIL**

Run: `npx vitest run test/index.test.js`
Expected: FAIL — `signed_in` cookie not present in any response.

- [ ] **Step 3: Import the marker helpers in index.js**

Update the `./session.js` import block (lines 17-19):

```js
import {
  createSession, getSession, sessionCookie, clearSessionCookie, verifyMagicLink, verifyShareLink,
  signedInMarkerCookie, clearSignedInMarkerCookie,
} from './session.js';
```

- [ ] **Step 4: Set both cookies in the OAuth callback response**

Replace the callback `Response` (the block returning `Location: result.originalUrl`):

```js
  // OAuth callback: exchange authorization code for tokens, create session
  if (url.pathname === '/auth/callback') {
    const result = await handleCallback(request, env);
    if (result instanceof Response) return result;

    const token = await createSession(env, result.userInfo);
    const headers = new Headers({ Location: result.originalUrl });
    headers.append('Set-Cookie', sessionCookie(token));
    headers.append('Set-Cookie', signedInMarkerCookie());
    return new Response(null, { status: 302, headers });
  }
```

- [ ] **Step 5: Clear both cookies on logout**

Replace the logout `Response`:

```js
  // Logout: clear session cookie and redirect to IMS logout
  if (url.pathname === '/auth/logout') {
    const imsLogoutUrl = `${env.OAUTH_LOGOUT_URL}?client_id=${env.OAUTH_CLIENT_ID}&redirect_uri=${encodeURIComponent(url.origin + '/')}`;
    const headers = new Headers({ Location: imsLogoutUrl });
    headers.append('Set-Cookie', clearSessionCookie());
    headers.append('Set-Cookie', clearSignedInMarkerCookie());
    return new Response(null, { status: 302, headers });
  }
```

- [ ] **Step 6: Set both cookies in the `?token=` session mint**

Replace the final `?token=` `Response` (the one returning `Location: cleanUrl.href`):

```js
    const headers = new Headers({ Location: cleanUrl.href });
    headers.append('Set-Cookie', sessionCookie(newToken));
    headers.append('Set-Cookie', signedInMarkerCookie());
    return new Response(null, { status: 302, headers });
```

- [ ] **Step 7: Run to verify PASS (full worker suite)**

Run: `npx vitest run`
Expected: PASS — all worker tests, including the new marker assertions and unchanged callback/logout/token `auth_token` checks (`.get('Set-Cookie')` still returns the first value, which remains `auth_token`).

- [ ] **Step 8: Commit**

```bash
git add workers/cloudflare/cug-adobe-oauth-worker/src/index.js workers/cloudflare/cug-adobe-oauth-worker/test/index.test.js
git commit -m "feat(auth): emit signed-in marker cookie alongside session"
```

---

## Part B — Header: redirect-preserving sign-in + expiry notice

### Task B1: Redirect-preserving Sign-in link + expiry notice

**Files:**
- Modify: `blocks/header/header.js:225-264`
- Modify: `blocks/header/header.css`

No worker tests here (header is browser EDS code with no unit harness); verify visually per the spec. Keep changes inside `decorateUserInfo`.

- [ ] **Step 1: Add helper to read the marker cookie and build the Sign-in href**

In `blocks/header/header.js`, add these two helpers above `decorateUserInfo` (after `SCHEME_SUN_SVG`, around line 115):

```js
/** True if the non-HttpOnly signed-in marker cookie is present. */
function hasSignedInMarker() {
  return /(?:^|;\s*)signed_in=1(?:;|$)/.test(document.cookie);
}

/**
 * Build a sign-in href that returns the user to the current page after auth.
 * Only same-origin paths are forwarded (matches portal-login's redirect guard).
 */
function signInHref() {
  const path = `${window.location.pathname}${window.location.search}`;
  if (window.location.pathname === '/login' || !path.startsWith('/') || path.startsWith('//')) {
    return '/login';
  }
  return `/login?redirect=${encodeURIComponent(path)}`;
}
```

- [ ] **Step 2: Use the redirect-aware href and add the expiry notice in `decorateUserInfo`**

Replace the `if (!user?.authenticated) { ... }` branch (lines 238-243) with:

```js
  if (!user?.authenticated) {
    const signIn = document.createElement('a');
    signIn.href = signInHref();
    signIn.className = 'user-sign-in';
    signIn.textContent = 'Sign in';
    wrapper.append(signIn);

    // Distinguish "never signed in" from "session lapsed": the non-HttpOnly
    // marker outlives the session, so its presence here means the session
    // expired rather than the user being anonymous.
    if (hasSignedInMarker()) {
      const notice = document.createElement('p');
      notice.className = 'user-session-expired';
      notice.setAttribute('role', 'status');
      notice.textContent = 'Your session expired. Sign in again to continue.';
      wrapper.append(notice);
    }
  } else {
```

(Leave the authenticated `else` branch unchanged.)

- [ ] **Step 3: Add notice styling**

Append to `blocks/header/header.css`:

```css
.user-info .user-session-expired {
  margin: 4px 0 0;
  font-size: 12px;
  line-height: 1.4;
  color: var(--rpt-red, #e60000);
  max-width: 220px;
}
```

- [ ] **Step 4: Lint**

Run: `npm run lint`
Expected: PASS (no new ESLint/Stylelint errors).

- [ ] **Step 5: Verify visually**

Start the dev server (`npx -y @adobe/aem-cli up --no-open`) and load a page with the header.
- Signed in: header shows email + Sign out + My Portal (unchanged).
- In DevTools, delete the `auth_token` cookie but set `document.cookie = 'signed_in=1; path=/'`, reload → "Sign in" link + the expiry notice; the link href carries `?redirect=` to the current path.
- Clear both cookies, reload → plain "Sign in", no notice.

- [ ] **Step 6: Commit**

```bash
git add blocks/header/header.js blocks/header/header.css
git commit -m "feat(header): redirect-preserving sign-in + session-expiry notice"
```

---

## Part C — customer-picker: Recently viewed

### Task C1: Recent storage helpers

**Files:**
- Modify: `blocks/customer-picker/customer-picker.js`

Per-mode localStorage list, capped at 8, deduped by folder, fully guarded so storage failure never breaks the picker. No unit harness for blocks — covered by the manual verification in C3.

- [ ] **Step 1: Add the storage helpers near the top of the module**

In `blocks/customer-picker/customer-picker.js`, add after the `LETTERS` constant (line 1):

```js
const RECENT_MAX = 8;
const recentKey = (mode) => `cp-recent-${mode}`;

/** Read the recent-entry list for a mode. Returns [] on any storage failure. */
function readRecent(mode) {
  try {
    const raw = localStorage.getItem(recentKey(mode));
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

/**
 * Record an opened company for a mode: dedupe by folder, newest first, cap at
 * RECENT_MAX. Entries without a Folder are skipped (nothing to re-open).
 * Storage failures are swallowed — recents are a convenience, never required.
 */
function pushRecent(mode, company) {
  if (!company || !company.Folder) return;
  try {
    const entry = { company: company.Company, folder: company.Folder, ts: Date.now() };
    const next = [entry, ...readRecent(mode).filter((e) => e.folder !== entry.folder)]
      .slice(0, RECENT_MAX);
    localStorage.setItem(recentKey(mode), JSON.stringify(next));
  } catch {
    // ignore: storage unavailable/full
  }
}
```

- [ ] **Step 2: Lint to confirm no syntax/style errors**

Run: `npm run lint`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add blocks/customer-picker/customer-picker.js
git commit -m "feat(customer-picker): recent-view storage helpers"
```

---

### Task C2: Render the Recently viewed band and wire it up

**Files:**
- Modify: `blocks/customer-picker/customer-picker.js`
- Modify: `blocks/customer-picker/customer-picker.css`

- [ ] **Step 1: Add `buildRecentBand` near `buildGrid`**

In `customer-picker.js`, add this function just before `buildGrid` (around line 358). It resolves each stored entry against the live mode list (by folder) so dialogs open with current data, and drops entries whose folder is gone:

```js
/**
 * Build the "Recently viewed" band for a mode, or return null when there are no
 * resolvable recents. Stored entries are matched back to the live company list
 * by folder so the dialog opens with full, current data; stale entries (folder
 * no longer present) are dropped.
 */
function buildRecentBand(mode, companies, onOpen) {
  const byFolder = new Map(companies.map((c) => [c.Folder, c]));
  const resolved = readRecent(mode)
    .map((e) => byFolder.get(e.folder))
    .filter(Boolean);
  if (!resolved.length) return null;

  const band = document.createElement('div');
  band.className = 'cp-recent';

  const heading = document.createElement('h2');
  heading.className = 'cp-recent-heading';
  heading.textContent = 'Recently viewed';
  band.append(heading);

  const cards = document.createElement('div');
  cards.className = 'cp-recent-cards';
  for (const company of resolved) {
    cards.append(buildCard(company, onOpen));
  }
  band.append(cards);
  return band;
}
```

- [ ] **Step 2: Record a recent on open**

In `openDialog` (around line 565), add a `pushRecent` call after the dialog is shown. Replace:

```js
  function openDialog(card, company) {
    if (activeCard) activeCard.classList.remove('cp-card--active');
    activeCard = card;
    card.classList.add('cp-card--active');
    renderDialog(dialogContent, company, websiteMap, domainMap, currentMode);
    backdrop.hidden = false;
    close.focus();
  }
```

with:

```js
  function openDialog(card, company) {
    if (activeCard) activeCard.classList.remove('cp-card--active');
    activeCard = card;
    card.classList.add('cp-card--active');
    renderDialog(dialogContent, company, websiteMap, domainMap, currentMode);
    backdrop.hidden = false;
    close.focus();
    pushRecent(currentMode, company);
  }
```

- [ ] **Step 3: Render the band in `renderMode`**

In `renderMode` (around line 575), insert the band between the search wrapper and the letter-nav. Replace the tail of `renderMode`:

```js
    const { grid, groups } = buildGrid(companies, openDialog);
    const letterNav = buildLetterNav(groups);

    navContainer.replaceChildren(letterNav);
    gridContainer.replaceChildren(grid);
  }
```

with:

```js
    const { grid, groups } = buildGrid(companies, openDialog);
    const letterNav = buildLetterNav(groups);

    const recentBand = buildRecentBand(mode, companies, openDialog);
    if (recentBand) navContainer.replaceChildren(recentBand, letterNav);
    else navContainer.replaceChildren(letterNav);
    gridContainer.replaceChildren(grid);
  }
```

- [ ] **Step 4: Add band styles**

Append to `blocks/customer-picker/customer-picker.css`:

```css
.cp-recent {
  margin-bottom: 24px;
}

.cp-recent-heading {
  margin: 0 0 12px;
  font-size: 14px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--rpt-text-muted, #6e6e6e);
}

.cp-recent-cards {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.cp-recent-cards .cp-card {
  width: auto;
  min-width: 200px;
  flex: 0 1 auto;
}

@media (width < 1000px) {
  .cp-recent-cards {
    flex-wrap: nowrap;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }

  .cp-recent-cards .cp-card {
    flex: 0 0 70%;
  }
}
```

- [ ] **Step 5: Lint**

Run: `npm run lint`
Expected: PASS.

- [ ] **Step 6: Verify visually**

Load the customer-picker page on the dev server.
- Open 2-3 company dialogs in "Insight Reports" mode, then reload → a "Recently viewed" band appears above the A–Z nav with those companies; clicking one re-opens its dialog.
- Switch to "Accounts" mode → the band reflects accounts recents only (likely empty initially → no band).
- Confirm searching the grid does not hide/alter the recent band.
- In DevTools, run `localStorage.clear()` then reload → band disappears, picker still works.

- [ ] **Step 7: Commit**

```bash
git add blocks/customer-picker/customer-picker.js blocks/customer-picker/customer-picker.css
git commit -m "feat(customer-picker): Recently viewed band per mode"
```

---

## Part D — Docs + finalize

### Task D1: Update PROJECT.md

**Files:**
- Modify: `PROJECT.md`

- [ ] **Step 1: Document the changes**

Add a short note to the relevant block descriptions in `PROJECT.md`:
- Under a customer-picker / portal section (add one if absent): "customer-picker shows a per-mode **Recently viewed** band (localStorage, capped 8, deduped by folder) above the A–Z grid."
- Note the auth behavior: "Logged-in session lasts 4 hours; a non-HttpOnly `signed_in` marker cookie lets the header show a redirect-preserving 'session expired' notice instead of failing silently."

- [ ] **Step 2: Commit**

```bash
git add PROJECT.md
git commit -m "docs: note recently-viewed + session resilience in PROJECT.md"
```

---

### Task D2: Full verification gate

- [ ] **Step 1: Worker test suite green**

Run: `cd workers/cloudflare/cug-adobe-oauth-worker && npx vitest run`
Expected: All pass.

- [ ] **Step 2: Lint green (repo root)**

Run: `npm run lint`
Expected: No errors.

- [ ] **Step 3: Confirm all manual visual checks from C2/B1 pass.**

---

## Self-review notes

- **Spec coverage:** Part 1 → Tasks C1/C2. Part 2A (TTL) → A1. Part 2B B1 (redirect-preserving sign-in) → B1 Step 2. Part 2B B2 (marker + notice) → A2, A3, B1. Marker-outlives-session → A2 (`MARKER_MAX_AGE`). Backlog items intentionally not implemented.
- **Multiple Set-Cookie:** handled via `Headers.append`; tests assert with `getSetCookie()` for the marker while existing `.get('Set-Cookie')` checks for `auth_token` still hold (auth_token appended first).
- **Naming consistency:** `signedInMarkerCookie` / `clearSignedInMarkerCookie` / `hasSignedInMarker` / `signInHref` / `readRecent` / `pushRecent` / `buildRecentBand` used identically across tasks.
