# Dashboard "Share via magic link" — implementation plan

## Goal
Let an Adobe/Semrush **staffer** (e.g. Rachel at the Cannes Lions booth, on an iPad)
share a specific customer Portal page with a customer by typing the customer's
email and pressing **Send**. The customer receives an email with an authenticated
deep link that opens the page immediately — no Adobe ID login, no self-service
magic-link request. Target: **1–2 clicks** for the staffer; the staffer sends the
email, not the customer.

## Why this is a new flow (not a reuse of `/auth/magiclink`)
The existing `POST /auth/magiclink` is **self-service**: the recipient requests
their *own* link, the CUG match is keyed off the **recipient's own email domain**,
and the endpoint is an **unauthenticated public POST**. The new feature inverts
the trust model:

| | `/auth/magiclink` (existing) | `/auth/sharelink` (new) |
|---|---|---|
| Who calls it | the recipient (anonymous) | an authenticated **staffer** |
| Authn | none | requires valid staff session cookie |
| Target page | the recipient-domain's mapped URL | a **specific page** the staffer picked |
| CUG check | recipient domain vs its own group | recipient domain vs the **chosen page's** CUG groups |
| Link lifetime | 30 min (booth-unfriendly) | 7 days |

If we reused `/auth/magiclink` we'd have an **open email relay** (any logged-in
user could email arbitrary addresses) and a link too short-lived for the booth
hand-off. So we add a separate, locked-down endpoint.

## Endpoint contract — `POST /auth/sharelink`
Request (JSON):
```json
{ "email": "customer@brand.com", "path": "/members/brand" }
```
- `email` — recipient (the customer). Validated against the page's CUG.
- `path` — same-origin path of the page to share (`company.Folder` pathname).

Server steps:
1. **Method + session gate.** Must be `POST`. Must carry a valid `auth_token`
   session (`getSession`). The **caller's** email domain must be in
   `STAFF_DOMAINS` (default `adobe.com,semrush.com`). Otherwise `401`/`403` —
   this is what prevents the open relay.
2. **Validate inputs.** `email` matches the email regex; `path` passes the same
   `safeRedirectPath()` same-origin guard used by the magic-link flow (rejects
   `//`, absolute URLs, CRLF/whitespace — anti-phishing). Strip the fragment.
3. **Resolve the page's CUG.** Fetch `/closed-user-groups-mapping.json` (reuse
   the existing helper). Find the entry whose `url` matches `path`
   (trailing-slash / `*` tolerant). Read its allowed groups.
4. **Authorize the recipient.** The recipient's email **domain** must be one of
   the page's allowed groups. If not → `403 { result: 'forbidden' }`. We do NOT
   send a dead link to an unauthorized address.
5. **Mint a share token.** `createShareLinkToken(email, env)` → signed JWT
   `{ purpose: 'sharelink', email, iat, exp }`, `exp = now + 7 days`. Same HMAC
   signing as the session/magic-link tokens.
6. **Build the URL.** `${origin}${path}?token=<jwt>` (reuse `appendTokenParam`).
7. **Email it.** `sendShareLinkConfirm(email, url, env, templateName)` via APO.
   Template chosen by the page entry's `org` (Adobe vs Semrush). Also fire the
   existing internal notify (best-effort).
8. Respond `200 { result: 'sent' }`.

The `?token=` handler in `index.js` must accept the new purpose: it currently
calls `verifyMagicLink` (which only accepts `purpose:'magiclink'`). We add
`verifyShareLink` and try both, so a share token also mints a 1-hour session and
302-redirects to the clean URL.

## Token design + lifetime
- New purpose `sharelink`, distinct from `magiclink` so the 30-min self-service
  freshness rule is untouched.
- **Explicit `exp` of 7 days.** `verifyJwt` already enforces `exp`. Justification:
  Rachel shares at the booth; the customer may open it that evening or the next
  day. 30 min is unusable. 7 days covers the event window while staying short
  enough to bound exposure of a leaked link. Not "non-expiring" — it's a signed,
  expiring HMAC token, same crypto as everything else.
- Clicking the link still mints only a **1-hour session** (`createSession`), so a
  forwarded link doesn't grant a week-long live session — it grants a week-long
  *ability to start* a 1-hour session, scoped to a domain in the page's CUG.

## Dialog UX (customer-picker block)
Add a "Share this page with a customer" section to `.cp-dialog` (insights +
portal modes, where there's a `company.Folder`):
- Short helper line listing the **allowed email domains** for the page (from the
  existing `domainMap`), so the staffer knows which addresses will work.
- An email `<input type="email">` + a **Send** button (the 1–2 clicks).
- Client-side: validate the typed address's domain is one of the allowed domains
  before POSTing (instant feedback, fewer dead sends).
- States: idle → sending (button disabled, "Sending…") → success ("Sent to
  x@y.com ✓") or error (inline message). Mobile/iPad friendly: large tap
  targets, `inputmode="email"`, full-width on narrow screens. Matches existing
  `.cp-dialog-*` tokens.

## APO template dependency (flag for email team)
New template name `expdev_actnow_sharelink` (+ `_semrush` variant) referenced in
code. The actual APO templates must be provisioned by the email team
(Markus / ben.kendall). Until then the send will fail at APO and the UI shows an
error — code degrades gracefully (no crash). **This is a release dependency.**
Interim fallback option: point `sendShareLinkConfirm` at the existing
`expdev_actnow_magiclink` template (same `magic_link` data key) if a dedicated
template isn't ready by Cannes — noted in the PR.

## Security considerations
- **No open relay:** session required + caller domain must be staff + recipient
  must be authorized for the specific page. Three independent gates.
- **Same-origin only:** `path` goes through `safeRedirectPath()`; token URL is
  built from `request.url` origin, never a caller-supplied host.
- **Recipient authorization before send:** never email a link the CUG would
  reject — avoids both dead links and using us to spam arbitrary addresses.
- **Rate-limiting (future):** the endpoint is session-gated so abuse is bounded
  to authenticated staff, but a per-session send cap (e.g. via KV counter) would
  be a sensible follow-up. Out of scope for v1; noted in PR.
- **Logging:** log domains, never full recipient addresses (mirrors existing
  `***@domain` redaction).

## Test plan (vitest, `test/sharelink.test.js`)
- 405 on non-POST.
- 401 when no session.
- 403 when caller's domain is not a staff domain.
- 400 on bad JSON / invalid email / invalid `path`.
- 403 when recipient domain not in the target page's CUG groups.
- 200 `{result:'sent'}` + `sendShareLinkConfirm` called with the right URL/token
  when recipient is authorized; Semrush template selected when `org=semrush`.
- 500 when page not found in mapping.
- 502 when the email send throws.
- `session.test.js`: `createShareLinkToken` / `verifyShareLink` round-trip,
  rejects expired, rejects wrong purpose, rejects tampered signature.
- `index.test.js`: `?token=<sharelink>` mints a session + 302 to clean URL.

## Files touched
- `src/session.js` — `createShareLinkToken`, `verifyShareLink`, `SHARE_LINK_TTL`.
- `src/sharelink.js` — new `handleShareLinkRequest`.
- `src/notification.js` — `sendShareLinkConfirm`.
- `src/index.js` — route `/auth/sharelink`; accept `sharelink` token in `?token=`.
- `blocks/customer-picker/customer-picker.js` / `.css` — dialog share form.
- `test/sharelink.test.js`, additions to `session.test.js` / `index.test.js`.
