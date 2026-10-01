# Reusable booth access

**October 1 implementation:** the approved Entry/Finish design now has an isolated
Worker runtime. This is a reusable domain-based prototype, not an event roster
system. Deployment, real email receipt, final hardware rehearsal and PR merge
are separate gates; code and fixture tests do not prove those gates passed.

## Approved scope

`/booth` and every booth API are **staff-only**. Staff sets up the device through
`/login?staff&redirect=%2Fbooth`; staff authentication remains in the existing
secure HttpOnly session cookie, not an attendee URL token. At `/booth`,
the attendee enters a **business email**. The Worker uses the email's domain to
discover prepared account insight reports permitted by existing CUGs. One
eligible website report opens directly; several require an explicit picker.
There is no event selection, private attendee roster, registration-email match,
guessed website, company search or new access grant.

The real report retains its content and gains a fixed, touch-friendly **Finish
reading my report** control only when its pathname exactly matches the valid
server context. It returns to `/booth?step=finish`. **Email my report** sends to
the address stored by lookup; the browser cannot supply another recipient or
path. Adobe specialist/follow-up guidance remains informational. Reset clears
attendee state, not the staff login.

**Identity limitation:** asserted email is identification, not authentication.
Anyone knowing a permitted domain can view its prepared reports on this
staff-authenticated kiosk. CUGs are domain permissions, not registration lists.
Staff domains never discover every company. Personal addresses without a
customer CUG permission do not qualify.

## Implementation

| Surface | Source |
|---|---|
| Evergreen shell | Root `booth.html`, served at exact `/booth` by Worker |
| Entry, picker, Finish | `scripts/booth.js`, scoped `styles/booth.css` |
| Actual report control | `scripts/booth-report.js`, shared lazy import and context-only Worker injection |
| Staff/context/discovery | Worker `src/booth.js`, `BoothCoordinator` Durable Object, existing `SESSIONS` KV |
| Bundled shell/assets | Worker `src/booth-shell.js`, exact Wrangler Text-module rules |
| Delivery | Existing `handleShareLinkRequest`, APO notification and CUG policy |

Wrangler bundles the **single source** shell, stylesheet and two scripts, so
the deployed Worker can serve the complete booth before the frontend PR merges.
All other assets/content continue using the existing production origin. The
logo and Adobe Clean Typekit reference are the approved design assets.
No global origin switch, content imports, DA credentials or authored booth page
are required. `ak.js` and `aem.js` are untouched; the standalone kiosk shell
does not load the ordinary portal chrome or analytics.

See [target design / API contract](context/target-design.md) for authorization,
context lifetime, concurrency and failure semantics.

## Email policy (corrected historical claims)

The current repository's `SHARE_LINK_TTL` is **30 days**, not the seven days
claimed by the September planning documents. This implementation does not
change it. The emailed link is a **customer-domain CUG grant**, not a
report-exclusive grant. It opens the selected report first, and may authorize
other reports permitting that domain. Existing share-link expiry, redemption,
templates and global staff/share-link behavior remain unchanged.

APO success confirms dispatch, not inbox receipt. Upstream failure is explicit.
An uncertain send is not automatically retryable: a durable `attempted` record
is persisted before contacting APO, so crashes, duplicate taps and races cannot
issue a second send for that context. Staff should investigate uncertain delivery
before starting another lookup. This trades automatic retry for avoiding
duplicate mail; it is not a guarantee of delivery.

## Local verification

```sh
npm ci
cd workers/cloudflare/cug-adobe-oauth-worker
npm ci
npm test
npx wrangler deploy --env summit --dry-run
cd ../../..
npm run test:file -- test/scripts/booth.test.js
npx eslint scripts/booth*.js workers/cloudflare/cug-adobe-oauth-worker/src/booth*.js
npx stylelint styles/booth.css
```

For an explicitly isolated browser fixture:

```sh
node test/fixtures/booth-server.mjs
```

Preview `http://localhost:3000/content/index`. This server **does not implement
live auth or delivery**; without test interceptions it reports an unavailable
API. `test/fixtures/booth-browser.js` exports a Playwright runner accepting
`page`, with explicitly intercepted synthetic network data. It exercises
2160 × 3840 CSS-pixel Entry/picker/long report/Finish/send/reset and 390 × 844
mobile, safe labels, reduced motion, failed send, idle, bfcache and reset failure.
No simulated-success mode is shipped in runtime code. The historical
`design/booth-preview.html` stays a mockup, never the production route.

**Verification recorded October 1:** full Worker Vitest: 251 passed, one existing
skip; targeted Chrome WTR: four passed; changed runtime/module CSS lint clean;
Wrangler summit dry-run passed (109.38 KiB / 27.42 KiB gzip). Local real workerd
smoke verified staff shell, three bundled assets, actual Durable Object
lookup/status/reset and anonymous 401 without customer discovery/mail. Explicit
Playwright fixtures passed portrait/mobile, long report, picker, failed delivery,
idle/bfcache/back and reset-failure checks. Repository-wide `npm run lint` still
fails on existing lint debt; no mass autofix is included.

## Deployment and demo gates

Authorized operator, after reviewing the exact commit:

```sh
cd workers/cloudflare/cug-adobe-oauth-worker
npx wrangler whoami
npx wrangler deployments list --env summit
npx wrangler deploy --env summit --dry-run
# Only with activation approval:
npx wrangler deploy --env summit
```

The config adds `BOOTH_COORDINATOR` and SQLite Durable Object migration
`booth-v1`; preserve existing KV/D1 IDs, staff epoch, origin and secrets.
The Worker needs the existing JWT/staff/origin/APO configuration and access to
the complete private report index, CUG sheet and CUG mapping. A missing
binding/data/template fails closed; do not substitute fixture data in production.

The functional URL is **`https://act.aem.now/booth` after Worker deployment**.
An AEM feature preview alone does not serve the booth auth APIs or deployed
Worker shell. Feature preview can inspect code/assets, not prove the integrated
demo or real email. Authenticate the actual device, look up an approved test
customer, confirm the expected report, send once, check actual recipient receipt,
then rehearse reset and back/idle behavior on the final screen/network.

Shared-device browser lockdown is an **operational gate**, not a UI security
promise. The existing staff session can access other reports. Disable address
bar/history/tab escape using managed kiosk controls and keep staff nearby.
Ten-minute server expiry and two-minute interactive idle reset do not revoke
that session. A failed report reset hides old report content and keeps a visible
recovery message; staff must resolve it before the next visitor.

## Planning history

The former ten-task roster/report-exclusive-token roadmap is **superseded**,
not completed as originally specified. [Tracker](tracker.md) records the scope
reductions and remaining operational gates. The design review source and
shareable export remain preserved; no redesign or unrelated report layout work
is included. Any co-brand presentation/configuration beyond the default Adobe
chrome, new personal-email grants, event lists or booking flow requires a
separate agreed change.
