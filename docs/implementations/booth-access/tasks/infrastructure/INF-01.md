# INF-01: Private roster and preparation contract

| Field | Value |
|---|---|
| Domain / size | Infrastructure / M |
| Wave / stream | 0 / A |
| Dependency | ARC-01 |

## Problem and objective

The current public report index has event membership but no private attendee-to-report mapping. Provision an approved, private, event-scoped store with a documented way to load, reconcile, revoke and delete assignments. Do **not** create an import script for authored site content or put emails in DA `/data/`.

## Read first and follow

- `workers/cloudflare/cug-adobe-oauth-worker/wrangler.toml:1-65`: environment bindings.
- `workers/cloudflare/cug-adobe-oauth-worker/src/session.js:1-30`: existing `SESSIONS` KV use.
- `workers/cloudflare/cug-adobe-oauth-worker/test/helpers.js:1-34`: test KV mock.
- `docs/integrations/event-tabs-and-event-membership.md:1-110`: report/event sheet contract (not a roster).
- `docs/implementations/booth-access/context/target-design.md`: approved data shape.

## Files to modify/create

- Modify `workers/cloudflare/cug-adobe-oauth-worker/wrangler.toml` to declare a **separate** private event-roster binding for applicable environments; IDs come from the owner through approved provisioning, not fabricated values.
- Create `docs/implementations/booth-access/operations.md` with approved roster format, event ID, reconciliation, status/expiry, authorized operators, no-PII-in-Git policy, retention and correction/deletion steps.
- Extend `workers/cloudflare/cug-adobe-oauth-worker/test/helpers.js` only if a second KV binding is needed for tests.

## Deliverables and checks

1. Store is inaccessible from static site URLs and never returned wholesale to the browser.
2. Operations reject duplicates, missing/invalid report paths, inactive events and conflicting attendee assignments before activation.
3. An event can be disabled or corrected without editing client code.
4. Plan the **staff-only CUG** for the DA-authored `/booth` page and the explicit `/login?staff&redirect=<encoded /booth?event=...>` bookmark for unmanaged devices. Do not depend on the normal CUG redirect to surface the hidden staff form.
5. Run `cd workers/cloudflare/cug-adobe-oauth-worker && npx vitest run test/stafflogin.test.js` and `npx wrangler deploy --dry-run --env summit` when bindings are provisioned, then `git diff --check`. A dry run is **not** permission to deploy.

No other Wave 0 task edits `wrangler.toml` or `operations.md`. Do not commit real emails, Worker KV IDs obtained from another environment, credentials or roster exports. Done means BE-01 can read a stable approved event record in tests.
