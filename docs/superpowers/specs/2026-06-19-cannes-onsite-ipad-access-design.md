# Cannes 2026 On-Site iPad Access — Design Spec

**Date:** 2026-06-19
**Status:** Draft (pending user review)
**Context:** Cannes Summit 2026 (week of 2026-06-22). Adobe & Semrush field staff will work
the booth with ~6–7 shared iPads, searching companies, opening a customer's co-branded
report, and showing it on the device. **Customers never hold the iPads** — staff operate
them. The pre-event call surfaced one dominant fear: **authentication on the iPads will
break**, because the iPads are non-managed BYOD devices with no Okta, and the current
session times out after 4 hours.

This spec supersedes the airdrop / per-customer-magic-link-spreadsheet ideas discussed on
the call. Those are unnecessary (see "Key finding" below). It is scoped to **on-site staff
device access only** — everything else from the call analysis is out of scope here.

Related: [2026-06-16-cannes-portal-hardening-design.md](./2026-06-16-cannes-portal-hardening-design.md)
(recently-viewed + 4h session) and [2026-06-11-portal-login-design.md](./2026-06-11-portal-login-design.md)
(OAuth + magic-link login). This spec extends, and partially revisits (session TTL), both.

---

## Key finding (why the plan simplifies)

The live CUG config (fetched from `da.live`, 2026-06-19) gates **every** customer page to
`adobe.com, semrush.com, <customer-domain>`. Examples:

- `/accounts/0-9/3m**` → `adobe.com, semrush.com, mmm.com`
- `/accounts**`, `/insights**`, `/adobe**`, `/data/**` → `adobe.com, semrush.com`

And the group→URL mapping routes both `adobe.com` and `semrush.com` to `/adobe/dashboard`.

**Therefore: any logged-in Adobe/Semrush staff session can already open every customer's
report directly, and lands on the dashboard.** The on-site problem is *not* "get the right
per-customer link onto the device." It is only:

1. **Get a staff session onto each iPad without Okta friction**, and
2. **Keep that session alive for the whole event** (today it dies after 4h).

The existing customer-facing **Share** button (`customer-picker.js` → `/auth/sharelink`,
7-day links) already covers "email this report to a customer mid-meeting" with no device
dependency. No change needed there.

---

## Scope

Three changes, all in the auth worker + login UI:

1. **Event session length** — staff sessions live **4 days** (event length), so "log in
   once over the weekend → still logged in Friday" is literally true. Customer magic-link
   sessions keep the short default.
2. **Generic staff credential login** — a new username + password login, typed directly on
   any iPad (no email round-trip, no Okta), minting a full staff session. The Okta-proof
   primary path.
3. **No-Okta fallback retained** — the existing email magic-link path (already Okta-free) is
   kept as a secondary "log in to your own staff email" option.

### Explicitly out of scope (YAGNI)
- Per-customer magic-link spreadsheets / AirDrop flow — unnecessary (staff CUG access).
- Any edit to the ~2,154 CUG rows — staff domains already cover every page.
- Changes to the customer Share tool — already issues 7-day links.
- Everything else from the broader call analysis (outcome capture, source badges, QR,
  playbook) — tracked separately, not here.

---

## Part 1 — Event session length (4 days, staff only)

### Problem
`SESSION_TTL = 14400` (4h) in `session.js:9` is used by **every** session, customer and
staff alike. Blanket-raising it would also hand every external customer a 4-day session —
broader than wanted.

### Design
- Introduce `EVENT_SESSION_TTL = 345600` (4 days) alongside the existing `SESSION_TTL`.
- `createSession(env, userInfo, ttl = SESSION_TTL)` takes an optional TTL; `sessionCookie`
  takes a matching `maxAge`. JWT `exp` and cookie `Max-Age` both derive from the passed TTL.
- **Staff logins** (Adobe ID OAuth, staff magic link, and the new generic credential) mint
  sessions with `EVENT_SESSION_TTL`. A session is "staff" when its email domain is in
  `STAFF_DOMAINS` (`adobe.com, semrush.com`) — the same predicate `sharelink.js` already uses.
- **Customer** magic-link sessions keep `SESSION_TTL` (short).
- `MARKER_MAX_AGE` continues to outlive the session for the "session expired" notice.

**Decision (confirmed):** 4-day TTL applies to **all** staff logins (generic credential,
Adobe ID, staff magic link), not just the generic account.

---

## Part 2 — Generic staff credential login

### Goal
A login a coordinator can type into any iPad in seconds — no email, no Okta, no managed
device — that yields a full staff session.

### New worker route: `POST /auth/staff-login`
New handler module `src/stafflogin.js`, wired in `index.js` beside `/auth/sharelink`.
Structured like `sharelink.js`.

- **Input:** `{ username, password }` (JSON).
- **Credential store:** worker **secret** `EVENT_STAFF_CREDENTIALS` (set via
  `wrangler secret put` — **never** in the repo). Format: newline- or comma-separated
  `username:sha256hex(password)` pairs, so multiple credentials can be issued and revoked
  independently (e.g. one per iPad batch).
- **Verification:** look up `username`; compare `sha256hex(password)` to the stored hash
  using a **constant-time** comparison. On any failure, return a generic `401` after a
  small fixed delay (blunt brute-forcing). No information leak about which field was wrong.
- **On success:** mint a session via `createSession` with a **synthetic staff identity**:
  - `email: '<username>@adobe.com'` (so it passes the `STAFF_DOMAINS` gate → 4-day TTL and
    full Share capability, per decision)
  - `name: '<username>'`
  - `groups: ['adobe.com', 'semrush.com']` → opens every customer page with **zero CUG
    changes**.
  - Set `auth_token` (4-day) + `signed_in` marker cookies, return success JSON.

**Decision (confirmed):** generic account is **full-scope** — it can issue customer share
links exactly like a real staff session (the synthetic `@adobe.com` domain satisfies the
share endpoint's staff gate).

### Kill switch (epoch)
Stateless JWTs can't be individually revoked, so a lost iPad's 4-day token would otherwise
stay valid. Mitigation:

- Add `EVENT_CRED_EPOCH` (a short string/number) to the worker config/secret.
- Bake it into generic-login tokens as a claim `gen_epoch`.
- On every request, if a token carries `gen_epoch`, reject when it ≠ the current
  `EVENT_CRED_EPOCH`. Bumping the env value instantly invalidates **all** generic sessions
  (panic button) without affecting real-staff sessions (which carry no `gen_epoch`).

**Decision (confirmed):** include the kill switch.

---

## Part 3 — Login UI

In `blocks/portal-login/portal-login.js`, add a third, visually de-emphasized option below
the existing **Adobe ID** button and **Email** (magic-link) form:

- An **"Event staff access"** section with `username` + `password` inputs and a submit that
  POSTs to `/auth/staff-login`, then on success navigates to `/adobe/dashboard` (or honors a
  `?redirect=` if present).
- Kept subtle (collapsed/secondary styling) so external customers aren't drawn to it.
- Inline error on `401` ("Incorrect username or password"), no field-level leak.

The existing magic-link form is unchanged and remains the no-password staff fallback.

---

## Architecture summary

```
iPad (Safari, BYOD, no Okta)
   │  type generic username+password
   ▼
POST /auth/staff-login ──► verify vs EVENT_STAFF_CREDENTIALS (sha256, constant-time)
   │                         │
   │ success                 └─► createSession(groups:[adobe,semrush],
   ▼                                            ttl: EVENT_SESSION_TTL=4d,
auth_token cookie (4-day, gen_epoch claim)       claim gen_epoch)
   │
   ▼
GET /adobe/dashboard ─► search company ─► open /accounts/.../report  (CUG: adobe.com ✓)
                                          └─► Share button ─► /auth/sharelink (7-day link)
```

No CUG-row edits. No new external dependency. Customer access paths untouched.

---

## Edge cases & decisions

| Case | Handling |
|------|----------|
| BYOD iPad can't do Adobe OAuth/Okta | Generic credential + magic link both bypass Okta entirely. |
| Session dies mid-event | 4-day staff TTL; log in once over the weekend. |
| Lost/stolen iPad | Customers never hold them; session is read-of-reports + share only. `EVENT_CRED_EPOCH` bump kills all generic sessions; rotate password post-event. |
| Shared password leak | Per-batch credentials allow targeted revoke; epoch kills all at once. |
| Magic-link 30-min freshness | Unchanged — that's the *link* lifetime; the *session* it mints gets the staff TTL. |
| Customer sessions accidentally long-lived | Avoided — only staff-domain logins get `EVENT_SESSION_TTL`. |

---

## Testing

**Worker unit tests** (vitest, beside existing `test/*.test.js`):
- valid generic creds → session with `groups:['adobe.com','semrush.com']`, 4-day `exp`,
  `gen_epoch` claim present.
- bad username / bad password → `401`, no session cookie.
- `gen_epoch` mismatch → request rejected even with otherwise-valid token.
- staff-login session passes the `/auth/sharelink` staff-domain gate (full-scope).
- customer magic-link session still uses short TTL (regression guard).

**Manual (real iPad, Safari):**
- staff-login → lands on `/adobe/dashboard` → search a company → open its report
  (CUG passes) → Share to a test email (7-day link arrives).
- session still valid after a simulated multi-day gap (short test TTL or device-clock shift).
- magic-link fallback to a staff email works on the device.

---

## Files touched

- `workers/cloudflare/cug-adobe-oauth-worker/src/session.js` — optional TTL, `EVENT_SESSION_TTL`, `gen_epoch` verify.
- `workers/cloudflare/cug-adobe-oauth-worker/src/stafflogin.js` — **new** handler.
- `workers/cloudflare/cug-adobe-oauth-worker/src/index.js` — route `/auth/staff-login`; apply staff TTL on OAuth/magic-link staff logins; epoch check.
- `workers/cloudflare/cug-adobe-oauth-worker/wrangler.toml` — `EVENT_CRED_EPOCH` var; document `EVENT_STAFF_CREDENTIALS` secret.
- `blocks/portal-login/portal-login.js` (+ css) — generic staff-access form.
- `workers/cloudflare/cug-adobe-oauth-worker/test/*` — new tests.
- `PROJECT.md` — document the on-site access model.
