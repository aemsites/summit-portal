# Target design / implemented contract

This replaces the September event-roster proposal. No private roster, event
binding, roster provisioning or new report-exclusive token is implemented.
The dedicated booth credential, persistent kiosk boundary and lifecycle
hardening below are local changes pending reviewed Worker/asset activation.

## Flow

`staff login → /booth → CUG-authorized email lookup → one real report OR explicit picker →
real report → /booth?step=finish → deliberate email send → reset → /booth`

Report and Finish can also return to the attendee's authorized picker, with
one active selection and the original absolute expiry.

The standalone semantic shell and approved portrait CSS are bundled from
repository source into the Worker using exact Text-module rules. The ordinary
portal root/login/report content and production origin remain unchanged.
Report-return is injected only into a successful HTML response after normal
CUG enforcement and exact context-path matching. The same idempotent helper
loads from shared `lazy.js` after frontend deployment. No query flag enables it.

## API

Staff setup accepts verified OAuth or event staff login and retains the existing
epoch kill switch. It replaces broad authentication with a dedicated
`booth_session` credential, rejected by general `getSession`. Booth endpoints
validate that scoped identity, expiry, epoch and device binding. Bearer-only and
customer share-link sessions cannot become kiosk authentication. Responses are
`private, no-store`.

All POSTs require an exact same-origin `Origin` header and JSON content type.
Neither email nor token is returned to the attendee, analytics or browser storage.

| Endpoint | Input | Success |
|---|---|---|
| `GET /auth/booth/status` | Cookies only | `{ state: "entry" }`, or picker/report context with `canChooseAnother`, original `expiresAt` and current report's delivery state; report state returns `candidates: []` |
| `POST /auth/booth/lookup` | `{ email }` only | `{ state, selectedPath, candidates, expiresAt, canChooseAnother }`; a single candidate is selected directly |
| `POST /auth/booth/select` | `{ path }` only | Selects an exact stored candidate after fresh revalidation; returns report state with original expiry, `canChooseAnother` and that report's delivery/view outcomes |
| `POST /auth/booth/picker` | `{}` only | Revokes active selection; returns `{ state: "picker", candidates, expiresAt }` without another email lookup or expiry extension |
| `POST /auth/booth/send` | `{}` only | `{ sent: true }`; email and path derived exclusively from context |
| `POST /auth/booth/reset` | `{}` | `{ state: "entry" }`; removes attendee context/cookie, retains scoped booth credentials and kiosk boundary |
| `POST /auth/booth/exit` | `{}` | `{ state: "entry" }`; clears attendee and authentication/device credentials, preserves kiosk boundary; UI navigates to booth staff login |

Candidate shape: `{ path, label }`. Labels come from trusted `Customers`/`Report`
index text and are rendered with `textContent`, not HTML. Error JSON contains
`error`: 400 malformed/select/send input, 401 missing/expired/revoked staff,
403 wrong origin/binding or revoked permission, 404 no prepared authorized report,
405 wrong method, 409 uncertain delivery already attempted, 410 expired context,
502 unavailable private data or failed mail, 503 missing coordinator binding.

## Discovery authority

Server fetches all pages of `/data/insights-list.json`,
`/closed-user-groups.json` and `/closed-user-groups-mapping.json` from the
configured private origin, using the origin token if configured. Fetches have
bounded time/pagination, bypass stale caches, reject redirects, and fail closed
on missing/malformed/incomplete data. The complete catalogue/CUG list never
reaches the client.

`Folder` must be a canonical trailing-slash generated account insight path:
`/accounts/<letter>/<account>/insights/<website>/[variant]/`.
Authoritative sheet groups use the existing `parseCugSheetRows` /
`matchSheetGroups` most-specific matching semantics. The most-specific mapping
scope must also permit the customer's exact email or domain for mail eligibility. Existing
staff-wide grants are never attendee discovery permission.

The shared normalized group matcher distinguishes exact address entries from
domain entries. An exact address does not authorize other addresses at the
same domain. Booth discovery/mapping, staff share delivery, self-service
magic-link mapping, portal mapping and actual CUG enforcement reuse it.
Signed session email can match an exact-address CUG; explicit signed groups
remain authoritative for domain and delegated bearer grants.

Filter authorized candidates **before** collapsing aliases by website slug.
Prefer an authorized `portal-landing`, otherwise the latest authorized variant
by `Created` (DIH `D.MM.YYYY`, with ISO dates supported). One website result opens
directly. Several websites require explicit selection, not arbitrary company
search. Selection and send refetch/revalidate current index and permissions;
the selected path must still be the prepared authorized candidate.

## Attendee context and concurrency

Opaque random `booth_context` cookie: HttpOnly, Secure, SameSite=Strict, root
path, ten-minute maximum age. It identifies a Durable Object, not an identity or
an access grant. The coordinator binds the context to the scoped booth credential
and rejects another session.

Authenticated `/booth` issues signed HttpOnly/Secure/SameSite=Lax
`booth_session` (purpose `booth-session`) and `booth_device` (purpose
`booth-device`) cookies, bound to the same random identifier and original
absolute staff expiry. General `getSession` rejects both purposes. The scoped
validator checks staff identity and `EVENT_CRED_EPOCH`. It clears broad
`auth_token`, `signed_in` and the old attendee cookie during legacy migration.
Only `/booth`, never the dashboard, performs that migration.

Persistent `booth_kiosk=1` has a one-year Max-Age and survives reset, expiry,
logout and explicit signout. OAuth/re-login on that browser stays scoped and
must revoke the previous visit before replacing credentials. Missing/malformed
markers cannot turn an existing scoped credential into general staff access.
This is a server route boundary, not protection against deliberate browser/OS
tampering. Staff administration uses a separate unmarked browser/device.

GET/HEAD access permits the canonical selected document, bare alias and safe
PNG/JPEG/WebP/GIF/AVIF/SVG/CSS/JS descendants. Root hashed image media requires
a live context; known shared static assets remain available. Private
dependencies receive fresh CUG and mapping checks. Origin CUG enforcement uses
attendee identity/grants, never staff-wide authorization. Private indexes/APIs,
other reports, raw representations, PDFs and arbitrary sharing are denied.
MIME, Content-Disposition and redirect checks also cover opaque export URLs.
The Worker checks before origin fetch and again before returning a response;
reset/selection races cannot return stale private content. Missing/expired
context returns to `/booth`; coordinator failure is an explicit fail-closed 503.
Ordinary browsing/redemption on unmarked browsers remains unchanged.

`SESSIONS` KV holds an immutable `booth:<random key>` record with asserted email
and candidate paths for ten minutes. Durable Object storage holds the binding,
record key, selected path, absolute expiry and per-report delivery/view outcomes.
Every operation is serialized, including the expiry alarm. Durable storage—not eventually
consistent KV—is the selected/send/reset authority. Reset removes its pointer
before deleting KV; an old KV copy cannot resurrect a reset visitor. The expiry
alarm removes the record; each request also checks absolute expiry and staff
epoch/session, including immediately before dispatch.

Before calling server-only `sendAuthorizedBoothReport`, persist that report's
`delivery: "attempted"`. The helper receives freshly authorized context-derived
recipient/path/grants; no request header or client flag bypasses general sharing.
After confirmed dispatch persist `"sent"`. Duplicate completed sends return
`{ sent: true }` without another upstream call. Unknown/failed sends remain
non-retryable in that context, including after isolate restart or switching
away and back. Another authorized report can be delivered independently.
Reset/new lookup starts a new visitor context, so operator judgment is still needed before
manually retrying an uncertain email. No exact-once/inbox-delivery claim.

Current share links retain their **30-day TTL** and only grant matching authored
email/domain groups. Exact-email share redemption retains those explicit groups
without implicitly adding an unauthorized recipient domain; legacy/domain links
keep their previous domain behavior. Copy without a recipient excludes full
staff-email groups as well as staff domains and uses an exact customer email
verbatim as token identity. Session lifetimes/method attribution, templates,
ordinary non-booth staff authentication and production CUG data are unchanged.

## Kiosk lifecycle and presentation

Entry has no autofocus that forces a touchscreen keyboard. Decorative motion
controls do not ship. Finish uses actual server
sent/attempted state; sales copy is non-interactive. No attendee email appears
in URL, localStorage or sessionStorage.

Server-marked report, demo and request HTML is concealed by an early head style,
before any report content renders. The injected module carries the trusted
`data-booth-mode` and absolute `data-booth-expires-at` deadline. The adapter
installs deadline/idle/history cleanup before verifying server status. Content
is revealed only for the exact active path and future, bounded expiry; failed
or timed-out verification keeps it hidden behind `#booth-recovery`. The fallback
stays visible without JavaScript and gives staff guidance in noscript. After
verification, the adapter removes the temporary concealment
wrapper while preserving its original nodes, listeners and direct-body layout.

Two-minute idle reset applies on booth and active report; an absolute
ten-minute context timeout also resets. On pagehide, the booth scrubs inputs and
panels; bfcache pageshow and history pop reset server context before showing
Entry. The report hides its cached document and clears on bfcache return.
Its fixed Finish bar is visible at the top of long content, reserves measured
bottom padding and does not replace/report reconstruct content. If reset
fails, old report content stays hidden behind a neutral recovery surface.
Entry status/reset failure displays **Retry and clear screen** (or staff login
for 401). Retry requires both a successful HTTP response and confirmed
`state: "entry"` from the serialized reset path, not a blind local unlock.
Lookup remains disabled and keyboard/stale-submit guarded until the server
confirms an entry-state reset. Locally cached attendee state is scrubbed even
when cleanup fails; recovery remains visible after a failed bfcache reset.

Primary design target is **2160 × 3840 CSS pixels**, with 68px input text and
approximately 134px Entry action height. Smaller screens retain functional controls.
Approved Adobe logo/product name and original Entry/Finish design are reused;
no unrelated report restyling or invented booking action.

**Choose another report** is available on personal reports and Finish when
there is another authorized candidate. It first revokes the active selection,
then returns to the original candidate set without another email lookup or
deadline extension. Selection rechecks fresh permissions. A failed transition
conceals old content and requires clearing before reuse.

Booth-only PDF/download actions are disabled regardless of file extension,
including carousel and report-download controls created after verification.
Links and forms cannot open another tab. A report-control notice explains that
PDFs are available in the emailed report; ordinary portal downloads are unchanged.

## Separate rollout gates

Reviewed Worker deploy including `BOOTH_COORDINATOR` binding and `booth-v1`
migration; existing private origin and APO credentials/template; staff setup on
the actual device; owner acceptance of asserted-email/domain access; real recipient
receipt; final portrait/browser/network rehearsal; managed kiosk lockdown.
PR creation, code sync, Worker activation and merge are separate. The source
implementation is not a claim those gates passed.
