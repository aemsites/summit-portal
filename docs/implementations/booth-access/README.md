# Reusable booth access

**October 1 implementation:** the approved Entry/Finish design now has an isolated
Worker runtime. This is a reusable CUG-authorized prototype, not an event roster
system. Deployment, real email receipt, final hardware rehearsal and PR merge
are separate gates; code and fixture tests do not prove those gates passed.

## Approved scope

`/booth` and every booth API are **staff-only**. Staff sets up the device through
`/login?staff&redirect=%2Fbooth`; staff authentication remains in the existing
secure HttpOnly session cookie, not an attendee URL token. At `/booth`,
the attendee enters a **business email**. The Worker matches its **exact address
or domain** against existing CUGs to discover prepared account insight reports. One
eligible website report opens directly; several require an explicit picker.
There is no event selection, private attendee roster, registration-email match,
guessed website, company search or new access grant.

The real report retains its content and gains a fixed, touch-friendly **Finish
reading my report** control only when its pathname exactly matches the valid
server context. It returns to `/booth?step=finish`. **Email my report** sends to
the address stored by lookup; the browser cannot supply another recipient or
path. Adobe specialist/follow-up guidance remains informational. Reset clears
attendee state, not the staff login or non-PII device-mode marker.

**Identity limitation:** asserted email is identification, not authentication.
Anyone asserting a permitted address or domain can view its prepared reports on
this staff-authenticated kiosk. CUGs can contain exact emails as well as domains;
an exact-email entry does not permit neighboring addresses at that domain.
CUGs are not registration lists. Staff identities never discover every company.
Addresses without an authored customer CUG permission do not qualify.

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
change it. The emailed link contains only the recipient's matching **authored
email/domain CUG groups**, not a report-exclusive grant. It opens the selected
report first, and may authorize other reports permitting those exact groups.
Exact-email share redemption does not add the recipient's unauthorized domain.
Copy without a recipient excludes both staff domains and exact staff emails;
an exact customer group becomes the token's email unchanged. Expiry, session
method attribution, templates and existing domain-grant behavior stay unchanged.

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

**Verification recorded October 1:** full Worker Vitest: 268 passed, one existing
skip; targeted Chrome WTR: six passed; new/isolated runtime and CSS lint clean;
Wrangler summit dry-run passed. Local real workerd
smoke verified staff shell, three bundled assets, actual Durable Object
lookup/status/reset and anonymous 401 without customer discovery/mail. Explicit
Playwright fixtures passed portrait/mobile, long report, picker, failed delivery,
idle/bfcache/back and reset-failure checks. Repository-wide `npm run lint` still
fails on existing lint debt, including four pre-existing `cug.js`/`index.js`
errors; no mass autofix is included.

Exact-email regressions were run red before the correction, then green through
fresh discovery, the real booth/share handler, signed token mint/redemption and
current CUG enforcement. A synthetic approved address succeeds; its neighbor,
an unrelated report and a report permitting only the otherwise unauthorized
recipient domain remain denied. Revoked mapping permission blocks booth send.
Operational group logs use counts, never raw exact-address groups.

Entry status/idle-reset network failures now expose a **Retry and clear screen**
control rather than permanently disabling lookup. It uses the guarded server
reset path and keeps lookup blocked until `{ state: "entry" }` confirms cleanup.
Two browser regressions went red before this fix and pass afterward. Explicit
portrait/mobile rendering confirms a 62px recovery control, no horizontal
overflow and no false success after a failed reset.

**Live rollout evidence:** parent deployed `0a5949b7`, Worker version
`057e241a-4bb3-4cb2-9538-7a0ef313c77b`. The approved exact-email lookup opened
one prepared report directly; real content and the fixed Finish control were
visible at the top of a long report. One deliberate email request returned
`sent: true` / `delivery: "sent"` and UI confirmation. **Inbox receipt is not
verified.** Clear restored Entry without a selected path and retained staff
authentication. Earlier failures were Cloudflare workerd rejecting
`redirect: "error"`; discovery now uses supported `manual` and rejects actual
redirect responses, followed by a 404 that exposed an authorized exact-email CUG entry that
the domain-only matcher overlooked. This branch corrects that matcher without
editing production CUG data or granting its entire domain.

The production Back test then exposed a **fresh report reload** after reset,
not a bfcache restore: staff remained authorized and the old document returned
without attendee context. The earlier browser fixture did not cover this server
boundary. A new signed, staff-session-bound **booth-device marker** now limits
account document GET/HEAD to the exact live selected report, both before origin
fetch and before returning its body. Reset retains this non-PII marker. Missing,
expired, wrong or reset context redirects to Entry; malformed/expired/rotated
markers deny rather than bypass; source failures remain fail-closed. Fresh
document and concurrent-reset regressions pass locally. Production verification
of this final history correction remains pending; do not resend the real email.

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
promise. The device marker is a scoped account-document boundary, not a complete
browser lock. It expires no later than the authenticated staff JWT and binds to
that exact session; unmarked ordinary staff browsing is unchanged. Assets,
downloads, other portal routes and already-delivered content are not a global
kiosk lockdown. **Staff: sign out and leave booth mode** clears attendee state,
device marker and staff cookies; broader staff browsing then requires login.
Disable address
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
