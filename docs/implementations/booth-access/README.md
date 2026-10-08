# Reusable booth access

**October 1 implementation:** the approved Entry/Finish design now has an isolated
Worker runtime. This is a reusable CUG-authorized prototype, not an event roster
system. Deployment, real email receipt, final hardware rehearsal and PR merge
are separate gates; code and fixture tests do not prove those gates passed.

## Approved scope

`/booth` requires staff setup through `/login?staff&redirect=%2Fbooth`, then
replaces broad staff authentication with dedicated, signed HttpOnly
`booth_session`/`booth_device` credentials and a persistent `booth_kiosk` boundary.
Booth APIs require this scoped session, not a general staff privilege or attendee
URL token. At `/booth`,
the attendee enters a **business email**. The Worker matches its **exact address
or domain** against existing CUGs to discover prepared account insight reports. One
eligible website report opens directly; several require an explicit picker.
There is no event selection, private attendee roster, registration-email match,
guessed website, company search or new access grant.

The real report retains its content and gains a fixed, touch-friendly **Finish
reading my report** control only when its pathname exactly matches the valid
server context. Confirmed large portrait reports also receive the reading layout
described below; ordinary reports retain their existing layout. It returns to
`/booth?step=finish`. **Email my report** sends to
the address stored by lookup; the browser cannot supply another recipient or
path. The final design pairs this with an outlined **Finish and clear this screen**
button; there is no meeting/contact action or implied sales consent.
Reset clears attendee access, not the scoped booth login, persistent kiosk
boundary or disclosed lead-history records. **Choose another report** on a
report or Finish returns to the same authorized picker without another email
lookup. It revokes the active selection, keeps the original expiry and rechecks
permissions on selection; send/view outcomes remain independent per report.
Sent and uncertain outcomes cannot become retryable by switching.

**Security hardening is local, not deployed.** Dashboard navigation cannot exit
booth restrictions. Staff administration uses a **separate browser/device**.
Reset, logout, explicit signout, OAuth and fresh login preserve the kiosk
boundary; re-login revokes the old visit before issuing another scoped session.
The original staff expiry and epoch revocation still apply. Only `/booth`
migrates legacy broad-staff/device contexts. Selected HTML and rendering assets
are authorized using attendee permissions, never staff-wide grants. Private
indexes/APIs, other reports, raw formats, PDFs/download responses and the
general share/copy endpoint remain unavailable to the booth browser.

**Identity limitation:** asserted email is identification, not authentication.
Anyone asserting a permitted address or domain can view its prepared reports on
this staff-authenticated kiosk. CUGs can contain exact emails as well as domains;
an exact-email entry does not permit neighboring addresses at that domain.
CUGs are not registration lists. Staff identities never discover every company.
Addresses without an authored customer CUG permission do not qualify.

## Final Figma screens (October 8, not deployed)

The final Entry and Finish 6 frames are `312:388` and `244:579` in
[Adobe Brand Visibility UI](https://www.figma.com/design/D8EQjOoLp0gRdZoIMk1SEj/Adobe-Brand-Visibility-UI).
Both references are 2160 × 2881; the event target remains 2160 × 3840.
Entry uses the exported Adobe wordmark, **Amplify your brand visibility**, the new
website/glow illustration, **Registration email**, final form spacing and the
quiet, dark **Industry demos** pill added for staff. Finish keeps the live
three-section montage, places Email/outlined Clear side by side, and uses the
registration-address delivery hint. The footer shows **Enter email / View report /
Save and share**; active/completed stages are red. No placeholder or static step
badge remains. Smaller screens keep a mobile-first layout and touch-sized actions.

This branch needs review, D1 migration `0003_booth_demo_activity.sql`, and a
separately approved Worker deployment. It does not change production by itself.
The migration extends allowed activity kinds while preserving historical data
and indexes. Entry CSS uses `?v=booth-final-figma-1`; Entry JS and both adapter
loading paths use the merged recovery version `?v=booth-recovery-2`.

## Industry demo and report request recovery

### Entry network deadlines

Every Entry API operation has a **ten-second total fetch + JSON-body deadline**:
initial status, lookup, demo chooser/catalogue, demo/personal selection, picker,
send, reset and staff exit. A stalled operation aborts, scrubs visitor fields and
previews, discards stale callbacks and shows **Retry and clear screen**. New
attendee actions stay blocked until the server confirms clearing. Existing idle
and original absolute expiry timers are not extended by the timeout. Reset
continues to serialize behind the bounded pending operation and shows
**Clearing this visit...**, rather than waiting silently forever. A failed or
timed-out reset exposes manual recovery without pretending the server cleared.
The isolated `/booth?recover=1` reset also bounds body reading with its deadline.

Aborting a browser request does **not** undo an accepted server mutation. The
existing Durable Object queue still serializes mutations; authorization,
booth isolation, original deadlines and per-report delivery-attempt recording
are unchanged. A timed-out email send is explicitly **unconfirmed**, not a
successful delivery and never an automatic resend. Ask the booth team before
sending again. Stale demo-clearing completion cannot launch a new catalogue
request after a reset supersedes it.

`test/fixtures/booth-recovery-browser.js` holds a synthetic lookup indefinitely,
checks scrubbing/visible fail-closed recovery at the deadline and confirms idle
reset without releasing the held lookup. Unit tests cover stalled fetches and
bodies across every Entry action, serialized clear, late responses, failed clear
and uncertain send. These changes are local, not deployed.

### Available fallback journeys

Entry includes a staff demo shortcut, but **no report-request action**. A
confirmed no-match (`404`, `code: no_report`) offers **Show an industry demo**,
and **Try another email**, not automatic navigation. The chooser explains:
**We don't have a report available for your email yet. Explore an example from
your industry with our booth team.** Direct staff visits omit this no-match copy.
Service outages remain errors, not missing reports.
The industry chooser uses the authoritative `src/booth-demos.js` catalogue:

| Industry | Company / existing public report |
|---|---|
| Automotive | [Carvelo](https://act.aem.now/example-report/carvelo/) |
| Consumer goods / coffee | [Frescopa](https://act.aem.now/example-report/frescopa/) |
| Financial services | [SecurFinancial](https://act.aem.now/example-report/securfinancial/) |
| Food & grocery | [Halliby](https://act.aem.now/example-report/halliby/) |
| Healthcare / health insurance | [We.Healthcare](https://act.aem.now/example-report/we-healthcare/) |
| Media & publishing | [Binji / Exp News](https://act.aem.now/example-report/binji/) |
| Professional services | [Bodea](https://act.aem.now/example-report/bodea/) |
| Retail / apparel | [Luma](https://act.aem.now/example-report/luma/) |
| Telecommunications | [CitiSignal](https://act.aem.now/example-report/citisignal/) |
| Travel / aviation | [WKND Fly](https://act.aem.now/example-report/wknd-fly/) |

`GET /auth/booth/demos` returns staff-only, no-store catalogue data without
creating a visitor context. `POST /auth/booth/demo` accepts only `{id}` for an
approved company. `POST /auth/booth/demo-picker` accepts only `{}` and explicitly
enters the chooser without losing an unmatched visit's private correlation.
Mutations require existing same-origin JSON/scoped booth authorization and clear
personal report access. An unmatched search records `no_report`; selecting an
industry records `demo_selected`; the exact-path report adapter records
`demo_viewed` once per demo/visit. They share the original Visit and normalized
email only inside the private coordinator/D1 ledger. Public status responses
contain no email, Visit or binding. A direct staff demo has no inferred email.
Expiry, reset, a new lookup and operator binding prevent cross-visitor reuse.
Outbox retries do not regrant access or send email. Demo mode rejects personal
selection/send/contact actions. Customer authorization is unchanged.

An initialized staff booth device receives controls only on its exact, live
selected public document. Demos keep **Example report** labeling and offer
**Change industry** and **Clear for next visitor** rather
than personal Finish/email/request actions. Public visitors do not
receive the kiosk profile merely through viewport size or query parameters.

`POST /auth/booth/request` is retired (404), historical request contexts are
cleared, and kiosk `/request-report` documents/submissions return to `/booth`.
The public form, Turnstile, validation, idempotency and explicit consent remain
available outside booth mode. Recording an unavailable report and demo viewing
is **not** a request submission or sales-contact opt-in.

### Touchscreen keyboard and link behavior

Entry uses `scripts/booth-keyboard.js` and
`styles/booth-keyboard.css`. Focused text fields/labels follow viewport resizing
and supported keyboard geometry; reported overlays lift the control bar and add
scroll space for the focused email and action. An unreported touch overlay gets a
half-screen editing reserve. Positive keyboard geometry or significant layout/
visual-viewport shrink is remembered for the editing lifecycle; its restoration
releases the reserve **without requiring blur**. Typing alone keeps dismissal,
while a new field focus or tap on the retained-focus field allows an unreported
overlay to reopen. Moving between fields with an open keyboard preserves the
unshrunk baseline. Blur, checkbox focus and pagehide also release the reserve.
Entry `input`/`change` now renew
its idle timer without affecting absolute expiry. Reset/pagehide blur and scrub
fields. The security report guard also scrubs visitor fields during recovery,
including historical request documents, without extending attendee expiry. Pinch zoom and the browser's
overlay policy are unchanged.

Personal/demo report documents block links and downloads that could leave the
shared screen, including new tabs and footer links, with a visible status
message. In-page fragments and Finish/demo/reset controls still work. Ordinary
reports and Entry Privacy Policy links are unchanged. Managed kiosk
policy must still contain browser chrome, long-press menus and policy links.

Run `test/fixtures/booth-keyboard-browser.js` in a Playwright
`hasTouch: true` context against the local fixture server. It checks focused
fields after viewport shrink and restoration with focus retained, email/action reachability above an 820px
overlay model, blur cleanup and input-only idle renewal. These are stress
models, **not native OS keyboard emulation**. Rehearse the actual OS/browser,
CSS viewport/DPR, keyboard height and policy links before device release.
The confirmed device is a **40-inch portrait display with 2160 x 3840 physical
pixels**, not a confirmed 2160 x 3840 CSS viewport. Local dismissal models also
cover 125%/150%/200% scaling (1728 x 3072, 1440 x 2560, 1080 x 1920 CSS) and
250% (864 x 1536 CSS). At 250% the existing large portrait report profile is
inactive; configure and accept the device rather than changing the breakpoint.
Keyboards larger than the fallback reserve require reported geometry or
content-resize/device configuration. Merge and deploy the matching Worker
assets only after approval; this branch push is not a production rollout.

**October 8 merged recovery checks:** main `4f79f0cb4abb476d1b1009f878df5e608a06a098`
is integrated without restoring retired booth requests. 141 targeted frontend
tests and 157 Worker shell/injection/demo/activity/history/handler tests pass,
along with changed-file ESLint/Stylelint and a summit Worker deployment
**dry run**. Both original defects were reproduced before the fixes;
the recovery and keyboard browser regressions now pass. Existing personal
Entry/report/Finish, all ten synthetic demo choices, retired-request behavior,
reset/history behavior and an ordinary unmarked report were also
checked. No fresh protected-customer verification, real Turnstile submission or
inbox receipt is claimed. Hardware keyboard/reach and managed-device privacy
acceptance are still required.

Entry JS, injected/shared report-adapter imports and the Entry keyboard import use
`?v=booth-recovery-2`; Entry CSS retains main's `?v=booth-final-figma-1`.
Deploy the matching Worker bundle **only after approval**, then close old report
documents, reload `/booth` and reopen reports. Neither pushing this branch nor a
frontend merge activates the separately deployed Worker.

`test/fixtures/booth-report-browser.js` checks an existing protected customer
report in a dedicated, authenticated staff touch context without booth cookies.
Pass its real report URL and the local asset-server URL; customer HTML is read
from the authenticated origin, not substituted with demo content. Branch
assets, booth state/shell and view/reset responses are intercepted. It checks
native/fallback bounds, touch tabs/disclosures, link/download containment,
the same report's real Finish preview and empty Entry after reset. No lookup,
email or production booth mutation is performed; never put credentials or
customer report content in test files.

### Local fallback review and rollout

Run `npm run preview:booth` and open `http://localhost:3000/` for the exact
2160 × 3840 review frame, or `/content/index` for the direct shell.
`no-report@example.test` produces a true no-match;
`service-error@example.test` produces an outage. Other synthetic emails use
the prepared-report fixture; arbitrary unmatched domains also return no-report.
Ten local demo paths share synthetic report content with the selected company
label. The demo verifier checks all industries, no-match messaging, no request
actions, view tracking, idle/history clearing and visible verification failures.
**No real report request, email or lead is submitted.**

`test/fixtures/booth-demo-browser.js` exports the real-browser fallback verifier;
`booth-browser.js` covers the existing personal journey. Worker regressions
cover all catalogue choices, identity isolation, payload/origin/staff gates,
expiry/binding, preserved activity retries and public document injection.
Frontend checks cover missing-report recovery, safe labels, form freshness,
failed/repeated clearing and the combined carousel PDF fix. Full suites,
changed-file ESLint/Stylelint and a summit deployment dry run are required.
Physical device rehearsal and real Turnstile/submission remain separate gates.
Merge the frontend/form assets and deploy the matching Worker **after approval**;
this implementation does not automatically deploy production.

**October 7 rollout:** following explicit approval, merged
[#152](https://github.com/aemsites/summit-portal/pull/152), main
`f9d7c454eb350d36d6de0e7e3605df1bcdb046ce`, was deployed to `summit-portal` as
Worker version **`10608171-3483-4835-95ef-4e290b4ac677`** at **100%**.
Live booth/runtime control modules and portrait form CSS match merged source.
Anonymous `/booth` retains the staff-login redirect; demo catalogue and status
retain 401 responses. Existing bindings, secrets, staff epoch and timing
diagnostics are unchanged. Reload `/booth` and reopen report documents;
real authenticated submission and final hardware rehearsal remain unverified.

## Implementation

| Surface | Source |
|---|---|
| Evergreen shell | Root `booth.html`, served at exact `/booth` by Worker |
| Entry, picker, Finish | `scripts/booth.js`, scoped `styles/booth.css` |
| Actual selected-report preview | `scripts/booth-preview.js`, shared insight-hero/dark-stat builders |
| Cosmetic header/partner settings | `scripts/booth-presentation.js`, shared by Entry and the report control |
| Actual report control/layout | `scripts/booth-report.js`, `styles/booth-report.css`, shared lazy import and context-only Worker injection |
| Booth keyboard viewport/scroll handling | `scripts/booth-keyboard.js`, `styles/booth-keyboard.css`, Entry and verified requests only |
| Staff/context/discovery | Worker `src/booth.js`, `BoothCoordinator` Durable Object, existing `SESSIONS` KV |
| Bundled shell/assets | Worker `src/booth-shell.js`, exact Wrangler Text/Data-module rules |
| Delivery | Existing `handleShareLinkRequest`, APO notification and CUG policy |
| Identified activity / export | Worker `src/booth-activity.js`, `REPORT_REQUESTS` D1, migration `0002_booth_activity.sql` |

Wrangler bundles the **single source** shell, three stylesheets, five booth scripts
and the shared hero/stat renderer modules, so
the deployed Worker can serve the complete booth before the frontend PR merges.
The fixed Entry 3 design bundles only the arrow, website/glow illustration assets
in `img/booth/` (SVG Text modules and raster Data modules). Other assets/content
continue using the existing production origin. Adobe Clean retains the existing
`pbq1nqa` Typekit kit; Adobe Clean Display Black loads through Adobe's `hah7vzn`
kit.
No global origin switch, content imports, DA credentials or authored booth page
are required. `ak.js` and `aem.js` are untouched; the standalone kiosk shell
does not load the ordinary portal chrome or browser analytics. The Worker
submits anonymous action counts separately, never the identified lead data.

See [target design / API contract](context/target-design.md) for authorization,
context lifetime, concurrency and failure semantics.

## Request-local CUG index

Booth discovery compiles the freshly fetched CUG rules into a prefix `Map`
through `compileSheetGroups` in `src/cugsheet.js`. For each report, it checks
that path's prefixes from longest to shortest instead of scanning every rule.
The index is built once per discovery and discarded afterward; it is not
shared between requests, stored on the coordinator or populated on Entry.
Lookup, selection and later actions that revalidate access still fetch all
three complete private datasets in parallel.

Matching retains the existing most-specific scope, authored order for
equal-length exact/glob ties, first duplicate rule, literal trailing-star
prefix semantics, case sensitivity and query stripping. Blank-group rows are
still filtered by the existing parser. A narrower restriction cannot fall
back to a broader grant. The independent mapping check and authorization
filtering before canonical/latest report selection are unchanged. Ordinary
report CUG matching and its existing cache are untouched.

The discovery regression exercises the real lookup handler and bounds rule
prefix reads independently of wall-clock timing. Matcher tests compare against
the unchanged linear matcher, including seeded overlapping scopes, and fresh
snapshot tests cover narrower revocation and regrant. Synthetic local timing
does not establish production latency or resolve the separate Finish wait.

## Temporary latency diagnostics

`BOOTH_TIMING_ENABLED="true"` adds `Server-Timing` to staff-authorized booth
API responses. It defaults off; the summit configuration temporarily enables
it in the deployed diagnostic build. Set it to `"false"` and redeploy
once the before/after flow captures are complete. No new analytics, logging destination, lookup,
permission cache or background export behavior is introduced.

| Metric | Boundary |
|---|---|
| `booth_total`, `booth_auth` | Worker handler and local staff verification |
| `booth_rpc` | Entire coordinator round trip, including dispatch/transport |
| `booth_queue`, `booth_actor` | Application queue wait and execution after admission |
| `booth_actor_auth`, `booth_storage` | Actor staff checks and cumulative Durable Object storage operations |
| `booth_kv_read`, `booth_kv_write`, `booth_kv_delete` | Transient visitor context in KV |
| `booth_{index,cugs,mapping}_fetch` | Cumulative time to obtain dataset response headers, across pages |
| `booth_{index,cugs,mapping}_body` | Dataset body consumption and JSON decoding |
| `booth_{index,cugs,mapping}_rows` | Complete dataset row count, supplied as a description, not a duration |
| `booth_d1` | Awaited identified activity export, including retries of pending outbox records |
| `booth_match` | Explicit CPU-timing-unavailable marker |

Labels are fixed and row counts are integers. Headers contain no asserted email,
account/report path, context ID, cookies, credentials or upstream error text.
401 responses omit diagnostics. Each request has its own measurements, including
when queued behind another request. Failed stages retain their timings without
changing the original error or fail-closed response.

**Clock limitation:** [Cloudflare production clocks advance only on I/O](https://developers.cloudflare.com/workers/runtime-apis/performance/).
They cannot measure CPU-only matching; that stage is explicitly labelled
unavailable rather than assigned a zero duration. CPU work can also appear in
the following I/O span. These are runtime-clock boundaries, not proof that the
named external service consumed all that time. Use local CPU profiling and
Workers CPU observations alongside the recorded row counts. Parallel and nested
spans overlap and must not be added together. `booth_rpc` minus the actor queue
and execution spans can help identify dispatch/transport delay outside the
application queue, but is not a precise network measurement.

After rollout, reload `/booth`, enable **Preserve log** in browser Network tools,
and capture lookup, selection, report viewing and return to Finish. Do not click
email or contact merely to profile the opening flow. Include response headers
in the next HAR and remove cookies/Authorization before sharing; HAR bodies
may still contain private email/report metadata. Existing pages do not
hot-reload the Worker-bundled scripts.

## Entry and Finish feedback

The actual shell initially hides Entry, picker and Finish, even before scripts
execute, and displays **Checking this booth...**. Only the staff-authorized
status response selects a screen. Returning to Finish therefore does not briefly
display Entry while status is pending. An unavailable status retains the
existing explicit retry/clear or staff-login recovery; the URL alone never
authorizes a Finish screen or report preview.

The canonical report name is **Digital Opportunity Report**, as defined in the
[domain glossary](../../../CONTEXT.md). Use that exact name for the booth
eyebrow, report context, page titles and touchscreen review/export labels.
**Adobe Brand Visibility** is the product/brand identity, not the report name.
The legacy design preview and its shareable export use the same report name;
their mock interactions and historical layout remain unchanged.

The default shared header is the event-neutral **Adobe Brand Visibility**, retaining the official
Adobe logo with accessible attribution and meaningful Digital Opportunity Report
context. The requested **Amplify your brand visibility** header is an optional
URL configuration rather than an event-specific default. Entry reads
**Turn your brand content into an AI search advantage.** and
**See where your brand appears in AI search.** The longer headline wraps at
deliberate responsive sizes rather than inheriting the former question's size.
**Open your customized report.** describes existing authorized company reports:
the Business email field still identifies CUG-authorized prepared reports, not
registrants or an on-demand generation request. The picker and help keep that
contract explicit.

### October 7 fixed Entry 3 / Finish 6

The approved [Final Design frames](https://www.figma.com/design/D8EQjOoLp0gRdZoIMk1SEj/Adobe-Brand-Visibility-UI?node-id=5-2)
are fixed to **Entry 3 / Finish 6**, with
[Screen 2_Finish_version 6](https://www.figma.com/design/D8EQjOoLp0gRdZoIMk1SEj/Adobe-Brand-Visibility-UI?node-id=244-579)
replacing Finish 5. Following explicit approval, merged
[#153](https://github.com/aemsites/summit-portal/pull/153), main `b53db04`,
was deployed on October 7 at 15:31 UTC as Worker
**`baeeaccd-e9b2-4a4e-bdb4-5068491316cb`** at **100%**.
Live runtime, preview renderers, styles and icon match merged source; anonymous
staff-login and API access gates remain unchanged. Reload `/booth` and reopen
the report to receive the new version. Authenticated email delivery and
physical kiosk rehearsal remain unverified.
Legacy `entry`/`finish` parameters are ignored
and no longer follow staff setup, the report, Finish or reset. Safe `heading` and
`brand` cosmetics remain; they never change access or API payloads and never reach
emailed links. There is no artwork rotation, local-storage preference or
attendee-facing variant selector.

For local touchscreen review, run `npm run preview:booth` and open
`http://localhost:3000/`. The actual shell runs inside a 2160 × 3840 CSS iframe,
with fallback/Figma-reference resolutions and fit, fill-width or 1:1 inspection.
The surrounding review controls never alter the production shell. All APIs are
explicit synthetic fixtures: only `visitor@example.test` opens the example report;
other emails show the no-report warning (except the explicit outage fixture),
email actions only simulate feedback, and no entered email is retained
or transmitted to a live service. The warning remains visible while interacting.
Confirm actual CSS viewport, browser zoom/DPR and legibility on event hardware.

Entry uses the fixed website/glow artwork above the rounded white form, positioned
in native Figma coordinates relative to the 259px header. Finish replaces the
old tagline/illustration with three **actual selected report** excerpts above
**Email my report**: LLM visibility, the hero/four summary metrics, and Your
briefing's first Executive overview slide. All three remain visible. Horizontal
swipes, side-preview taps and arrow keys change the foreground section without
another fetch. The inset report excerpts are inert; vertical scrolling and
reduced motion are supported. The centered blue email pill uses the exact
exported Open In icon. **Prefer to meet later?** is a centered gray informational
card, with no contact button or consent notice, followed by a smaller dark reset
pill. At 2160 × 2881, spacing and type follow Figma; the 2160 × 3840 kiosk adds
white space rather than stretching the artwork. Small screens keep the
three-excerpt composition with full-size touch actions and scrolling.

After full-page report navigation, Finish fetches the exact `selectedPath`
once with same-origin credentials, `cache: no-store` and rejected redirects.
The server context is still `report`, so existing exact-path authorization
applies; no new endpoint, lookup, discovery or generation is needed. Only the
raw authored `.report-hero.insight`, `.report-stats.dark`,
`.report-ai-visibility` and `.report-carousel` content is extracted.
Sanitized content feeds shared static hero/stats, visibility-overview and
first-briefing builders. Chart labels are escaped and authored chart colors
constrained to hexadecimal values. Typing/metric animations and inner report
interaction are disabled. Report scripts, controls,
footers and analytics are not executed or copied; there is no full-report iframe
or exported preview image. Ordinary report-builder defaults are unchanged.

The native montage is 1950 × 725px, starting at y=394 below the 259px header.
The foreground excerpt is 1411 × 724px; side excerpts use perspective, 80%
opacity and the reference left blur. Excerpts crop to their frame rather than
embedding the entire report; overview headings are limited to two lines.
Unsupported heroes produce an explicit preview error with **Retry preview**;
missing metrics or sections are identified rather than substituted. Email/reset do
not wait for the preview. Abort/revision guards and expiry checks prevent stale
responses from reappearing after reset or navigation. Preview HTML is never put
in local/session storage, and privacy scrubbing clears it alongside attendee
fields. Shared renderer imports use `?v=booth-preview-6` for cache freshness.
`test/scripts/booth-preview.test.js` covers extraction and lifecycle;
`booth-artwork.test.js` covers fixed Entry geometry and native preview CSS scope.

The mock preview toolbar, entry/finish switcher and placeholder **02 LOREM**
footer progress are intentionally not production features. The static
**STEP 03 OF 03** Finish badge follows Version 6.
Jose reconfirmed removal of the placeholder footer progress bar. Entry
demo/request and missing-report/industry-list request/back actions use separate,
outlined neutral touch buttons: approximately 130px/52px height/type at native
size, at least 72px/26px at fallback, and 64px/22px on mobile. Desktop has two
equal action columns; mobile stacks full-width controls with 16px separation.
Canonical naming, Business email identification and privacy notices remain.
**Email my report** remains the only email
dispatch and uses the lookup business address, not a claimed registration address.
The retired `/auth/booth/contact` route returns 404 at both the public dispatcher
and actor; no new contact event or consent is inferred. The dark pill
**Finish and clear this screen** control invokes the existing server reset only, without
sending email. Privacy clearing, expiry, recovery and staff-only exit behavior
are unchanged.

### Identified booth leads and privacy notices

The lead system of record is **first-party D1**, not Simple Analytics. Each
valid lookup creates a visit ID and records the normalized, attendee-asserted
business email, even if no authorized report matches or discovery fails.
Subsequent `report_selected`, `report_viewed` and
`report_sent` events carry the same visit ID/email and the server-authorized
report path, label and company. `report_viewed` means the exact selected report's
browser adapter loaded and acknowledged opening; selection alone never implies
viewing. This is not verification of identity, physical attendance or reading.
`report_sent` means the existing mail service accepted the send, not proof of
inbox receipt. Uncertain or rejected sends are not listed as sent.

The standalone shell displays a compact notice immediately beside **View my
report**; it discloses identified email/report-activity recording, the purpose
and **90-day** record lifetime, and links to Adobe's Privacy Policy. It is
acknowledgement of a notice, not a blanket marketing opt-in.
The Entry copy is shortened and uses quieter, high-contrast secondary text
without hiding the purpose, 90-day retention, no-sales-contact disclosure or
Privacy Policy link. It fits one line at the native width and wraps on mobile.
Finish keeps the business-address delivery hint; the separate delivery/privacy sentence below
**Email my report** was removed at Jose's request. Delivery activity is still recorded.
The Worker requires the current notice version on lookup. Finish 6 removes the
separate contact action at Jose's direction. Historical `contact_requested`
records and pending outbox entries remain retrievable under the existing
90-day retention policy; original timestamps are not rewritten.
Search/view/send and static follow-up guidance must not be treated as permission
for sales or general marketing communications. The public request form retains
its separate, unchecked consent flow.

Only real Adobe OAuth sessions can retrieve PII. Event/booth credentials,
Semrush OAuth and magic/share-link sessions are rejected:

| List | Authenticated CSV route |
|---|---|
| All booth activity, correlated by Visit | `/api/booth-activity.csv` |
| Emails that searched | `/api/booth-activity.csv?kind=search` |
| Emails without an available report | `/api/booth-activity.csv?kind=no_report` |
| Industry demo selected by each unmatched email | `/api/booth-activity.csv?kind=demo_selected` |
| Industry demo actually opened by each unmatched email | `/api/booth-activity.csv?kind=demo_viewed` |
| Company/report opened by each email | `/api/booth-activity.csv?kind=report_viewed` |
| Historical explicit contact requests | `/api/booth-activity.csv?kind=contact_requested` |
| Report emails accepted by the mail service | `/api/booth-activity.csv?kind=report_sent` |

These CSVs contain activity rows (repeat visits remain separate), not an
anonymous audience. Join on **Visit** to reconstruct the flow, or deduplicate
Email for an address list. Optional `from=YYYY-MM-DD&until=YYYY-MM-DD` selects a
UTC date range, with `from` inclusive and `until` exclusive. JSON at
`/api/booth-activity` accepts the same filters and returns a `nextCursor`;
continue using the same filters until it is null. CSV streams every page
without a hidden 1000-row cap. A database failure interrupts the download
rather than silently returning an incomplete list.

Records expire 90 days after the action. Retrieval immediately excludes expired
rows; the hourly Worker scheduled handler physically deletes expired D1 rows.
The Durable Object outbox first persists actions and their outcomes atomically
before D1 export writes. It retries outages by alarm, survives attendee reset,
deduplicates replay, and discards expired pending records even during an outage.
New search attempts append their emails instead of being lost behind an older
pending event. A saved selection can be retried for the same report without
switching reports or duplicating history. It never resends
email to repair telemetry. Reporting delays explicitly preserve the confirmed
email outcome; they do not ask the visitor to send again. Historical contact
outbox entries remain private. Reset still removes the live attendee context and
KV access data. Anonymous Simple Analytics events are only best-effort counts:
`booth_search`, `booth_report_selected`, `booth_report_viewed`,
`booth_report_sent`, `booth_no_report`, `booth_demo_selected` and
`booth_demo_viewed`. The latter two count correlated unmatched visits, not
unidentified direct staff demos. `booth_contact_requested` is no longer emitted, including
when replaying old outbox events. No email, email hash, visit ID,
company/report identifiers, attendee IP, browser headers or cosmetics are sent.

**Activation gates:** have Adobe Privacy/Legal review this report-specific notice
and contact permission, purpose/lawful basis, geographic requirements and the
rights/withdrawal process. Confirm Cloudflare backup/PITR retention and handling
of exported copies; the 90-day automatic purge covers operational booth
records, not somebody's downloaded CSV or all platform backups. Do not claim
legal approval from this implementation. Apply D1 migrations `0002_booth_activity.sql`
and `0003_booth_demo_activity.sql` (only unapplied migrations)
before separately approved Worker deployment, then roll out the matching
shared adapter and reset/reload existing kiosk tabs so the current notice is
shown. Do not enable the new UI without persistence and the scheduled purge.
The legacy design reviewer/export remains a historical mock, not this lead
collection runtime.

### Cosmetic URL settings

`/booth` without settings always uses the neutral Adobe identity.
`heading` overrides only the shared shell header, not authored report headings.
It must occur once and contain 1–80 Unicode code points after trimming; markup
delimiters, control/format characters and line/paragraph separators are rejected.
Unicode text is rendered with `textContent`, never HTML. `brand` accepts only
`adobe` or `semrush`; missing, invalid or duplicate values use Adobe. Semrush
uses the existing allowlisted logo, not a URL-supplied asset.

Example: `/booth?heading=Amplify%20your%20brand%20visibility&brand=semrush`.
For an Adobe-only review, use `/booth?heading=Amplify%20your%20brand%20visibility`
without a partner-brand override. The marketing heading does not rename the
Digital Opportunity Report.
Only valid heading and non-default brand/entry/finish settings follow the server-selected
canonical report pathname, the Finish URL and reset/next-visitor URL.
Unknown parameters are dropped; only the explicit `/booth?step=finish` target
retains a step parameter. The staff-login redirect is always scoped to `/booth`,
carrying only the same safe cosmetics. No event settings are persisted in
browser storage, cookies, CUG data or API bodies. The server's `selectedPath`
and emailed/shared report links remain canonical and event-neutral. Opening
a bare `/booth` document cannot inherit the previous event's settings.
Cosmetic parameters cannot authorize a report, change expiry or opt into
either portrait layout without validated server status.

## Confirmed report portrait reading

The helper checks `/auth/booth/status` before adding `html.booth-report-active`
or loading `/styles/booth-report.css`: the state must be `report`, pathname must
match exactly, and expiry must be a finite future timestamp. Query parameters,
screen size and stored preferences cannot opt an ordinary report in. The Worker
continues to return `state: report` after a send; delivery does not change this
layout contract.

Inside that trusted context, the reading profile applies only at widths of at
least 1000px, heights of at least 1600px and aspect ratios no wider than 3:4.
At 2160 × 3840 CSS pixels it caps the shared column at 1920px, sets narrative
text to 40px, captions to 32px, major section headings to 64px, and action
targets to at least 96px. The 1080 × 1920 fallback uses 24px narrative text,
18px captions and 64px targets. Other report viewports keep their normal layout.
No browser zoom, page transform or font substitution is used.

An additional composition profile applies **only at exact 9:16**, inside those
same minimum dimensions and validated server context. It adds
`html.booth-report-composition`; neither that class nor the reversible
performance disclosures is created for ordinary reports. At 2160 × 3840 it uses
36px prose, 56px section headings, 48px card headings and the existing 96px
primary controls. At 1080 × 1920 prose remains 24px and controls at least 64px.
AI comparison panels sit side by side; findings use an unboxed asymmetric grid
with all authored prose visible by default. Performance is a two-column overview
(four pages in 2×2), retaining the original field/lab grade semantics, score,
all three metric values and thresholds. Exact-ratio widths below 1600px place
thresholds on a second row rather than squeezing the metric columns.

Each performance card has a native **Read analysis** disclosure containing the
original summary, recommendation and verification nodes, not rewritten
or cloned content. Tested-page URLs remain visible below their page titles.
When activation moves a focused analysis descendant, only
that card's disclosure opens and the exact element is refocused after attachment.
Without analysis focus, all disclosures remain closed for the default overview.
Leaving the exact ratio, or clearing booth mode, restores the original DOM
positions, event listeners and focus. Later-rendered cards share the existing
chart observer; no additional idle/reset/expiry timers are added.
The original broad portrait date/touch query stays separate. The 2:3, 3:4,
landscape, mobile and nearby non-exact viewports retain the preceding layout.

Briefing copy stacks above its full-width SVG plot. ISO month ticks split into
month/year lines, retaining the original date in an accessible label; this
avoids the original overlapping dates without changing chart values. A scoped
observer handles later-decorated charts, and leaving the portrait bounds restores
the original ISO ticks. Touch taps reuse existing chart hit testing and keep
the value readout visible without hover. Outside the exact composition, AI panels
stack with readable subtitles;
platform bars retain icon/label/bar/value alignment, and comparison tables retain
their columns. Details, tabs, carousel arrows/dots, same-page fragments and booth
controls remain available; other report links cannot leave the shared screen.
Booth-only PDF/download controls are hidden and disabled,
including late decoration and opaque PDF links in report-download blocks;
attendees use their emailed report for PDFs on their own devices. Ordinary
staff/customer report downloads are unchanged. Booth links/forms stay in one tab.
Existing feedback/brand controls move into document flow in
booth context rather than overlapping Finish. The existing ResizeObserver
reserves the measured Finish bar height, including wrapping and viewport changes.

Both the helper and its new stylesheet are exact Worker-bundled assets. The
Worker injection and shared lazy import use the same `?v=booth-activity-1` adapter URL
to avoid a previously cached unversioned module; this is cache versioning, not
a layout opt-in. Entry, report-adapter and keyboard JS/CSS receive `no-cache`
revalidation. After fresh authorization the adapter can upgrade an older Finish
control without duplicating its reset timers or counting bottom padding twice.
Review and deploy the matching Worker bundle separately from the frontend merge.
After deployment, close the old report document, reload `/booth` and reopen the
selected report; already-open documents do not hot-reload modules. A frontend
merge alone is not proof the new booth layout is active. This change
does not deploy, send mail, change CUG data or authorize new report access.
Authored-content local replay with production blocks is useful evidence, not a
claim that protected production rendering or physical standing-distance
legibility has been verified. Confirm device CSS viewport, DPR/browser scaling,
touch interaction and viewing distance on the installed screen.

**Footer decoration ordering:** the shared section-footer relocator accepts
`report-scores` only after its direct `.rsc-grid` exists. Before decoration,
direct divs are authored page rows and must not receive a footer slot. The
scores decorator's post-init scheduler completes relocation after the
performance shell is ready, preserving authentic callout/data-source nodes.
The regression covers interleaved before/after decoration and repeated
relocation, rather than suppressing a bogus extra card.

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
npm run test:file -- test/scripts/booth.test.js test/scripts/booth-report.test.js
npx eslint scripts/booth*.js workers/cloudflare/cug-adobe-oauth-worker/src/booth*.js
npx stylelint styles/booth.css styles/booth-report.css
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

**Verification recorded October 1:** full Worker Vitest: 269 passed, one existing
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
document and concurrent-reset regressions pass.

**Historical history/exit evidence (superseded by local scoped-session hardening):**
parent deployed `9779109` as
`c13ab557-dccd-43c4-9348-895f39e88900`. The real direct report/Finish flow passed
again **without another send**. Reset returned Entry; a fresh report request
redirected, and actual browser Back landed on `/booth` with no report present.
Explicit staff exit landed at staff login for the dashboard; `/auth/me` and
booth status both returned 401. Managed-device rehearsal/lockdown and actual
inbox receipt remain separate gates.

The final coupled hardening `01df090` rejects the signed device marker when
transplanted into `auth_token`; it is a mode guard, **never a login credential**.
The real signed-token regression ran red then green. Legacy session/link
behavior is untouched. Parent deployed exact `01df090d7cc8de6dc15eb1f0b9e6b85f69a6e37d`
as final Worker **`ab90af30-5e54-4f99-99dd-af21df62f395`**. This is the frozen
runtime; the history/exit receiving-end evidence above was recorded on `c13ab557`
before the isolated purpose rejection. No second real email was sent.

**PR creation remains blocked:** two dedicated app attempts in the child failed
with EMU 403. The parent's separate dedicated attempt failed before creation
while pushing `jose-correia/summit-portal` as `josec_adobe` (403). Neither result
authorized a CLI fallback. The upstream feature branch is pushed; the manual
comparison for that branch remains available. At the user's explicit request,
the parent also successfully pushed the aggregate to the personal fork
**`jose-correia/summit-portal`**, branch **`josec-adobe-sync-remote`**, using
command-scoped personal credentials. This is the intended PR source now.
The dedicated app retry still failed its redundant fork push as `josec_adobe`
(403); no PR was created. Use the upstream manual comparison:
https://github.com/aemsites/summit-portal/compare/main...jose-correia:summit-portal:josec-adobe-sync-remote?expand=1 .
No PR, merge or successful inbox receipt is claimed.

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
promise. The dedicated credentials expire no later than the original staff
session and bind to the same random identifier. The HttpOnly/Secure
`booth_kiosk=1` cookie lasts one year and persists through reset and signout;
scoped credentials are restricted even without that marker. **Staff: sign out
this device** clears attendee state and credentials but does not unlock
dashboard access. Re-login stays scoped; staff administration belongs on a
separate browser/device. Unmarked ordinary staff/customer browsers are unchanged.
The server allowlist permits shared static assets and selected rendering
dependencies, not private indexes, arbitrary report formats or PDFs. A MIME,
Content-Disposition or redirect mismatch fails closed, including opaque export
URLs and HEAD requests.

Deploy the Worker and matching assets together after review. Close old report
tabs, reload `/booth`, and migrate an existing staff/device session there before
handing the screen to attendees. Disable address-bar/history/tab escape,
developer tools, cookie deletion and OS access using managed kiosk controls;
keep staff nearby. Ten-minute context expiry and two-minute interactive idle
reset do not revoke the scoped login. Failed verification/reset keeps content
hidden until confirmed server clearing. Web code cannot erase already-downloaded
files or prevent someone from asserting another permitted email address.

## Planning history

The former ten-task roster/report-exclusive-token roadmap is **superseded**,
not completed as originally specified. [Tracker](tracker.md) records the scope
reductions and remaining operational gates. The design review source and
shareable export remain preserved. The exact portrait composition and bounded
heading/partner options above are separately approved extensions. Further
branding beyond those options, new personal-email grants, event lists or booking
flows require a separate agreed change.
