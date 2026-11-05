# CUG Worker Demo Guide

Walkthrough of the main use cases for the Cloudflare CUG worker with Adobe IMS authentication.

## URLs

| Environment | URL |
|-------------|-----|
| AEM Author | https://author-p130360-e1560298.adobeaemcloud.com/ui#/aem/sites.html/content/cloudfare1 |
| Closed User Groups | https://author-p130360-e1560298.adobeaemcloud.com/content/cloudfare1/closed-user-groups.html |
| Group Mapping | https://author-p130360-e1560298.adobeaemcloud.com/content/cloudfare1/closed-user-groups-mapping.html |
| Edge Delivery | https://main--cloudfare1--jckautzmann.aem.live/members |
| Cloudflare CDN | https://aem-cug-cloudfare-jck1.com/members |
| Log out | https://aem-cug-cloudfare-jck1.com/auth/logout |

---

## Prerequisites

- An Adobe IMS account (e.g., `alice@adobe.com`)
- The `closed-user-groups` spreadsheet is published with CUG rules
- The `closed-user-groups-mapping` spreadsheet is published with group-to-page mappings

## DIH server-to-server share links (deployment pending)

DIH users can copy a 30-day Customer Portal link without opening the Portal
dashboard. **Any authenticated DIH user** may request it; the Portal applies no
additional actor-domain or staff-role restriction. The DIH backend must authenticate
the user and supply their email. `actor_email` is audit context, not a recipient
or a Portal login credential. Never expose the service secret to a browser.
The existing staff `/auth/sharelink` endpoint keeps its session/IMS and staff
checks, email mode, and CORS behavior.

### Credential setup

These are operator instructions, not steps performed by this source change:

1. Generate a dedicated, cryptographically random secret of at least 32 characters.
   Store it in the DIH backend's server-side secret manager and the Worker secret
   `DIH_SHARE_LINK_SECRET`. Do not reuse, export, or rotate `JWT_SECRET` for this
   integration. Leading/trailing whitespace and control characters are rejected.
2. From this Worker directory, use
   `npx wrangler secret put DIH_SHARE_LINK_SECRET --env summit` for the Summit
   environment. Use the environment-specific secret command for other environments.
   Secrets are not inherited across Wrangler environments. Never add real values
   to `wrangler.toml`, source, examples, browser assets, or logs.
3. Coordinate Worker deployment with backend configuration and verify a synthetic
   request against an approved customer page. Confirm token redemption, 30-day
   expiry, no email delivery, and `Cache-Control: private, no-store`.
   Source tests and `wrangler deploy --dry-run` do not deploy the endpoint.

### Request and signature contract

`POST /auth/sharelink/dih` accepts UTF-8 `application/json` (optionally
`; charset=utf-8`) with **exactly** two fields:

```json
{"path":"/accounts/a/acme/insights/index","actor_email":"seller@example.com"}
```

`path` uses the existing same-origin safe-path validator. `actor_email` must be a
string matching a basic email shape. Fields such as `mode`, `email`, or any other
extra key are rejected. There is no email-delivery option.

- `X-DIH-Timestamp`: decimal integer Unix seconds, within **300 seconds inclusive**
  of the Worker clock in either direction.
- `X-DIH-Signature`: lowercase 64-character hexadecimal HMAC-SHA256 with the dedicated
  secret over the UTF-8 bytes of the following string (no trailing newline unless
  it is part of `exactBody`):

```text
${timestamp}\nPOST\n/auth/sharelink/dih\n${exactBody}
```

Serialize the body once, sign it, then send those exact bytes. Whitespace, Unicode
encoding, actor, path, timestamp, method, and route must match. The Worker verifies
with Web Crypto rather than comparing MAC strings. Request bodies are limited to
8,192 bytes, including streamed bodies. Timestamps provide freshness, not one-time
use: an authenticated request can be replayed inside that window.

This route does not return browser CORS headers; `OPTIONS` returns `405`.
Cookies, IMS bearer credentials, and ordinary Portal logins never substitute for
service authentication. Keep the existing IMS client configuration unchanged.

### Responses and grant behavior

Success is `200` with
`{"result":"link","link":"https://<request-origin>/<page-path>?token=<signed-token>"}`.
The existing minting logic issues the same 30-day share JWT using `JWT_SECRET`,
not the HMAC service secret. It selects the longest covering CUG mapping scope,
prefers sheet groups over live headers over mapping groups, and excludes staff
domains and exact staff emails. The actor is never granted access through their
own identity. No recipient confirmation or internal-notification email is sent.

Errors:

| Status | Meaning |
|---|---|
| `400` | Invalid UTF-8, JSON/schema, actor email or safe path; or no customer group |
| `401` | Missing/invalid/stale timestamp or missing/malformed/incorrect signature |
| `404` | No covering CUG mapping |
| `405` | Method other than POST (`Allow: POST`) |
| `413` | Body exceeds 8,192 bytes |
| `415` | Content type is not supported UTF-8 JSON |
| `500` | Share-token minting or unexpected access-resolution failure |
| `502` | Existing CUG mapping lookup failed |
| `503` | Dedicated service secret missing or malformed |

Method and configuration checks run before authentication; schema checks follow
signature verification. All service responses, including errors, use
`Cache-Control: private, no-store`. Audit output includes the pathname and a
masked actor (`***@example.com`), not the full email, secret, signature, query
string, or resulting signed link. Shared CUG diagnostics also omit query strings.

### Rotation and rollback

Rotate the dedicated service secret in both server-side stores together; this
single-key contract has no overlap period, so mismatched versions return `401`.
To disable new service minting, remove `DIH_SHARE_LINK_SECRET` from the target
Worker environment (for Summit:
`npx wrangler secret delete DIH_SHARE_LINK_SECRET --env summit`) and disable the
DIH integration. The endpoint then returns `503`; staff sharing is unaffected.
Alternatively roll the Worker back to the previous approved version and disable
the caller. Already minted links retain their normal expiry and current CUG
enforcement; removing this service secret does **not** revoke them. Do not rotate
`JWT_SECRET` as a service rollback: that affects other Portal tokens and sessions.

---

## 1. Public page — no authentication required

**Goal:** Pages without CUG rules are accessible to everyone.

1. Open `https://aem-cug-cloudfare-jck1.com/` (home page)
2. The page loads immediately — no sign-in prompt
3. Open DevTools > Network — no redirects to Adobe IMS

**What happens:** The origin response has no `x-aem-cug-required` header, so the worker serves the page as-is.

---

## 2. Protected page — unauthenticated visitor

**Goal:** Visiting a CUG-protected page without signing in redirects to Adobe IMS.

1. Open a private/incognito window
2. Navigate to `https://aem-cug-cloudfare-jck1.com/members/adobe`
3. You are redirected to the Adobe IMS sign-in page
4. The URL bar shows `ims-na1.adobelogin.com/ims/authorize/v2?...`

**What happens:** The origin returns `x-aem-cug-required: true`. The worker sees no `auth_token` cookie and redirects to IMS.

---

## 3. Protected page — sign in and access

**Goal:** After signing in, the protected page is served.

1. Continue from the previous step — sign in with your Adobe account
2. After sign-in, you are redirected back to `https://aem-cug-cloudfare-jck1.com/members/adobe`
3. The page content is now visible
4. Open DevTools > Application > Cookies — you can see an `auth_token` cookie (this is the signed JWT)

**What happens:** IMS redirects to `/auth/callback` with an authorization code. The worker exchanges it for tokens, creates a signed JWT with the user's email and group, sets the `auth_token` cookie, and redirects to the originally requested page.

---

## 4. Protected page — unauthorized group

**Goal:** A signed-in user who is not in the required group is denied access.

1. Sign in with an account whose email domain is NOT in the allowed CUG groups (e.g., `user@gmail.com` trying to access a page restricted to `adobe.com`)
2. Navigate to the restricted page
3. You are redirected to `/403`

**What happens:** The origin returns `x-aem-cug-groups: adobe.com`. The worker checks the user's group (derived from email domain) and finds no match, so it redirects to `/403`.

---

## 5. Portal redirect — "Access Your Portal"

**Goal:** A single link routes each user to the right members page based on their group.

### 5a. Not signed in

1. Open a private/incognito window
2. Click the "Access Your Portal" link (or navigate to `https://aem-cug-cloudfare-jck1.com/auth/portal`)
3. You are redirected to the Adobe IMS sign-in page
4. Sign in with `alice@adobe.com`
5. After sign-in, you land on `https://aem-cug-cloudfare-jck1.com/members/adobe`

### 5b. Already signed in

1. With an active session (the `auth_token` cookie exists), navigate to `/auth/portal`
2. You are immediately redirected to the page for your group (e.g., `/members/adobe` for `adobe.com` users)

**What happens:** The worker fetches `/closed-user-groups-mapping.json` from the origin, which contains:

```json
{ "data": [
  { "group": "adobe.com", "url": "/members/adobe" },
  { "group": "gmail.com", "url": "/members/google" }
]}
```

It matches the user's group against the mapping and redirects to the corresponding URL. If no match is found, it falls back to `/members`.

---

## 6. Logout

**Goal:** Sign out and terminate the session.

1. Navigate to `https://aem-cug-cloudfare-jck1.com/auth/logout`
2. You are redirected to Adobe IMS logout, then back to the home page
3. The `auth_token` cookie is cleared
4. Navigate to a protected page — you are prompted to sign in again

**What happens:** The worker clears the `auth_token` cookie and redirects to `ims-na1.adobelogin.com/ims/logout/v1`, which terminates the Adobe IMS session. Without both the local JWT and the IMS session, the user must sign in again to access protected content.

**Important:** Simply deleting the `auth_token` cookie in DevTools is NOT sufficient to log out. The Adobe IMS session remains active, so the next visit to a protected page triggers a silent re-authentication (IMS auto-signs you in). Always use `/auth/logout` to fully sign out.

---

## Summary of routes

| Route | Purpose |
|-------|---------|
| `/auth/portal` | Authenticate (if needed) then redirect to the user's group page |
| `/auth/callback` | OAuth callback (internal, not user-facing) |
| `/auth/logout` | Clear session cookie and sign out of Adobe IMS |
| `/403` | Shown when the user's group does not match the required CUG groups |
| Everything else | Proxied to the AEM origin; CUG headers enforced if present |
