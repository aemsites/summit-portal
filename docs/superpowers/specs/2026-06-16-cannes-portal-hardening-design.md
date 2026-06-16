# Cannes 2026 Portal Hardening — Design Spec

**Date:** 2026-06-16
**Status:** Approved
**Context:** Event-readiness for Cannes Lions 2026 (late June). Audience: 65 external execs
who log in to view their co-branded report, plus Adobe/Semrush staff who search companies,
open a customer's report, and share it. Most of the journey (OAuth + magic-link login,
deep-link preservation, `customer-picker` search/share, co-branding) already exists. This
spec covers two targeted gap-fills chosen for high impact and low risk two weeks out.

## Scope

Two independent units of work:

1. **Staff "Recently viewed"** — a per-mode band at the top of `customer-picker` showing
   the companies/reports this rep recently opened. Client-side only (localStorage). No
   server or off-repo data-shape dependency.
2. **Session/link resilience** — bump the logged-in session lifetime to 4 hours, preserve
   the current page through re-login from the header, and surface a clear (non-silent)
   session-expiry notice. Header-driven.

Explicitly **out of scope** (documented as backlog, not built this round): customer "portal
home" landing page, staff share audit trail/resend, AM-based account ownership matching,
broad error/empty/loading pass, magic-link lifetime change (stays 30 min by decision).

---

## Part 1 — Staff "Recently viewed"

### Goal

A rep at a meeting wants the two or three accounts they're working *right now*, not to scroll
65 companies A–Z. Surface recently opened items at the top of the picker, most-recent first.

### Behavior

- A **"Recently viewed"** band renders above the letter-nav, below the search box, when the
  active mode has recent entries. If none, it does not render (no first-run clutter).
- Recents are **scoped per mode** (`insights`, `accounts`, `portal`) so contexts don't bleed.
- Clicking a recent card opens the **same dialog** as the equivalent grid card.
- Recents persist across reloads, are scoped to the rep's own browser, and never leave the
  device.

### Data model (localStorage)

- One key per mode: `cp-recent-<mode>` (e.g. `cp-recent-insights`).
- Value: JSON array of entries, most-recent first, **capped at 8**, deduped by `folder`.
- Entry shape: `{ company, folder, ts }` — the minimum needed to re-open the dialog.
  - `company` — display name (`company.Company`).
  - `folder` — `company.Folder`; the dedupe key and how we re-resolve the full record.
  - `ts` — epoch ms, for ordering and (future) "viewed 2h ago" affordance.

### Recording

- On `openDialog(card, company)`, push an entry for the current mode:
  - Build entry from `company`. Skip if `company.Folder` is absent (nothing to re-open).
  - Remove any existing entry with the same `folder`, unshift the new one, slice to 8.
  - Wrap reads/writes in try/catch — a disabled/full localStorage must never break the
    picker (degrade to "no recents").

### Rendering

- New helper `buildRecentBand(mode, companiesForMode, onOpen)`:
  - Read `cp-recent-<mode>`. For each stored entry, resolve the **live** company record from
    the current mode's list by matching `folder` (so we open the dialog with full, current
    data — websites, formats, etc.). Drop entries whose folder no longer exists in the list
    (stale report removed/renamed).
  - If zero resolved entries, return `null` (band not rendered).
  - Otherwise build a labeled band: heading "Recently viewed" + a horizontal row of cards
    reusing `buildCard(company, onOpen)` so click behavior and styling match the grid.
- `renderMode(mode)` calls `buildRecentBand` and places it between the search wrapper and the
  letter-nav. It re-renders on every mode switch (recents are mode-specific).
- Search filtering (`applyFilter`) operates on the grid only; the recent band is not filtered
  (it's a small fixed shortcut list, not part of the searchable corpus).

### Files

- `blocks/customer-picker/customer-picker.js` — storage helpers (`readRecent`, `pushRecent`),
  `buildRecentBand`, hook into `openDialog` and `renderMode`.
- `blocks/customer-picker/customer-picker.css` — `.cp-recent`, `.cp-recent-heading`,
  `.cp-recent-cards` (reuse `.cp-card` tokens; horizontal scroll/wrap on narrow screens).

### Edge cases

- localStorage unavailable/full → try/catch, behave as if no recents.
- A recorded folder no longer present in the loaded list → silently dropped on render.
- Mode with no recents → band omitted.
- Recording requires `company.Folder`; entries without it are not recorded (can't re-open).

---

## Part 2 — Session/link resilience

### A. Session lifetime (worker)

- In `workers/cloudflare/cug-adobe-oauth-worker/src/session.js`, change
  `SESSION_TTL` from `3600` (1h) to **`14400` (4h)**.
- This single constant drives both the JWT `exp` (in `createSession`) and the cookie
  `Max-Age` (in `sessionCookie`), so both extend together — a session lasts the
  meeting/afternoon window instead of dying after an hour.
- `MAGIC_LINK_MAX_AGE` (30 min) and `SHARE_LINK_TTL` (7 days) are **unchanged** by decision.
- Update the existing `// 1 hour` comment to `// 4 hours`.

### B. Graceful expiry UX (frontend, header-driven)

Today an expired session is a silent failure: `/auth/me` returns 401 and the header reverts
to "Sign in" with no explanation; a returning user has no idea why or where they were.

Two fixes, both in the header block (`blocks/header/header.js`):

**B1 — Re-login returns you where you were.**
- The header's "Sign in" link currently targets bare `/login`. Change it to carry
  `?redirect=<current pathname+search>` so the existing deep-link machinery (already proven
  by the HEAD commit and `portal.js`/`portal-login.js`) returns the user to the exact page
  after re-auth.
- Build the redirect value with the same safety contract as `getRedirectPath` in
  `portal-login.js`: only same-origin paths (`/`, not `//`), encoded as a query param. Skip
  adding `redirect` when already on `/login`.

**B2 — Clear expiry notice (header-driven).**
- We need to distinguish "never signed in" (show plain "Sign in", no notice) from "was signed
  in, session lapsed" (show a notice). HttpOnly `auth_token` is invisible to JS, so we use a
  **non-HttpOnly companion marker cookie** as the signal:
  - The worker sets a readable `signed_in=1` cookie alongside the session cookie whenever it
    sets `auth_token` (same `Path`, `Secure`, `SameSite=Lax`, **not** HttpOnly). Its `Max-Age`
    is **deliberately longer than the session** (`SESSION_TTL + 1 day`) so the marker outlives
    a timed-out session — this is what lets the notice fire for the primary case (exec leaves
    the tab open and returns after the 4h session has lapsed). It is cleared together with the
    session on logout.
  - This marker carries **no identity or authorization** — it is a boolean hint only. All
    access control remains the signed `auth_token` validated server-side. The marker can be
    forged by the client, but the worst case is showing a re-login notice to someone who was
    never logged in, which is harmless.
- Header logic on load (it already fetches `/auth/me`):
  - `authenticated: true` → render email + Sign out + My portal (unchanged).
  - `401` **and** `signed_in` marker present → session lapsed: render the redirect-preserving
    "Sign in" link **plus** a small, dismissible inline notice: *"Your session expired. Sign
    in again to continue."* The notice reuses existing header/`user-info` styling — no new
    global toast system.
  - `401` and no marker → first-time/anonymous: render plain redirect-preserving "Sign in",
    **no** notice.
- The marker is informational for UX only; if it is stale (e.g. cleared cookie but marker
  lingers) the worst case is a one-time notice, dismissible and harmless.

> **Why the marker outlives the session:** the primary case for the notice is an exec who
> opens their report, leaves the tab, and returns after the 4h session has timed out. If the
> marker expired with the session, that exact case would silently fall back to plain "Sign in".
> Giving the marker `Max-Age = SESSION_TTL + 1 day` keeps the "was signed in" hint around long
> enough to show the notice on return. The marker still carries no identity/authorization, so a
> lingering marker only ever causes a harmless, dismissible re-login prompt.

### Worker changes for B2

- `src/session.js`: add `signedInMarkerCookie()` (returns the `signed_in=1; …` string,
  non-HttpOnly, `Max-Age = SESSION_TTL + 86400`) and `clearSignedInMarkerCookie()`
  (`Max-Age=0`).
- `src/index.js`: everywhere a session cookie is set (OAuth callback, magic-link/share-link
  `?token=` session mint), also set the marker cookie via a second `Set-Cookie` header.
  Everywhere the session is cleared (`/auth/logout`), also clear the marker.

### Files

- `workers/cloudflare/cug-adobe-oauth-worker/src/session.js` — `SESSION_TTL` 3600→14400;
  `signedInMarkerCookie()` / `clearSignedInMarkerCookie()`.
- `workers/cloudflare/cug-adobe-oauth-worker/src/index.js` — set/clear the marker cookie
  alongside the session at every set/clear site.
- `blocks/header/header.js` — redirect-preserving Sign-in link; expiry notice on
  (401 + marker).
- `blocks/header/header.css` — `.user-session-expired` notice styling (reuse existing tokens).

### Tests (worker, vitest)

- `session.test.js`: `SESSION_TTL` is 14400; `signedInMarkerCookie()` is non-HttpOnly, has
  `Max-Age` of `SESSION_TTL + 86400`, `Secure`, `SameSite=Lax`; `clearSignedInMarkerCookie()`
  sets `Max-Age=0`.
- `index.test.js`: OAuth callback and `?token=` session-mint responses include **both** the
  `auth_token` and `signed_in` Set-Cookie headers; `/auth/logout` clears both.

---

## Testing & verification

- **Part 1:** Manual visual check at `http://localhost:3000/content/index` (or the picker
  page): open a few company dialogs, confirm the "Recently viewed" band appears with those
  items, persists across reload, is per-mode, and that a click re-opens the dialog. Confirm a
  fresh mode (no recents) omits the band. Simulate localStorage failure (disable storage) →
  picker still works.
- **Part 2A/2B worker:** unit tests above; `npm test` in the worker dir.
- **Part 2B frontend:** with a valid session, confirm normal header. Force expiry (delete
  `auth_token` but keep `signed_in`, or wait past TTL) → reload shows the expiry notice + a
  Sign-in link that carries `?redirect=` to the current page. Clear both cookies → plain
  Sign-in, no notice.
- `npm run lint` before committing (Airbnb + Stylelint).

## Backlog (found in audit, not built this round)

- Customer logged-in **portal home** landing (welcome + report framed as a co-branded
  deliverable, instead of a raw redirect to the report page). Highest impression value;
  deferred by scope decision.
- Staff **share audit trail / resend** (what was sent to whom; resend).
- **AM-based account ownership** ("my accounts" by owning rep) — needs reliable AM data join;
  superseded for now by client-side Recently viewed.
- Broad **error/empty/loading** states across `customer-picker` + login.
- Verify the real **65-company Cannes dataset** is loaded into `insights-list.json` /
  `account-list.json` so staff search isn't empty at the event (data/ops task, not code).
