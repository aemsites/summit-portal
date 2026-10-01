# Target design / implemented contract (October 1)

This replaces the September event-roster proposal. No private roster, event
binding, roster provisioning or new report-exclusive token is implemented.

## Flow

`staff login → /booth → CUG-authorized email lookup → one real report OR explicit picker →
real report → /booth?step=finish → deliberate email send → reset → /booth`

The standalone semantic shell and approved portrait CSS are bundled from
repository source into the Worker using exact Text-module rules. The ordinary
portal root/login/report content and production origin remain unchanged.
Report-return is injected only into a successful HTML response after normal
CUG enforcement and exact context-path matching. The same idempotent helper
loads from shared `lazy.js` after frontend deployment. No query flag enables it.

## API

Every endpoint requires a valid `getSession` session whose email domain is in
`staffDomains` and method is verified `oauth` or `staff`; generic event login
retains the existing `gen_epoch` kill switch. Bearer-only and share-link sessions
are not kiosk staff authentication. Responses are `private, no-store`.

All POSTs require an exact same-origin `Origin` header and JSON content type.
Neither email nor token is returned to the attendee, analytics or browser storage.

| Endpoint | Input | Success |
|---|---|---|
| `GET /auth/booth/status` | Cookies only | `{ state: "entry" }`, or `{ state: "picker", candidates, selectedPath: null, sent, delivery, expiresAt }`, or `{ state: "report", candidates: [], selectedPath, sent, delivery, expiresAt }` |
| `POST /auth/booth/lookup` | `{ email }` only | `{ state, selectedPath, candidates, expiresAt }`; a single candidate is selected directly |
| `POST /auth/booth/select` | `{ path }` only | Selects one exact stored candidate after fresh revalidation; returns `{ state: "report", selectedPath, expiresAt }` |
| `POST /auth/booth/send` | `{}` only | `{ sent: true }`; email and path derived exclusively from context |
| `POST /auth/booth/reset` | `{}` | `{ state: "entry" }`; removes attendee context and expires booth cookie, not staff cookie |
| `POST /auth/booth/exit` | `{}` | `{ state: "entry" }`; clears attendee, device-mode and staff cookies; UI navigates to staff login |

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
an access grant. The coordinator binds a context to the SHA-256 digest of the
actual authenticated staff token and rejects another staff session.

Authenticated `/booth` also sets a separate signed HttpOnly, Secure,
SameSite=Strict `booth_device` cookie containing only purpose, the staff-token
digest and an expiry no later than that staff JWT. It survives attendee reset
and expiry, not explicit mode exit. Marked account document GET/HEAD requires
valid bound staff/device and a live context selecting the exact pathname.
The Worker checks before origin fetch and again before returning the document;
the final helper-state check also denies if a concurrent reset cleared context.
Missing/expired/reset/wrong context redirects to `/booth`; coordinator failure
returns an explicit fail-closed 503. Canonical slash redirects remain intact.
Ordinary unmarked browsing/redemption, root/login and asset routes stay unchanged;
normal CUG authorization remains required even for the selected report.

`SESSIONS` KV holds an immutable `booth:<random key>` record with asserted email
and candidate paths for ten minutes. Durable Object storage holds the binding,
record key, selected path, absolute expiry and delivery outcome. Every operation
is serialized, including the expiry alarm. Durable storage—not eventually
consistent KV—is the selected/send/reset authority. Reset removes its pointer
before deleting KV; an old KV copy cannot resurrect a reset visitor. The expiry
alarm removes the record; each request also checks absolute expiry and staff
epoch/session, including immediately before dispatch.

Before calling existing real share-link delivery, persist `delivery: "attempted"`.
After confirmed dispatch persist `"sent"`. Duplicate completed sends return
`{ sent: true }` without another upstream call. Unknown/failed sends remain
non-retryable in that context, including after isolate restart. Reset/new lookup
starts a new visitor context, so operator judgment is still needed before
manually retrying an uncertain email. No exact-once/inbox-delivery claim.

Current share links retain their **30-day TTL** and only grant matching authored
email/domain groups. Exact-email share redemption retains those explicit groups
without implicitly adding an unauthorized recipient domain; legacy/domain links
keep their previous domain behavior. Copy without a recipient excludes full
staff-email groups as well as staff domains and uses an exact customer email
verbatim as token identity. Session lifetimes/method attribution, templates,
staff authentication and production CUG data are unchanged.

## Kiosk lifecycle and presentation

Entry has no autofocus that forces a touchscreen keyboard. Motion has Pause/
Play, pauses on focus, and respects reduced-motion. Finish uses actual server
sent/attempted state; sales copy is non-interactive. No attendee email appears
in URL, localStorage or sessionStorage.

Two-minute idle reset applies on booth and active report; an absolute
ten-minute context timeout also resets. On pagehide, the booth scrubs inputs and
panels; bfcache pageshow and history pop reset server context before showing
Entry. The report hides its cached document and clears on bfcache return.
Its fixed Finish bar is visible at the top of long content, reserves measured
bottom padding and does not replace/report reconstruct content. If reset
fails, old report content stays hidden behind a neutral recovery surface.
Entry status/reset failure displays **Retry and clear screen** (or staff login
for 401). Retry uses the same serialized reset path, not a blind local unlock.
Lookup remains disabled and keyboard/stale-submit guarded until the server
confirms an entry-state reset. Locally cached attendee state is scrubbed even
when cleanup fails; recovery remains visible after a failed bfcache reset.

Primary design target is **2160 × 3840 CSS pixels**, with 68px input text and
174px Entry action height. Smaller screens retain functional controls.
Approved Adobe logo/product name and original Entry/Finish design are reused;
no unrelated report restyling or invented booking action.

## Separate rollout gates

Reviewed Worker deploy including `BOOTH_COORDINATOR` binding and `booth-v1`
migration; existing private origin and APO credentials/template; staff setup on
the actual device; owner acceptance of asserted-email/domain access; real recipient
receipt; final portrait/browser/network rehearsal; managed kiosk lockdown.
PR creation, code sync, Worker activation and merge are separate. The source
implementation is not a claim those gates passed.
