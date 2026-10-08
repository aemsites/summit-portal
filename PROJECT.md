# Summit Portal — Personalized Performance Reports

## Overview

A personalized digital performance report delivered to Adobe Summit attendees who are AEM Sites customers. Each report presents site-specific metrics — traffic, performance scores, AI search visibility, and SEO health — in a polished, data-rich single-page format.

The current content is a **sample report for Nike**, used during development. In production, the same block system will generate unique reports for each Summit attendee's site.

**Canonical report name:** **Digital Opportunity Report**, including booth labels,
page titles and review/export wording. **Adobe Brand Visibility** remains the
product/brand identity, not an alternative report name. The approved
**Amplify your brand visibility** marketing heading remains configurable through
the bounded `heading` parameter; `brand=adobe|semrush` is unchanged. See
[`CONTEXT.md`](CONTEXT.md) for the domain glossary.

- **Framework**: `ak.js` (Author Kit / Document Authoring)
- **Content source**: https://main--summit-portal--gabrielwalt.aem.page
- **Initial import**: Created via the [Slicc browser extension](https://github.com/ai-ecoverse/slicc)
- **Design**: Fully responsive (single 1000px breakpoint), dark mode support via `light-dark()` CSS, rich data visualizations (SVG charts, gauges, animated counters), smooth animations (typing effect, count-up numbers)

### Pages
- `/docs/sales-playbook` — **internal seller playbook**: how to read, present, and defend a Digital Opportunity Report so any seller can pitch a portal landing page. Staff-only, linked from the staff dashboard (`/adobe/dashboard`). Authored in DA from existing report blocks (`report-cards`, `table`, `report-callout`) plus the `copy-markdown` button and the `docs` theme block. Opens with a `docs` block that switches the page into the documentation theme (`blocks/docs/docs.css`). (`advanced-tabs` was deliberately avoided — its decorator hijacks every sibling `.section` in `main` as a tab panel, which breaks a long multi-section page.)
- `docs/universal-booth-access.html` — standalone, print-friendly concept brief for a reusable event-booth flow: registration-email lookup opens the existing portal-landing report directly, a booth-only Finish control returns to the same booth page for report email delivery and non-interactive sales guidance, with Adobe/Semrush presentation options and portrait display requirements.
- `/booth` — **reusable booth prototype**: the Worker bundles the final Figma Entry / Finish 6 shell, scoped assets and live report renderers, without DA imports. Staff setup and fresh exact-email/domain CUG discovery open one authorized report or an explicit website picker. Finish uses three swipeable excerpts from the selected report (overview/metrics, briefing, LLM visibility), with **Email my report** and an outlined **Finish and clear this screen** action. The default header is **Amplify your brand visibility**, with the exported Adobe wordmark. Cosmetic `heading` and `brand` settings never affect permissions or emailed links. Entry preserves keyboard support and compact privacy notices, adds a dark pill **Industry demos** staff shortcut, and displays the real three-step progress footer. Booth report requests are retired; the separate public form remains available outside kiosk mode. See the October 8 final-design section and `docs/implementations/booth-access/README.md` for rollout gates.
- `docs/implementations/booth-access/design/touchscreen-review.html` — local interactive Chrome review wrapper for the booth design: **2160 × 3840 CSS portrait event target by default**, with 1080 × 1920 as a fallback viewport check. The frame scales to fit smaller laptop displays, plus a larger scrollable inspection mode; fit-to-window is not proof of on-site legibility. It references `booth-preview.html` and repo icons: sending this file alone opens an empty preview for recipients. `design/export-touchscreen-review.mjs` generates a **single shareable HTML** with both screens, scripts and artwork embedded (Adobe Clean loads via Typekit when online, with a system fallback). Neither reviewer nor export is a production route; confirm the actual browser CSS viewport on event hardware.

**Booth Finish UX decision:** **Email my report** sends only the report link. Finish 6 removes **Please contact me** in favor of static guidance to speak to the team; it records no contact consent and books no meeting. Searching, opening a report and emailing its link never imply sales-contact consent. Recipient/path come solely from a booth-bound HttpOnly context with a renewable fifteen-minute inactivity expiry. Existing **30-day authored email/domain CUG grants** stay in use; an exact-address grant never adds an unauthorized domain. Durable Object serialization records each report's attempts before APO; uncertain delivery is explicit and non-retryable even after switching away and back. Reset clears attendee access but retains the scoped booth login, persistent kiosk restriction and separately disclosed lead history. The dedicated `booth_session` credential and signed `booth_device` are not general staff authentication. Selected HTML and rendering dependencies require the live selection and attendee permissions before origin fetch and again before return, including reset races. Private indexes/APIs, alternate report formats, PDFs, general sharing and unrelated reports are denied. Fresh report navigation and browser Back after reset return to Entry. Staff signout removes credentials but does not unlock the kiosk browser. Ordinary staff/customer browsing on unmarked browsers is unchanged. Physical touchscreen validation and managed kiosk lockdown remain rollout requirements; web code cannot protect against deliberate cookie deletion, developer tools, OS access or files previously downloaded.

**Booth inactivity policy (October 8, local; not deployed):** Jose approved one **15-minute inactivity window**, replacing the two-minute screen reset and fixed ten-minute visit limit. Entry, picker, Finish, personal reports and industry demos share `scripts/booth-session.js`. Pointer/touch movement, scrolling, keyboard input and virtual-keyboard input/change renew the visitor deadline; active reading can continue beyond the original deadline. Same-origin `POST /auth/booth/activity` carries only elapsed idle milliseconds, rechecks staff/device binding and current personal-report permissions, and renews Durable Object expiry, KV retention and the context cookie. Input renewals are batched at most every 30 seconds (sooner near expiry); trailing renewals subtract time since the actual input rather than granting another fifteen minutes from the delayed request. A no-report response supplies its deadline so the fallback screen also renews consistently. KV's 60-second minimum retention never extends the authoritative visitor deadline. Passive status/asset/view requests do not renew access. Expired or cleared visits cannot be revived; failed renewal conceals/scrubs visitor content and exposes recovery. Clear waits for every in-flight operation, even when another operation has failed. Both screen cleanup and server expiry end the attendee visit, **not the four-day staff login**. Worker and matching bundled assets must be deployed together after review; close old report tabs and reload the kiosk before use.

**Identified booth lead history:** a first-party D1 ledger correlates the asserted business email and visit ID with valid searches (including no-match/service failures), authorized company/report selection, browser-confirmed report opening and mail-service-accepted report sends. Historical contact opt-ins remain privately retrievable; Finish 6 records no new contact event and suppresses anonymous contact counts, including outbox replay. Selected does not mean opened; opened does not prove reading, identity or physical attendance. Adobe OAuth staff can retrieve paginated JSON or complete action-filtered CSV at `/api/booth-activity` and `/api/booth-activity.csv`; booth credentials, partner OAuth and link-borne logins cannot retrieve emails. Records expire after **90 days**, are immediately excluded from retrieval at expiry, and are purged hourly. A Durable Object outbox retries D1 outages without resending mail or exposing a previous attendee after reset. Simple Analytics receives only best-effort action counts, not email addresses, hashes, visit IDs, company names, report URLs or attendee headers. Compact point-of-action notices link to Adobe's Privacy Policy; lookup notice version and historical opt-in timestamps are retained. Privacy/Legal review, the D1 migration, Worker/asset rollout and backup-retention review remain activation gates; the text is not a legal waiver or blanket marketing consent. See [booth access](docs/implementations/booth-access/README.md#identified-booth-leads-and-privacy-notices).

**Booth security hardening (deployed):** entering `/booth` replaces broad `auth_token` access with a signed `booth_session` (`booth-session` purpose), a bound `booth_device` (`booth-device` purpose) and persistent `booth_kiosk=1`. Scoped credentials preserve the original absolute staff expiry and epoch revocation; the kiosk marker lasts one year and survives reset, signout, OAuth and re-login. Fresh authentication remains booth-scoped and must revoke the old visit before replacing credentials. Legacy staff/device contexts migrate only through `/booth`; dashboard navigation cannot clear the boundary. **Staff administration must use a separate browser/device.** The marker is not authorization, and its absence does not unlock a browser still carrying scoped credentials. The Worker and matching report adapter are deployed; close old report tabs and reload the actual managed touchscreen before attendees use it.

**Booth reporting outages:** subsequent valid searches append to the durable outbox even while D1 is unavailable; expired entries are removed independently of D1 recovery. Retrying a saved selection may open the same authorized report; switching to another requires the deliberate picker transition and fresh revalidation. Confirmed send/contact outcomes remain explicit and do not become resend requests.

The lead-history privacy exclusions apply to the new **server-side action events**. Existing ordinary portal browser analytics are unchanged.
- `/request-report` — public QR-code lead intake for a Digital Opportunity Report, authored in DA with an empty `report-request-form` block. It must receive a `turnstile-sitekey` metadata value before launch. It submits only to the same-origin Worker endpoint and never starts report generation.
- `/adobe/report-requests` — Adobe-IMS-only Sales follow-up list, authored in DA with an empty `report-requests-list` block and linked prominently from `/adobe/dashboard`. The existing `/adobe**` CUG rule protects the page; the Worker additionally enforces real Adobe OAuth plus an `@adobe.com` identity before exposing lead data.
- `/example-report/frescopa` — public, delivery-published FrescoPa sample report. It is a self-contained copy of the approved FrescoPa landing page and PDF, separate from the protected customer route under `/accounts/f/frescopa/`.

**Booth network recovery:** initial status or idle/reset failures keep lookup blocked and display a visible **Retry and clear screen** action. Entry API fetches **and JSON bodies share a ten-second deadline**, covering status, lookup, demo chooser/catalogue/selection, personal selection, picker, send, reset and exit. Timeout aborts the transport, invalidates stale UI callbacks, scrubs visitor details/previews and blocks new actions until server-confirmed clearing. Existing idle/absolute deadlines remain in force; reset still waits for the bounded prior operation and displays **Clearing this visit...** while waiting. Failed or timed-out reset stays fail-closed with manual recovery. Client abort cannot undo a server mutation or prove email delivery: timed-out send is explicitly uncertain, never automatically replayed or reported as successful. The server's existing serialized visit mutations and per-report delivery outcomes remain unchanged. The isolated `/booth?recover=1` reset also has a ten-second fetch/body deadline.

Server-marked report and demo documents are concealed before rendering and remain hidden until the adapter verifies their exact path and original expiry. Historical request documents fail closed and return to Entry; request mode is no longer supported. Deadline, idle and history cleanup are installed before verification, including when its request times out. After verification, the temporary server concealment wrapper is removed without replacing its nodes, preserving direct-body layout selectors and listeners. Recovery scrubs visitor fields and reveals Entry only after the server confirms a successful reset, never a blind local clear. The recovery target is 62px tall on portrait and mobile screens. These hardening changes are local and require the matching Worker/asset rollout.

**Booth report switching and exports:** **Choose another report** on a report or Finish returns to the same attendee's authorized picker without another email lookup. It revokes the active selection before showing candidates, preserves the current inactivity deadline unless renewed by visitor input, and revalidates permissions on the next selection. Delivery outcomes remain separate per report; switching does not make a sent or uncertain send retryable. Touchscreen PDF/download controls are hidden and disabled, including late-decorated carousel/download controls and opaque export links. Attendees open PDFs through their emailed report on their own device; ordinary staff/customer downloads are unchanged. Booth links and forms no longer open separate tabs.

**Booth report portrait layout:** `scripts/booth-report.js` loads `styles/booth-report.css` only after staff-authorized status confirms an active report or approved industry demo, the exact pathname and a finite future expiry. Ordinary reports never opt in through viewport, URL parameters or browser storage. Confirmed insight booth reports at least 1000px wide and 1600px tall with aspect ratio at most 3:4 use a shared column capped at 1920px, fluid 24–40px narrative text, 18–32px captions and 64–96px action targets. Briefing slides stack copy above full-width SVG plots, preserving chart geometry; ISO month ticks split into readable month/year lines with accessible original dates, then restore outside portrait bounds. Touch chart values remain visible without hover. AI panels stack with readable subtitles, platform bars preserve icon/label/bar/value alignment, and comparison tables retain their columns. Performance cards stack without removing details or actions. Smaller/landscape booth reports keep their existing report layout. Feedback/brand controls remain available in document flow rather than overlapping the fixed Finish bar, whose measured height reserves bottom space. The report helper and stylesheet are both Worker-bundled: matching Worker assets must be deployed separately after review; a frontend merge alone does not update the deployed booth. CSS viewport/DPR and standing-distance legibility still require actual hardware rehearsal.

**Exact 9:16 composition:** within the same trusted booth context and minimum dimensions, only an exact 9:16 CSS viewport adds `html.booth-report-composition`. It keeps the Adobe fonts/colors, authored narratives, chart data and section order while arranging AI comparisons side by side and findings in an unboxed asymmetric grid, with all AI prose visible. Performance uses two columns (four pages in a 2×2 overview), keeping the original field/lab verdict, score, all three metric values and thresholds visible. Native 2160 × 3840 uses 36px prose, 56px section titles, 48px card titles and 96px primary targets; 1080 × 1920 uses 24px prose and 64px targets, with metric thresholds on a second row below 1600px width. Native **Read analysis** disclosures move, rather than copy, the original summary, recommendation and verification nodes; tested-page URLs stay visible below their page titles. Leaving the exact ratio or clearing booth mode restores the moved nodes' original positions and listeners. Later decoration shares the existing chart observer, with no additional reset/expiry timers. Nearby ratios and the previous broader portrait chart/date/touch behavior retain their existing layout; ordinary native portrait reports use the separate exact-resolution scaling below.

**Booth report focus:** if activating the exact composition moves a focused analysis descendant, only its disclosure opens and the same element is refocused after attachment. Without analysis focus the overview stays closed. Exiting restores original positions, listeners and focus, without additional timers.

**Booth report asset freshness:** Worker injection and the shared lazy import use the matching `?v=booth-clear-1` adapter URL for the deployed return-to-entry correction below. The industry chooser versions Entry JS/CSS with `?v=booth-industry-figma-1`; the keyboard import retains `?v=booth-recovery-2`. Entry, preview, visibility-helper, report-adapter and keyboard assets receive `no-cache` revalidation. The chooser and preview corrections were deployed October 8 at 11:41 UTC. A newly authorized adapter upgrades an older Finish control without duplicating reset timers or bottom padding. Close existing report documents, reload `/booth` and reopen the selected report; existing tabs do not hot-reload modules.

### Touchscreen keyboard and navigation hardening

`scripts/booth-keyboard.js` and `styles/booth-keyboard.css` are shared by the
standalone Entry shell. The former booth request form is retired. Focused editable
fields and their labels are scrolled into the usable viewport after layout or
visual-viewport resize, visual panning and supported VirtualKeyboard geometry
events. Bottom controls move above reported occlusion; the page gains enough
scroll room to reach the email and its action. No browser keyboard
overlay policy is forced. When a touch keyboard supplies neither geometry nor
viewport reduction, a conservative half-screen editing reserve provides scroll
room; this is a fallback assumption, not native keyboard detection. After a
positive layout/visual-viewport reduction or keyboard geometry, restoration
releases the reserve **even if the text field stays focused**. Typing alone
does not recreate it; a new field focus or deliberate tap on the dismissed
field permits an unreported keyboard to reopen. Field-to-field movement while
the keyboard is open preserves its unshrunk baseline. Blur, checkbox focus
and pagehide release the reserve; reset blurs the field.
Pinch zoom retains native panning. Ordinary pages never mount this helper.

The security report guard's reset, recovery and pagehide synchronously blur and
scrub visitor fields, including historical request documents, even when server
clearing fails. Integrating the touchscreen changes does not add a second reset
lifecycle. Visitor input now renews the shared inactivity deadline as described
in the current booth inactivity policy above.

Entry counts `input` and `change` as activity, so
virtual-keyboard typing without key/pointer events renews the fifteen-minute idle
window and server visit expiry. Within confirmed personal/demo
report documents, taps, modified clicks and auxiliary clicks on external links,
other pages, mail links, new-tab links and downloads are prevented with a visible
booth status message. Same-page fragment navigation, disclosures, carousel
controls and the separate Finish/demo/reset bar remain available. Ordinary
reports and Entry Privacy Policy links retain their existing behavior.
This is not OS/browser kiosk lockdown; long-press menus, browser chrome and
privacy-policy navigation still need managed-device policy.

`test/fixtures/booth-keyboard-browser.js` checks exact Entry email visibility,
email/action scroll reachability, resize cases at native/scaled portrait
sizes, restoration with focus retained, an 820px unreported overlay stress model, blur cleanup and input-only
idle renewal against local synthetic fixtures in a `hasTouch: true` browser
context. `test/fixtures/booth-report-browser.js` additionally exercises an
existing authenticated customer report with local branch assets, touch
tabs/disclosures, link/download containment and a Finish montage fetched from
that same real report. The isolated test intercepts booth state/shell and all
mutations, including view/reset; it never performs a customer lookup or sends
email. Credentials and customer report contents are not stored in fixtures.
Geometry/pinch/lifecycle unit tests supplement this; none emulates the
native OS keyboard. Confirm the real CSS viewport, scaling and keyboard height
on the 2160 × 3840 physical display. Keyboards taller than the fallback reserve
require reported geometry, content-resize configuration or device-specific
adjustment. **The matching Worker assets were deployed October 8; a branch push
alone does not update production.**

**October 8 recovery validation (deployed; rollout below):** regressions first
reproduced stalled Entry requests/bodies and the retained-focus phantom reserve,
then passed with the fixes. After merging main `4f79f0cb4abb476d1b1009f878df5e608a06a098`,
**141 targeted frontend tests** and **157 Worker tests** (shell/injection,
demo/activity/history and booth handlers), changed-file ESLint/Stylelint and the
summit Worker deployment **dry run** pass. `test/fixtures/booth-recovery-browser.js` verifies
visible timeout recovery, email scrubbing and idle reset without releasing the
held lookup. Entry/personal report/Finish, all ten synthetic industry demos,
retired-request behavior and ordinary unmarked report behavior are checked
without real customer mutations or email. Entry dismissal models cover native
2160 x 3840 and scaled 1728 x 3072, 1440 x 2560, 1080 x 1920 and 864 x 1536 CSS
viewports. The physical display is **40-inch portrait, 2160 x 3840 physical
pixels**; OS/browser/scaling/DPR and native keyboard policy remain unconfirmed.
At 250% scaling (864 x 1536 CSS), the existing large-report portrait profile
does not activate; this remains a device configuration/acceptance gate, not a
breakpoint redesign. Earlier protected-customer verification is historical;
no fresh authenticated customer report certification is claimed by this fix.
Hardware keyboard/reach/privacy policy, real Turnstile and inbox receipt remain
separate gates. Repository-wide pre-existing lint issues remain outside scope.

**Ordinary report native portrait display:** at exactly **2160 × 3840 CSS pixels**, insight reports now enlarge the existing composition by **1.6×**: the 1200px shared column renders at **1920px**, with proportional text, charts and controls. The viewport-wide Cannes stripe compensates for CSS zoom to avoid horizontal overflow. Nearby dimensions, 1080 × 1920, mobile and landscape remain unchanged. Authorized booth reports retain their existing large-format profile without double scaling. This is viewport-specific frontend styling, not an access-mode change; actual hardware CSS viewport/DPR still needs confirmation.

### October 8 final Figma screens and unmatched/demo tracking (deployed)

Implemented the final [Entry frame](https://www.figma.com/design/D8EQjOoLp0gRdZoIMk1SEj/Adobe-Brand-Visibility-UI?node-id=312-388)
and [Finish 6 frame](https://www.figma.com/design/D8EQjOoLp0gRdZoIMk1SEj/Adobe-Brand-Visibility-UI?node-id=244-579):
exported Adobe wordmark and new, losslessly optimized hero artwork; final
header/headline/form geometry; horizontal email/outlined-clear actions and
registration-address hint; real **Enter email / View report / Save and share**
progress indicators. Native 2160 × 3840 and the 2160 × 2881 reference use the same
design coordinates; 1080 × 1920 and mobile retain responsive touch targets.
The three previews still render actual report content, not Figma placeholders.
Long preview titles keep complete lines rather than shrinking into a clipped
partial line when the live report's subtitle and metadata need space.

Entry keeps the nonblue, white-label **Industry demos** pill. Confirmed no-match
shows recovery first; the visitor must explicitly open the chooser. Its copy says
no report is available yet and invites exploring an industry example with the
booth team. All booth request buttons/routes are removed. Public `/request-report`
and its validation/consent are unchanged for ordinary visitors.

The private activity CSV now records `no_report`, `demo_selected` and
`demo_viewed` against the normalized search email and the same Visit. Selection
and actual opening are distinct; changing industry preserves correlation.
Reset, expiry, a different operator or a new lookup prevent reuse for another
visitor. Direct staff demo viewing invents no attendee email. Status, API payloads
and browser storage never expose the private correlation; Simple Analytics gets
only anonymous counts. This records report availability and example viewing,
**not sales-contact consent or a new report request**.

Adobe OAuth can export missing-report emails at
`https://act.aem.now/api/booth-activity.csv?kind=no_report`; use the complete CSV
and **Visit** to associate subsequent industry selections/views. Booth credentials
cannot download it. The existing outbox, idempotency and 90-day retention remain.
Applied D1 migration `0003_booth_demo_activity.sql` before Worker deployment;
it preserved historical rows/indexes and extended allowed event kinds.
CSS uses `?v=booth-final-figma-1`; merged Entry/adapter/keyboard JS uses
`?v=booth-recovery-2`. No live customer search/send was performed.

**Production rollout, October 8 at 09:47 UTC:** deployed latest main
`e92398dcbcb12149a67fc1453daf7d146fdf5441`, including PRs #157 and #158,
to the `summit-portal` Worker (`--env summit`). Version
`051e6ea0-e88b-47d8-a1f2-037360f73480` serves 100% of traffic.
The production D1 migration preserved all 41 existing activity rows and the four
activity indexes; no migrations remain pending. Live versioned runtime, adapter,
keyboard, presentation, preview, CSS and final artwork match this revision
byte-for-byte. Anonymous `/booth` redirects to staff setup; status, demo catalogue
and private activity CSV remain unauthorized. KV/D1/Durable Object bindings,
staff epoch and hourly retention cron are unchanged. Close existing report tabs
and reload `/booth` on the managed touchscreen. Physical-device acceptance,
Privacy/Legal approval and inbox-receipt checks remain separate gates.

Validation covered all ten industry journeys, personal report/send/reset and
swipe/keyboard previews, reference/native/fallback/mobile geometry, private
correlation and migration preservation. The complete frontend suite passed
254 tests with one concurrent browser; parallel runs intermittently stalled
in frame-driven layout tests. Worker tests passed 437 with one existing skip;
changed-file ESLint/Stylelint and the optimized Worker dry run passed.

### October 8 report-to-entry recovery correction (deployed)

Replaying the deployed Worker's recovery HTML reproduced the concealed report,
disabled retry button and `Cannot set properties of null (setting 'textContent')`
before any reset request was sent. The Worker emitted bare status text while the
adapter assumed a message paragraph existed. The simplified local fixture
already had that paragraph, so earlier local journeys missed the production
contract mismatch.

Worker injection now supplies an alert paragraph. The adapter also normalizes
legacy injected HTML, preserving its retry control and isolated recovery link;
reset/failure messages use the verified paragraph reference. The report's
navigation guard allows only the explicit `/booth?recover=1` recovery link in
that recovery panel, while other external links and downloads stay blocked.
Worker injection and lazy loading use the matching `?v=booth-clear-1` adapter.
No D1 migration or authorization change is required.

**Production rollout, October 8 at 10:12 UTC:** deployed merged main
`2974aad25b3ce73830171e6848c2f4add97418bf` (PR #159) to the `summit-portal`
Worker, version `4d79da8a-1e79-4e03-a362-b72cfb901634`, serving 100% of traffic.
The live `booth-clear-1` adapter and origin lazy module match this revision
byte-for-byte and use the same import version. Anonymous Entry redirects to
staff setup; status, demos and private CSV remain unauthorized. The isolated
recovery page remains available with bounded, server-confirmed reset. No D1
migrations were pending; bindings, staff epoch and cron are unchanged. No live
attendee lookup, reset or email was performed. Close old report tabs and reload
`/booth` before testing on the touchscreen.

Regressions reproduce the old markup failure, cover failed verification/reset
and manual recovery link activation, and require the Worker/lazy import contract.
The local browser verifier reads actual Worker markup rather than substituting
its own: personal/demo clearing, legacy HTML, Finish-to-entry, reset retry,
verification failure and idle clearing return to a usable blank Entry.
Existing visitor scrubbing, server-confirmed reset and fail-closed concealment
remain. No real customer lookup, context mutation or email is used.

### Report selection and preview loading (October 8, local; not deployed)

The report picker retains the previously approved centered outlined **Back to
email lookup** action, including its 120px/45px native touchscreen sizing and
smaller-screen touch minimums. Report and demo selections show a full-screen
**Opening your report...** indicator immediately, with covered controls inert.
Failed selections restore usable controls and an explicit error.

The Worker supplies the same loading treatment in its initial HTML and critical
CSS while the selected report remains concealed. Recovery actions appear only
on failure; legacy recovery markup still works. Report content is revealed
after access confirmation and portrait stylesheet loading, not before.
Stylesheet stalls have a ten-second recovery deadline; expiry/reset still
prevent late reveal. No-JavaScript instructions remain visible.

Finish reserves the preview area with a reduced-motion-aware progress indicator.
Renderer imports now overlap the authorized HTML fetch instead of waiting for
it. With independently delayed 300ms HTML/renderer requests, the same local
cold-Finish probe measured 636ms before and 461ms after; this is a synthetic
measurement, not a production latency claim. Email and clearing stay available
while previews load. No attendee HTML is cached or stored.

The report-adapter version is `booth-loading-1`; Entry uses `booth-final-figma-2`
with the final visual corrections below. The shared
`styles/booth-loading.css` is Worker-bundled and revalidated. The local fixture
replays current Worker concealment/loading markup rather than maintaining a
simplified copy. `test/fixtures/booth-loading-browser.js` checks delayed/failed
selection, verified styled reveal, stable Finish loading, overlapping downloads,
reduced motion and return sizing at 2160/1080/390px. These changes require a
separate Worker deployment; the production version below is unchanged.

### Latest three-screen Figma alignment (October 8, branch; not deployed)

Aligned the latest [Entry](https://www.figma.com/design/D8EQjOoLp0gRdZoIMk1SEj/Adobe-Brand-Visibility-UI?node-id=320-136),
[Industry](https://www.figma.com/design/D8EQjOoLp0gRdZoIMk1SEj/Adobe-Brand-Visibility-UI?node-id=328-112)
and [Finish](https://www.figma.com/design/D8EQjOoLp0gRdZoIMk1SEj/Adobe-Brand-Visibility-UI?node-id=320-2475)
frames after the designer's final review. All three share the 277px header.
Entry matches the 136px notch, 112px gutters, 54px field/help typography,
light-gray 6px field border, 454 by 120px action and exact exported open-in glyph.
The hero uses the current exported art/glow with the design's clipped image frame.
The staff's dark **Industry demos** action and disclosed private email tracking
remain intentional additions absent from Figma.

The chooser supersedes the older node documented below: white 950 by 165px
cards, 1px black borders, 10px corners, 36px column/54px row gaps and 24px
company labels. It uses the newly exported cart, healthcare and media icons,
plus the seven unchanged industry icons. The centered blue **Try another email**
action is 427 by 120px, verified against the actual Figma instance; the generic
generated component's conflicting width is not used. The availability note is
removed, while the staff signout control and conditional no-match copy remain.
All canonical company/industry labels and routing identities already matched.

Finish retains live, swipeable selected-report excerpts, not the Figma sample
brand or scores. Its 1960 by 752px montage includes the exact exported rainbow
glow, with 1410 by 724px center and 910/853 by 696px side cards. CTAs use the
467/601 by 120px dimensions, 80px gap and 54px email explanation. The Entry and
Finish progress footers match the common 112px gutters and 80px gaps.
Geometry scales by viewport width with mobile/touch minimums and the footer
anchored to the taller 2160 by 3840px touchscreen.

Entry JS/CSS use `booth-final-figma-2`; all revised image assets revalidate and
the new glow is Worker-bundled. This branch incorporates main's activity-based
15-minute session renewal without weakening report concealment/loading gates.
`booth-final-design-browser.js` and the updated industry verifier compare native
geometry within one pixel; the original report/loading/privacy journeys remain.
No production deployment is included in this change.

### Final Figma industry chooser (October 8, deployed)

Implemented [Screen 3 Choose an industry](https://www.figma.com/design/D8EQjOoLp0gRdZoIMk1SEj/Adobe-Brand-Visibility-UI?node-id=320-3714).
The 2160 × 2881 reference has a 277px header, 112px body gutters, two columns
of 928 × 181px light-gray cards with the ten exact exported 64px industry icons,
and a centered 489 × 120px outlined return button. The chooser alone replaces
the progress footer with the availability note and designed staff signout label.
It scales to the 2160 × 3840 touchscreen, retains touch-size minimums at
1080 × 1920, and uses one column on mobile.

The missing-email introduction appears only after a confirmed no-match;
the staff shortcut instead says to explore an industry example without making
a false claim about an email. Canonical catalogue names, report destinations,
selection/view tracking, confirmed clearing and authorization are unchanged.
Industry labels use the already-loaded Adobe Clean Bold rather than incorrectly
substituting the kit's Display Black for an unavailable Display Bold weight.
The existing canonical **Automotive** spelling is retained.
Entry JS/CSS use `booth-industry-figma-1`; all ten icons are Worker-bundled.
The synthetic browser verifier checks native Figma geometry within one pixel,
loaded icons, every industry, touch profiles and reset/history privacy.
No migration is needed. The same rollout includes the Finish preview bar fix.

**Production rollout, October 8 at 11:41 UTC:** deployed merged main
`aabdd0a92e9da6760dbb6fd6995ece3397c2dc8d` (PR #160) to `summit-portal`,
version `025e07bc-95e2-4e78-9a9b-be865998f32c`, serving 100% of traffic.
Live Entry JS/CSS, the preview runtime/helper, all ten industry SVGs, the
report adapter and origin lazy module match merged source byte-for-byte.
Changed assets revalidate; anonymous Entry redirects to staff setup and
status, demos and private CSV remain unauthorized. The bounded manual recovery
page remains available. No D1 migrations were pending; bindings, staff epoch
and cron are unchanged. No live attendee lookup, reset or email was performed.
Close old report tabs and reload `/booth` on the touchscreen.

### Finish preview chart fills (October 8, deployed)

The static LLM visibility preview now applies the completed `rav-animate` chart
state. Previously, the real data percentages were present but CSS kept fills at
zero width because previews intentionally omit the normal report's scroll
observer. Competitor and platform bars preserve their authored values, relative
widths and colors; genuine zero scores stay empty. Ordinary report animations
are unchanged. The preview imports `rav-core.js?v=booth-preview-bars-1`, and the
Worker revalidates both the preview runtime and visibility helper with `no-cache`.
This correction is included in the verified production rollout above.

### Industry demo fallback and fresh booth requests (October 7 historical)

Entry now offers quiet **Staff: show an industry demo** and **Request my report**
actions. A genuine lookup 404 with `code: no_report` offers a demo, a report request
or another email; lookup outages remain explicit failures, not false no-matches.
The industry chooser exposes all ten approved companies from the single Worker
catalogue in `src/booth-demos.js` and opens their existing public example reports.

At that time, demo/request contexts were separate, staff-bound, ten-minute modes with no visitor
email, candidate list or delivery state. Switching modes clears previous visitor
access while preserving existing identified lookup history and its outbox retry.
Demos have persistent **Example report** labeling, **Change industry**,
**Request my report** and **Clear** controls, never a personal Finish/email action
or personal report-view event. Public documents receive these controls only on
the exact selected path of a live, initialized booth device. Ordinary public
visitors and protected customer report authorization remain unchanged.

Requests open the existing `/request-report` in the same tab, without email,
company or consent prefill. The confirmed kiosk profile uses a single-column
form: native 2160 × 3840 fields have 64px text and 128px touch targets;
1080px-wide fields retain 32px text and 76px targets even with a reduced keyboard
viewport. The existing endpoint, Turnstile, required fields, optional details,
idempotency and explicit sales-contact consent remain. A successful submission
offers **Finish and clear this screen**; reset, pagehide/history recovery,
fifteen-minute inactivity and server expiry remove visitor fields. Input/change
events renew inactivity for virtual keyboards. Failed verification removes the
form and shows recovery; failed clearing hides visitor content and permits retry.

Merged [#152](https://github.com/aemsites/summit-portal/pull/152) also contains the
carousel PDF-click fix documented below. Local browser checks exercise all ten demos, no-match/outage distinction,
fresh form validation/consent, synthetic completion, inactivity/history privacy,
failed verification and the existing personal report/Finish journey. Form/chooser
checks cover native portrait, 1080 × 1920 and mobile, plus a keyboard-reduced form.
Verification passed 388 Worker tests (one existing skip), 212 frontend tests
and changed-file ESLint/Stylelint. After explicit deployment approval, merged
main `f9d7c454eb350d36d6de0e7e3605df1bcdb046ce` was deployed on October 7 as
Worker **`10608171-3483-4835-95ef-4e290b4ac677`**, serving **100%** of traffic.
Live booth/runtime control modules and portrait form CSS match merged source.
Anonymous `/booth` still redirects to staff setup; catalogue and status return
401. Existing KV/D1 bindings, staff epoch, secrets and temporary timing
diagnostics are unchanged. Close old report documents and reload `/booth` to
load the new flow. Real Turnstile/submission and physical kiosk rehearsal remain
rollout gates. See [booth access](docs/implementations/booth-access/README.md#industry-demo-and-report-request-recovery).

### October 7 Finish 6 production rollout

**Touchscreen follow-up:** Jose confirmed that the placeholder three-part
footer progress bar should stay removed. The real Finish step badge remains.
Entry demo/request and recovery/list request/back actions are now separate
outlined neutral buttons, not small underlined links. Native targets are
approximately **130px high with 52px type**, fallback targets at least **72px
with 26px type**, and mobile targets at least **64px with 22px type**.
Two equal columns on desktop become a full-width stack on mobile; visible
spacing, focus rings and a neutral hover state distinguish each action while
keeping report lookup primary. Actions and consent behavior are unchanged.

**Entry review corrections:** the privacy notice is shortened and visually
quieter, while preserving Adobe's email/activity recording, booth-measurement
purpose, 90-day retention, no implied sales-contact request and Privacy Policy
link. It remains visible beside the lookup action and accessible to assistive
technology. The local fixture no longer opens a sample report for every email:
only `visitor@example.test` matches, any other email produces the no-report
warning, and `service-error@example.test` still simulates an outage.
Industry selection remains explicit after the warning; no demo opens
automatically. This changes local fixtures, not production CUG matching.

The current branch replaces Finish 5 with
[Screen 2_Finish_version 6](https://www.figma.com/design/D8EQjOoLp0gRdZoIMk1SEj/Adobe-Brand-Visibility-UI?node-id=244-579).
Its **1950 × 725px** montage shows the selected report's LLM visibility
(visibility/citations, Competitive landscape and Platform visibility), hero
plus four summary metrics, and first Your briefing / Executive overview slide.
All three excerpts remain visible; horizontal swipes, side taps and keyboard
navigation rotate the foreground without another request. Static shared
builders reuse real report content, not the Figma sample images. Inner report
controls are inert, chart labels are escaped, and reduced motion is supported.
The front excerpt is **1411 × 724px**, with fixed framing and a two-line overview
heading. Missing sections have explicit messages; unsupported heroes retain
retry. The single authorized no-store fetch, expiry/abort/revision guards and
reset/pagehide privacy clearing remain.

Version 6 centers the **STEP 03 OF 03** badge and blue **Email my report** pill,
uses the exact exported Open In icon, then a gray **Prefer to meet later?**
informational panel and smaller dark reset pill. At Jose's direction there is
**no Please contact me action or contact-interest Simple Analytics event**.
The retired contact route returns 404, including direct actor calls.
Historical first-party contact records/outbox entries remain private and retain
their original 90-day lifetime; replay no longer sends anonymous contact counts.
Search/view/email do not imply contact consent. The separate public request-form
consent behavior is unchanged. Mock toolbar and placeholder footer progress
remain omitted; the static Finish step badge now follows the approved design.

Entry 3 is unchanged. The exact-dimension local reviewer at
`http://localhost:3000/` includes native **2160 × 3840**, reference **2160 × 2881**
and fallback **1080 × 1920** sizes. Following explicit approval, merged
[#153](https://github.com/aemsites/summit-portal/pull/153), main `b53db04`,
was deployed on October 7 at 15:31 UTC as Worker
**`baeeaccd-e9b2-4a4e-bdb4-5068491316cb`**, serving **100%** of traffic.
Live Finish 6 runtime, preview renderers, styles and icon match merged source.
Anonymous `/booth` retains its staff-login redirect; status and demo catalogue
retain 401 responses. Reload `/booth` and reopen the report to load the new
version; existing tabs do not hot-reload. Authenticated email delivery and
physical kiosk rehearsal remain unverified. See [current booth flow](docs/implementations/booth-access/README.md#october-7-fixed-entry-3--finish-6).

### October 7 initial approved Figma booth implementation (historical Finish 5)

The initial booth rollout implemented the designer's
[Final Design](https://www.figma.com/design/D8EQjOoLp0gRdZoIMk1SEj/Adobe-Brand-Visibility-UI?node-id=5-2)
as fixed [Entry 3](https://www.figma.com/design/D8EQjOoLp0gRdZoIMk1SEj/Adobe-Brand-Visibility-UI?node-id=92-648)
and [Finish 5](https://www.figma.com/design/D8EQjOoLp0gRdZoIMk1SEj/Adobe-Brand-Visibility-UI?node-id=209-2214).
Legacy `entry`/`finish` URL settings no longer select or propagate variants.
Entry keeps the website/glow artwork in native Figma coordinates and the
rounded white email surface; there is no artwork rotation. Adobe Clean Display
Black loads through Adobe's `hah7vzn` Typekit kit while body text retains
`pbq1nqa`; actions use Spectrum blue pills and the exported arrow.
The 2160 × 2881 reference composition scales from 1000px; taller 2160 × 3840
displays add white space, while mobile stacks the hero and uses two metric columns.

**Actual-report preview:** `scripts/booth-preview.js` makes one same-origin,
`no-store` GET of the exact server `selectedPath` after returning from the report.
Full-page navigation does not retain the previous report DOM. Finish is a
client-side view, so the valid server context remains in `report` state and the
existing exact-path authorization permits this request. No new endpoint,
email lookup, report discovery, generation, iframe or exported preview image
is used. Narrow sanitized extraction supplies the existing insight-hero and
dark-stat builders with the report's real title, illustration, metadata and values.
The preview is read-only and static: no links, metric controls, typing or number
animations, report scripts, portal chrome or relocated footer.
Shared builder defaults remain unchanged on ordinary reports.

The preview stays **above Email my report**, as Jose explicitly chose. Its native
width is 1950px, with 552.5px hero / 447.65px metric-strip minimum heights and
26px corners; real report text can increase its height rather than being clipped.
Loading, explicit failure and Retry preview states do not disable email/contact
actions. Missing metrics are identified rather than fabricated. Requests are
aborted/revision-guarded and preview content cleared on reset, pagehide and expiry,
without storing attendee report HTML in local/session storage. Hero/stat module
imports use `?v=booth-preview-1` to avoid previously cached versions without the
new named exports.

Approved production differences: no mock preview toolbar, screen switcher,
step badges or placeholder progress; canonical report naming, business-email
identification, accessible Adobe attribution, 90-day privacy notices, separate
**Please contact me** consent and confirmed server reset remain intact.
The tagline/exported Finish illustrations and **Talk through your report here**
section are removed. **Prefer to meet later?** remains as a single full-width
contact panel. At Jose's request, the delivery/privacy sentence beneath
**Email my report** is removed; the business-address hint, Entry activity notice
and separate contact-consent notice remain. **Finish and clear this screen** is reset-only.
The Worker bundles only the arrow, website illustration and website glow from
`img/booth/`, plus the shared renderer modules using Text/Data rules. Deploy the
updated Worker separately; local implementation does not imply deployment or
real email delivery. The legacy review/export prototype is unchanged.

**Production Worker rollout, October 7:** deployed merged main `0386931`
([#150](https://github.com/aemsites/summit-portal/pull/150)) to `summit-portal`
with `--env summit`, version `16ecfbdb-877b-46af-9bf6-21401751509d`, at
`https://act.aem.now`. The deployment is active at 100%; live preview-module,
stylesheet and both shared-renderer hashes match merged source. Anonymous
`/booth` still redirects to staff login and `/auth/booth/status` returns 401.
Existing D1 migrations are current; KV/D1 bindings, staff epoch and hourly purge
remain unchanged. Full Worker regression: 333 passed, one existing skip.
No customer lookup, report send or contact request was performed during rollout.
Previous rollback version: `8983a8ec-97ff-4de9-a59c-f1560839a046`.
Reload the live booth and reopen reports; already-open documents do not hot-reload.

**October 7 production latency investigation (not a runtime fix):** the supplied
multi-report HAR measures lookup at 11.730s, select at 9.157s and Finish status at
5.055s, almost entirely waiting for server responses. The report document and
Finish preview take 163ms and 168ms respectively. There is no HTTP redirect to
Entry on the Finish transition. A local delayed-status reproduction confirms
that the default visible Welcome panel remains onscreen until initial status
selects Finish; a neutral initial checking state is needed, without displaying
unverified attendee content.

Lookup and selection each freshly fetch all three private datasets; these
fetches already run in parallel. Both also await identified D1 activity export
after persisting the Durable Object outbox. Staff JWT verification is local;
anonymous analytics runs through `waitUntil`, not the response-critical promise.
Synthetic real-handler probes independently confirm origin/D1 delay propagation,
status's KV-read dependency and status queuing behind an in-flight report-view
action. The HAR does not contain that view request, so this queue mechanism is
not yet proven to explain its specific slow status response. Discovery also
rescans CUG entries per report: synthetic 4,000/10,000-row datasets take roughly
0.4s/2.3s locally with no injected network delay, not measured production CPU time.
Production queue, storage, dataset-fetch and matching timings remain unknown;
stage-level instrumentation is required before attributing the observed seconds
or selecting a backend optimization. No authorization freshness, expiry/reset,
outbox failure behavior or production code was changed during this investigation.

**Follow-up diagnostics and initial loading state (deployed October 7):**
the shell now starts with all attendee panels hidden and a visible
**Checking this booth...** status, including before module execution. Initial
status selects the authorized screen; failures retain staff/retry recovery
without exposing an unverified Finish. The Worker adds request-local
`Server-Timing` for staff verification, coordinator round trip/application queue,
actor execution/storage, KV, per-dataset fetch/body reads and D1 export.
Fixed labels and numeric dataset row counts contain no emails, report paths,
cookies or identifiers; 401 responses omit diagnostics. The
`BOOTH_TIMING_ENABLED` flag defaults off and is temporarily enabled in the summit
deployment configuration, to be disabled after the production capture.
Cloudflare clocks only advance on I/O: CPU matching is explicitly labelled
unavailable, not reported as zero cost. I/O spans may include preceding CPU work,
and parallel/nested spans must not be summed. Local profiling and production
CPU observations are needed alongside the next HAR. Authorization, serial
execution, expiry/reset, outbox export and mail/contact behavior remain unchanged.
Deployed source commit `3a5dab3` with `--env summit`, version
`7874a428-b9f9-40b2-83c0-1db759b72cdd`, active at 100%.
The live booth-script hash matches committed source; anonymous booth access
still redirects to staff setup, and anonymous status remains 401 with no timing
header. Previous rollback version: `16ecfbdb-877b-46af-9bf6-21401751509d`.
The follow-up authenticated HAR is analyzed below; direct production CPU timing
remains unavailable.
No live customer lookup, email send or contact request was performed during
rollout verification.

**Second production HAR, October 7:** the instrumented multi-report flow measures
lookup at 6.482s, selection at 4.796s and Finish status at 2.842s. Fresh dataset
response-header fetches take 15-79ms each, with body spans of 4-16ms; KV reads
take 5-6ms. The snapshots contain 9,989 index rows, 9,258 CUG rows and 10,281
mapping rows. Lookup's first I/O after matching is labelled KV write (5.486s);
selection's first I/O after matching is labelled D1 export (4.394s). Because
the runtime clock is frozen during matching, those figures cannot be treated
as isolated KV/D1 service latency. Local CPU profiling of the real discovery
code with synthetic 10,000-row sheets measures 2.423s and identifies the linear
`matchSheetGroups` search as the dominant CPU hotspot. Repeated report-by-rule
scanning is the leading explanation; production CPU time is not directly measured.
Finish's actor execution is only 6ms versus a 2.781s round trip. Its reported
application queue span (3.886s) exceeds that round trip and is not a literal
elapsed duration; runtime-clock limitations prevent precise queue attribution.
The HAR again lacks a view POST, so the blocking operation remains unconfirmed.
The proposed fix is a per-fresh-snapshot CUG lookup index preserving longest
scope and exact/glob tie behavior, not authorization caching or weaker
revalidation. No additional runtime change or deployment has been made from
this capture.

**October 7 request-local CUG optimization:**
booth discovery now builds a prefix `Map` once from each fresh CUG snapshot and
looks up only the current report path's prefixes. Longest scope, authored
exact/glob tie order, duplicate precedence and narrower restrictions remain
equivalent to the unchanged linear matcher. Fresh parallel dataset loading,
independent mapping checks, authorized alias selection, coordinator serialization
and awaited activity export are unchanged; there is no cross-request permission
cache or Entry preloading. Ordinary report CUG matching is untouched.

The real lookup/selection regression failed before the fix with 500,500 rule-prefix reads
for 1,000 reports/rules (budget: 2,000), then passed with the index. Matcher
equivalence includes 2,600 seeded path checks and explicit edge cases; fresh
revocation/regrant and the full Worker suite pass (366 tests, one existing skip).
The unchanged synthetic, no-network discovery harness measures 10,000 rows per
sheet at 2,337ms before versus 30ms after this change; 1,000/4,000-row cases fall
from 41/386ms to 9/18ms. A separate local 10,000-rule measurement builds the index
in 1.15ms with approximately 838KiB additional retained heap. These are synthetic
Node measurements, not production guarantees. Changed-file ESLint and the
summit deployment dry-run pass. The production rollout is recorded below;
a new live HAR is still needed, and Finish queue attribution remains unresolved.

The same synthetic harness also runs the real handler/coordinator flow against
10,000-row sheets: lookup 24ms, selection 25ms and status below 1ms, each within
a local-only 1s diagnostic budget. All I/O is mocked and only three reports are
authorized; these numbers do not include real edge transport or service latency.
An isolated-browser synthetic Entry -> report -> Finish check at 2160 x 3840
also passes, with the native preview visible and no horizontal overflow. This
UI fixture does not execute the production Worker or measure its latency.

**Production indexed-matching rollout, October 7:** deployed merged main
`78c4bd1` ([#151](https://github.com/aemsites/summit-portal/pull/151)) with
`--env summit`, version `4a6291d9-6437-46c3-9e89-9eca1ee8f906`, at
`https://act.aem.now`. The deployment is active at 100%; the live bundled
booth-script hash matches merged source. Anonymous `/booth` redirects to staff
login and `/auth/booth/status` remains 401 without diagnostic headers.
Bindings, staff epoch, hourly purge and activity-export behavior are unchanged.
Timing diagnostics remain enabled for the before/after HAR comparison; disable
them and redeploy once those captures are complete. No real customer lookup,
email send or contact request was performed during rollout verification.
Immediate rollback version: `7874a428-b9f9-40b2-83c0-1db759b72cdd`.
Reload the live booth and capture lookup, selection, report viewing and Finish
with Preserve log; local timing improvements do not establish live latency.

**October 7 design review:** Rosie explicitly selected **Entry 3** in the
[Figma comment notification](https://outlook.office365.com/owa/?ItemID=AAkALgAAAAAAHYQDEapmEc2byACqAC%2FEWg0AkZKfnox9bkCk%2FxUI0FD3PwAHB%2B1wJwAA&exvsurl=1&viewmodel=ReadMessageItem).
Its hero and form are unchanged from the October 6 native Figma reference;
pixel differences are confined to upper-right prototype controls.
[Sara/Rosie's direction](https://outlook.office365.com/owa/?ItemID=AAkALgAAAAAAHYQDEapmEc2byACqAC%2FEWg0AkZKfnox9bkCk%2FxUI0FD3PwAHB%2B1wKQAA&exvsurl=1&viewmodel=ReadMessageItem)
requested removal of the tagline, prominent email action and a generic/blank
preview. Jose subsequently approved **Finish 5**, explicitly chose the actual
selected report instead of a generic example, kept the preview above the CTA,
and confirmed removal of the talk-through guidance. These user decisions govern
the implementation. Comment coverage remains limited to retrieved notifications,
not complete native Figma comment-resolution or version history.

**Local touchscreen review:** `npm run preview:booth` serves
`http://localhost:3000/` on loopback. The review frame loads the actual booth
shell at an exact **2160 × 3840 CSS viewport**, with optional 1080 × 1920 fallback
and 2160 × 2881 Figma reference. Fit, fill-width and 1:1 inspection change only
the frame's visual scale, never its CSS viewport. Entry/Finish controls switch
between the two fixed screens. Explicit local fixtures enable example-report navigation,
send/contact feedback and reset without real email, lead recording or staff
authentication; entered emails are not retained. The selected synthetic report and
Finish preview share the same authored hero/metrics. Use
`no-report@example.test` to exercise missing-report recovery and
`service-error@example.test` for an outage; any other synthetic email opens the
prepared-report fixture. All ten demo routes reuse synthetic report content with
the chosen company label. The request fixture uses the real decorator and
portrait styles with fake Turnstile and a locally intercepted success response,
never a real lead submission. Browser flow checks cover
one lookup followed by the report document and one preview document request,
consent/delivery/reset failures and privacy clearing. Render checks cover
2160 × 2881, 2160 × 3840, 1080 × 1920 and 390 × 844 without horizontal overflow;
all Finish actions fit the portrait reference/target/fallback viewports, with
mobile content deliberately scrollable. This does not verify physical
legibility, browser zoom/DPR or the actual event hardware's CSS viewport.
Without `--preview`, the fixture server still returns 503 for unmocked APIs.

## Project Structure

```
├── blocks/                    # Block implementations (JS + CSS per block)
│   ├── header/                # Site header with nav, help icon, dark mode toggle
│   ├── footer/                # Site footer with copyright + legal links
│   ├── report-hero/           # Hero greeting with brand badge and decorative SVG
│   ├── report-stats/          # Metric cards with gauges and trend badges
│   ├── report-carousel/       # Tabbed carousel with SVG charts and findings
│   └── report-download/       # Download CTA with PDF card preview
├── content/                   # Authored content (served by AEM CLI)
│   ├── index.plain.html       # The report page
│   ├── nav.plain.html         # Header navigation content
│   └── footer.plain.html      # Footer content
├── img/                       # Static assets (SVGs, icons, logos)
├── styles/
│   └── styles.css             # Global styles with design tokens
├── scripts/
│   ├── ak.js                  # Core framework (NEVER MODIFY)
│   ├── scripts.js             # Page initialization
│   ├── lazy.js                # Post-LCP loading (footer, sidekick)
│   └── postlcp.js             # Header loading
```

## Blocks

### report-hero (insight variant)
Full-width red banner with a personalized greeting ("Hello, Erika!"), a site description, a brand badge linking to the customer's site (with favicon), and a site screenshot. Features a typing animation on the heading and a decorative SVG background. The screenshot is hidden on mobile.

### report-stats (dark variant)
A horizontal strip of four metric cards on a black background. Each card shows a KPI label, animated count-up value, a color-coded trend badge (positive/negative/critical/optimal), and a description. The performance score card includes an SVG semicircle speedometer; the red fill arc and needle are animated with geometry suited to a ≤180° sweep (selectors `.rs-gauge-fill` / `.rs-gauge-needle` when present). **Experiment:** `.report-stats.dark` pins light-theme colors (`color-scheme: light` + fixed values) so the hero KPI strip stays black with white type regardless of the page color theme toggle.

On insight/Cannes pages, the light **Search performance** block renders the shared `.rav-stats` strip (same markup and CSS as **report-ai-visibility**): sentence-case labels, large values, sublabel descriptions, and a bottom hairline — laid out in a **2×2 grid** (AI visibility keeps 3-across). Severity (`poor` / `good` / `warning`) tints the value only. The strip is a direct child of `.report-stats`; relocated “How to act” / data-source footers sit in a sibling `.rav-panels-outer` below. Summit pages keep the legacy `.rs-grid` card layout.

### report-carousel
A tabbed carousel with three persona views — Executive overview, Marketer insights, and IT/Engineering learnings. Each tab contains multiple slides with a "Top insight" callout and an SVG data visualization (column charts, line charts, donut charts, horizontal bars, stacked bars, big figures, metric strips, or recommendation lists). Includes dot navigation, prev/next arrows, and a slide counter. `bigfigure` accepts the documented single pipe-delimited row (`value | unit | label`) as well as the legacy three-`<p>` form — the renderer reads the pipe parts first so the documented form (what the DIH template emits) doesn't drop the unit/context. Slides use `min-height` (not a fixed `height`) so tall content like a 3-item `recommendationlist` grows to fit instead of clipping; on mobile the `.rc-slide-visual` 300px height cap applies only to SVG charts, not to text-content visuals (`recommendationlist`/`metricstrip`), which must grow.

**Swipe navigation:** primary touch/pen horizontal swipes advance or reverse slides within the selected tab, including the three-pillars overview. Vertical scrolling, pinch zoom and interactive links remain available. Single-slide navigation is a no-op, and delayed exit animations check the current tab/slide before hiding a node, preventing blank content after rapid back-and-forth navigation.

**PDF activation:** Simple Analytics auto-events can decorate the authored PDF link before the carousel initializes, adding an inline `return false` handler. Previously both cloned download buttons inherited that cancellation, then changed to `_blank`; analytics recorded the event but neither native navigation nor its callback opened the PDF. Both clones now preserve the inherited handler as a normal click listener, ignoring its stale return value while retaining tracking and explicit `event.preventDefault()`. PDF URLs, authorization, disabled/unavailable states and new-tab behavior are unchanged. Browser regressions cover both analytics load orders and both buttons; native mouse, Enter and touch activation were confirmed with the actual auto-events script at 2160×3840, including a tracking callback that never completes. The authenticated Amundi production example could not be retested because it redirects to sign-in. This frontend fix was merged in #152; its live module matches merged source after code sync. It does not require a Worker deployment.

### report-download
A split layout with a heading, description, and download CTA on the left, and an interactive PDF card preview on the right. The card has a red patterned background, the report title, and hover effects. Shows metadata (last updated date, page count). PDF title text is resolved from the block row markup (including nested links).

### report-ai-visibility
Summit “LLM visibility” / “Performance insights” experience: stat cards, platform coverage pills, side-by-side comparison panels with charts (horizontal bars, platform bars, score tables, big figures). Horizontal bars support count vs percent display (authoring flags `|percent` / `|count`, or inferred share-style totals), and can show platform favicons when labels match known brands. Gap, key insight, and CTA rows render below the panels; the CTA copies from the authored block cells. An empty shell section next to the block hosts the nested **report-scores** page-performance cards (no extra grid padding in that shell). `.rav-panels-outer` stacks its `.rav-panels` cards in a flex column (`gap: 8px`); a lone `.rav-panel` inside `.rav-panels` (e.g. Key findings) uses a full-width flex column on desktop instead of a centered half-track. On Cannes pages, the section-authored “How to act” **report-callout** and “Data source: …” line are relocated into each section’s primary widget footer (inside `.rav-panels-outer` for AI Visibility, Search performance, and Performance insights). Relocated `.report-callout` and `.default-content` footers inside `.rav-panels-outer` share `margin: 8px 0 0` (callouts override to `20px` top). `.default-content` lays out a 28×28px Semrush SVG (`.cannes-source-logo`, no wrapper) and source line in a flex row (`align-items: center`, `gap: 12px`); the SVG is a sibling of `.cannes-source`, not nested inside it, and the source line uses `line-height: 28px` so it vertically centers with the icon. Horizontal inset uses `--rpt-widget-inset` in `cobrand.css` for most widget footers; in the Performance insights empty shell (`.rav-empty-shell`), relocated footers stay edge-to-edge (`padding-inline: 0`) alongside nested **report-scores** cards. Relocation runs per-block during decoration and again via `relocateAllSectionFooters()` from `lazy.js` (`relocate-section-footer.js`).

### report-scores
Page performance cards (URL, score meter, metrics) used inside the AI visibility performance shell and elsewhere. Card grid and meters are scoped under `.report-scores`. The grid is `repeat(2, 1fr)` on desktop for multi-page reports; when a report has a single card (e.g. Cannes' one mobile-experience card) the Cannes scope collapses it to one column so it fills the shared column instead of sitting at half-width.

Each tested page shows its complete URL from `.rsc-page-name a.href`, including protocol, query and fragment, as a wrapping new-tab link rather than shortened or ellipsized text. Pages without a URL do not gain a placeholder link. Booth analysis disclosures keep this link visible even while closed; that adapter change also needs an approved Worker asset deployment.

Shared section-footer relocation waits for a direct decorated `.rsc-grid` before accepting `report-scores` as a footer host. Until then its direct `<div>` children are authored page rows. This prevents parallel callout/lazy relocation from being parsed as an extra performance page; the scores decorator's existing post-init scheduler then relocates authentic callout and data-source nodes idempotently.

### report-callout
Icon + text insight bar (`.neutral` and `.cta` variants). Adjacent callouts authored in the same `.block-content` use a consistent `16px` vertical gap. The staff dashboard's `.report-requests` variant is a semantic announcement with an authored status label, heading/body, and action cell: **Open report requests** is the primary internal action and **View public request form** is the secondary action. Its body documents the seller workflow and links to Digital Insights: find the customer request, generate the report, then return to the dashboard to send the customer their magic link. It stacks edge-to-edge on mobile and becomes a restrained two-column editorial banner at 1000px. Default `.rcl-bar` uses a subtle red-tinted background with no left accent border. The hero KPI strip (`.report-stats.dark > .rpt-widget-footer`) uses a transparent bar with `28px 32px` padding so it reads as inline copy below the dark stats row, not a card — other relocated section footers and CTAs keep their card treatment. The hero Brand Visibility teaser (`.section.rcl-pre-briefing`) uses `.rcl-bar--bv-hero` inside a minimal section shell. The closing `.cta` unwraps to `main > .rcl-bar.rcl-bar--bv-hero.rcl-closing-briefing`, inserted directly after the Performance insights section — no `.section` / `.block-content` / `.report-callout` wrappers. Both match Figma frame `4620:329386` — white `#fff` background + `#292929` copy on light theme, `#262626` background + white copy on dark; separate light/dark Adobe+Semrush lockups (`bv-hero-logo-light.svg` / `bv-hero-logo-dark.svg`) swap with the page theme toggle; decorative mark is Adobe red (`#EB1000`) in both themes. The decorator unwraps a sole wrapping `<p>` from the authored cell before placing the text inside `.rcl-text` — nesting a `<p>` inside `<p class="rcl-text">` is invalid HTML and the browser would split it, leaving `.rcl-text` empty (with `flex-grow:1`) and the real text in a stray sibling, breaking the bar layout. On insight pages, the hero-section `.cta` (Brand Visibility teaser) is relocated into its own `.section.rcl-pre-briefing` immediately above the "Your briefing" section; the closing `.cta` at the page bottom is left in place. Both BV banners get the **"Adobe Brand Visibility"** product name auto-hyperlinked to `https://business.adobe.com/products/brand-visibility.html` (wrapping any authored `<strong>`; idempotent — skipped if already linked). The decorator also appends a `Let's talk →` CTA (`a.rcl-cta`) **only when the authored copy has no link of its own AND the report has a recognized owner** — so an owned hero/pre-briefing teaser (which authors no CTA) gains one matching the closing banner, while the closing banner keeps its single authored CTA with no duplicate. The CTA email is owner-driven: `getBvCtaHref()` resolves the mailbox from the report's **`bv-cta-source`** (`adobe` → `eecannes@adobe.com`, `semrush` → `CannesVilla@Semrush.com`, in the `BV_CTA_EMAILS` map). **There is no default mailbox**: a report with no `bv-cta-source` (or an unrecognized value) shows **no email CTA at all** — `getBvCtaHref()` returns `null`, the hero CTA is not appended, and `retargetAuthoredCta()` *removes* the closing banner's authored mailto anchor entirely (e.g. Sydney Summit reports, which must not link to a Cannes mailbox). For an owned report, `retargetAuthoredCta()` instead rewrites the authored anchor to that owner's mailbox, so both banners show the same correct email. `getBvCtaSource()` reads `bv-cta-source` from the authored `metadata` block's **DOM cell** (present in the served HTML from the start) rather than the `<meta>` tag — the `metadata` block is the page's LAST section, so its meta tag isn't written until after the banners decorate; `getMetadata('bv-cta-source')` is only a fallback. Per-page metadata (not a client-side fetch of the central `/data/` sheet) is what reaches prospect viewers, since report pages are CUG-gated to the customer's own domain while `/data/**` is locked to adobe/semrush. To change a report's owner, set its `bv-cta-source` metadata; no code change. Both links render Adobe-red (`--rpt-red-dark`, falling back to `--color-adobe-red-dark`) in both themes.

### copy-markdown
A "Copy for AI" button that serializes the live page `main` to GitHub-flavored Markdown and writes it to the clipboard (with a `document.execCommand` fallback for non-secure contexts). `domToMarkdown(root)` (exported for tests) walks the DOM in document order — headings (`#`…), paragraphs, `ul`/`ol`, `table` (pipe tables with pipe-escaped cells), `.report-callout` (blockquote) — and recurses into containers, including `.advanced-tabs`, so hidden tab panels are still captured, while skipping `.copy-markdown`, `header`, and `footer`. Used on the internal Sales Playbook page (`/docs/sales-playbook`): one instance in the hero, one at the end. Button label comes from the authored cell (default "Copy for AI"); shows transient "Copied!" feedback for ~2s.

### docs
Zero-output theme + structure block for documentation pages. `init()` adds a `docs-page` class to `<body>`, removes the block, then (deferred to the `load` event so every later block has decorated first) runs whole-page transforms via `decoratePage()`:
- **Sticky table of contents** built from the page's section `<h2>`s, wrapped with the content in a `.docs-layout` two-column shell (`.docs-aside` + `.docs-content`). Scroll-spy (IntersectionObserver) highlights the current section; clicking smooth-scrolls. Below 1000px the TOC drops below the hero.
- **Source cards**: a provenance run (an `<h3>` followed by "How we extract it / How to frame it / Caveat" paragraphs) is restructured into a `.docs-source` card with labelled rows (the leading bold label is stripped from the prose and shown as a chip; the caveat row is tinted).
- **Monoline SVG icons**: emoji in `report-cards .rc-icon` are swapped for a consistent stroked-SVG family (keyed by the authored emoji); "Conditional" status pills get `.rc-tag-conditional` (red) while "Always" stays neutral.
- **Hero eyebrow**: a red "Internal sales playbook" eyebrow is inserted above the H1.

Its auto-loaded `docs.css` scopes **every** rule under `.docs-page`, so dropping the block onto a page restyles only that page: flat docs-style hero with hairline divider (not a card), a clear H1/H2/H3 type scale with section divider rules, 68ch prose cap, refined `report-cards` (2-up, equal-height, badges pinned to a shared baseline; `steps` rendered as a **connected vertical stepper** with a rail line), readable `table`s (fixed layout, uppercase headers, per-row hairlines), `report-callout` bars and `.docs-source` cards with a red left accent, and an outline "Copy for AI" button whose emoji is replaced with a masked SVG glyph. Light/dark aware via `light-dark()`; edge-to-edge with a 20px text gutter below 1000px. Authoring: place an empty `docs` block first on the page. The `copy-markdown` serializer skips `.docs-toc`/`nav` so the TOC isn't copied into the Markdown.

### metadata
Authored page-data block: each row becomes a `<meta>` tag (or sets `document.title` / `lang`), then the block removes itself. **Single-section reports** (e.g. insight reports) author every block — `report-hero`, `report-stats`, `report-carousel`, … plus `metadata` — inside **one** `main > div` section sharing one `.block-content`. So `init()` must NOT remove its `.section` unconditionally: it drops the `.metadata` element, then removes the `.block-content`/`.section` only when nothing else remains. Removing the section unconditionally wiped the entire report (the 18th Digitech regression after PR #73). `hidePageDataSections()` (run from `lazy.js`) is the broader cleanup for standalone page-data sections and is a no-op on single-section reports because the metadata element/markers are already gone by the lazy phase.

### report-request-form
Public, mobile-first request form. Its authoring contract is intentionally empty: customer fields are fixed in code to prevent collecting context intended for internal report generation. Required fields are full name, business email, company, website/domain, and contact consent; role/job title and primary market are optional. A secondary editorial aside links to the public FrescoPa sample at `/example-report/frescopa/`; it must never link to an authenticated customer report or use a long-lived magic link. The form adds a honeypot, obtains a Cloudflare Turnstile token using the page's `turnstile-sitekey` metadata, creates one browser-lifecycle idempotency key, and sends JSON to the canonical `https://act.aem.now/api/report-requests` endpoint. That endpoint accepts cross-origin form submissions only from the production Summit `.aem.page` and `.aem.live` delivery origins, so the form remains usable when opened directly on either official host. Browser validation mirrors the Worker but server validation remains authoritative. On success, the confirmation replaces the complete intake shell so the original form/headline cannot remain in the desktop grid. Its desktop title uses the available panel width, while every step title and description is explicitly assigned to the content grid column so text cannot collapse into the counter column. The generated request ID is internal-only for idempotency and auditing, not a support reference.

### report-requests-list
Adobe internal, responsive Sales list for `/adobe/report-requests`. It loads newest-first rows from `GET /api/report-requests`, supports a debounced text search and cursor pagination, and keeps the CSV download query synchronized with the active search. On mobile, rows use labelled records rather than a horizontally overflowing table. The page and interactive shell both link back to `/adobe/dashboard`. Because this authenticated route previously remained as raw authored markup when normal Author Kit discovery missed the block, `scripts.js` explicitly ensures the required block loads after standard page decoration. Its DA source includes a static loading fallback with dashboard navigation, so a module-loading failure cannot leave a blank page or sign-in loop. The list intentionally has no event filter, workflow status, owner, assignment, editing, or internal request-ID surface.

### header
Fetches nav content and renders the Adobe logo, site title ("Adobe Summit Portal"), a help icon button, and a dark mode toggle button (half-moon icon) on the right edge. Preference is persisted in localStorage. The actions section renders auth-aware user info from `/auth/me`: signed in → email + Sign out + My Portal; signed out → a **Sign in** link that carries `?redirect=<current path>` so re-auth returns the user to the page they were on. When the non-HttpOnly `signed_in` marker cookie is present but `/auth/me` is unauthenticated, the header shows a small **"Your session expired"** notice (`.user-session-expired`) instead of failing silently — distinguishing a lapsed session from a never-signed-in visitor.

### customer-picker
Staff-facing search/share surface with **two-level navigation** — a primary family control (**Digital Opportunity Reports** / **Accounts**) over a secondary chip row of report sets (**All reports**, **Adobe Summit 2026**, then one chip per event, **authored in DA — no code change per event**) — plus A–Z letter nav, per-format report links, and per-page sharing via `/auth/sharelink`. Data is fetched live from four DA sheets under `/data/`: `account-list.json` (Accounts), `company-list.json` (Adobe Summit 2026), `insights-list.json` (All reports + event membership), and `event-tabs.json` (which event tabs exist); CUG email domains come from `/closed-user-groups.json`.

**Two-level navigation (`buildNavModel` / `buildNav` / `resolveTabParam`, exported for tests).** The old flat strip of nine tabs made one row carry two unrelated choices — *what am I browsing* (an account directory vs. digital opportunity reports) and *which slice* (all of them vs. one event's pins) — so staff could not tell where to find an arbitrary customer's report. The primary control now picks the family; the chip row picks the slice, led by **All reports** with a hairline (`.cp-mode-chip--all::after`) separating the full catalogue from the event pins. Accounts is a single-mode family, so its chip row is hidden — its contents and behaviour are untouched (another team owns it). The picker opens on **All reports** (was Accounts). A **context line** under the chips states the size of the current slice and, on an event, always offers the way back to All reports; a matching **empty state** replaces the previously blank grid when a search finds nothing, and on an event tab carries the query across to All reports so a fruitless event search is never a dead end. `?tab=<mode-id>` deep-links a tab and is kept in sync via `replaceState`; unknown values fall back to All reports. **Mode ids are unchanged** by the redesign (`accounts`, `insights`, `portal`, and the sheet-authored event ids), so every `cp-recent-<id>` list survives and the `event-tabs.json` contract needs no new column — grouping is derivable, since every row in that sheet is an event by definition. The share form lives in `blocks/customer-picker/share-form.js`.

**Share this page — two paths (`buildShareForm`).** Both mint a one-month link that opens the page directly (no login): (1) **Email it** — staff type a recipient and the worker emails the link (`mode: 'email'`, the default); (2) **Copy link** — a full-width secondary button that calls `/auth/sharelink` with `mode: 'copy'`, which mints the link and returns `{ result: 'link', link }` **without sending any email**, then copies it to the clipboard (`navigator.clipboard`, with a hidden-textarea `execCommand` fallback) and flips to "Copied ✓". Copy mode is the recovery path when a recipient's mail gateway quarantines the APO email (e.g. `elmosoftware.com.au`) — paste the link into Slack/Teams instead. In copy mode the recipient email is optional: the worker binds the token to the staff caller's own session email (safe — `sharelink` is a non-verified method, so telemetry withholds the email regardless; access is granted by the page CUG groups baked into the token). Both paths stay staff-gated (valid session + `STAFF_DOMAINS` caller). Which customer domains a link may grant is resolved from the CUG sheet — see *Allowed domains come from the CUG sheet* under Authentication. Covered by `test/sharelink.test.js`.

**Share form also shows a copyable link.** On a successful "Send link", `/auth/sharelink` now returns `{ result: 'sent', link }` and the form reveals the one-month link in a read-only field with a **Copy** button. This is a fallback for when the recipient's mail gateway quarantines the APO email — staff can copy the link and deliver it over Slack/Teams instead. Returning the link is safe: the endpoint is staff-gated (valid session + `STAFF_DOMAINS` caller), and the same token was just emailed to that recipient. Covered by `test/sharelink.test.js`.

**Event portal tabs (`parseEventModes` / `deriveEventModes` / `buildEventCompanies`, exported for tests):** Event tabs are **content, not code**. Which tabs exist is authored in the DA sheet **`/data/event-tabs.json`**, one row per tab — `Column` (the `insights-list` column it reads, required), `Label` (tab text, defaults to `Column`), `Active` (opt-OUT: only `false`/`no`/`0`/`off`/`n` retires a tab, so a blank cell still shows it), and optional `Id` (the stable mode id behind the `cp-recent-<id>` localStorage key — pin it to keep recents across a rename; defaults to a slug of `Column`). **Row order is tab order.** Rows with no `Column`, a duplicate id, or an id colliding with a built-in mode (`accounts`/`insights`/`portal`) are dropped. **Adding an event = add a sheet row + populate the matching column in `insights-list` — no deploy.** Upstream systems that write this content have a full integration contract in [`docs/integrations/event-tabs-and-event-membership.md`](docs/integrations/event-tabs-and-event-membership.md) — DA read-modify-write semantics, publish steps, and ordering. Retiring a finished event = set `Active` to `false`, which keeps its data intact. If `event-tabs.json` is missing, unpublished, or yields no usable rows, `deriveEventModes` falls back to one tab per non-reserved `insights-list` column that has at least one non-empty cell (reserved: `Report`, `Customers`, `Folder`, `Created`, `Report Notice`), labelled by the column header — so the tabs degrade rather than disappear, but in arbitrary order, which is exactly the control the config sheet provides. Each event is still backed by one column in `insights-list.json` (Cannes 2026 → column `Cannes 2026`). A row whose event-column cell is non-empty is in that event; the cell holds the event-specific company label, and several `;`-separated names in one cell each become a card (used when two companies share one portal page, e.g. `EY; EY Studio+`). Unlike All reports (one card per website globally), event tabs build **one card per flagged row** and do NOT collapse by website — so the same company can appear in several events, and co-located companies each keep a distinct card. Cards link straight to the row's own portal-landing page. The resolved mode list drives the tab chip, search placeholder, and the dialog (event modes are website-report modes via `isReportMode`, whose id set is populated at init from the sheet, sharing the All reports dialog layout). Seeded events: **Cannes 2026** (column `Cannes 2026`) from `…/Cannes 2026/results/All-Results.xlsx` — 203 companies → 200 portal-landing rows, 3 shared-page pairs joined with `;`; **Sydney Summit 2026** (column `Sydney Summit 2026`) from `…/JAPAC Summit 2026/campaign-inputs/Summit_Sydney_Campaign_Full.xlsx` — 233 companies matched by website domain → 210 matched (205 rows, 5 shared-page pairs), 23 with no existing insight report skipped. A per-mode **Recently viewed** band (localStorage key `cp-recent-<mode>`, capped at 8, deduped by folder, newest-first) renders above the A–Z grid; entries are recorded when a company dialog opens and resolved back to the live mode list by folder (stale entries dropped). All storage access is guarded so a disabled/full localStorage degrades to "no recents" rather than breaking the picker.

**Report grouping (`groupInsightsByWebsite` + `parseInsightFolder`, both exported for tests):** DIH folders are `…/insights/<website>/[variant]/` where `<variant>` is empty (bare report), `portal-landing`, or an event id (`cannes-2026`, `summit-2026`). Cards are keyed by the **website slug GLOBALLY** (across every account folder), so each website appears **exactly once** even when filed under several accounts (e.g. `ey.com` under `ey`, `ey-studio`, and `ernst-young` → one card). Selection per website: **`portal-landing` wins** — the card links to the **most recent** portal-landing (by `Created`, format `D.MM.YYYY`) and suppresses every other variant, so a visitor from any subsidiary lands on the same canonical page. With no portal-landing, event variants render as selectable reports (most-recent per format, plus the bare report); otherwise the most recent bare report. Earlier code (a) wrongly treated the website segment as the "format" and split bare vs. portal-landing into two cards, and (b) keyed by per-account folder so the same site under different accounts showed multiple times (`ey.com` ×3). Both fixed (cards 2188 → 2072, zero duplicate display names); covered by `test/blocks/customer-picker.test.js`. Caveat: cross-account merging means the surviving card's Open/Edit links point at one account's copy — duplicate *accounts* in the source sheet are still worth cleaning up in DA, but no longer surface as duplicate report cards.

### footer
Renders copyright text and a horizontal list of legal links (Terms of use, Privacy policy, Cookie preferences, etc.). `loadFooter` awaits block decoration; on **localhost / 127.0.0.1** it skips work if the page has no `<footer>` (avoids fragment fetch noise in local AEM CLI). On other hosts it can create a `<footer>` when missing, then load the footer block.

## Authentication

### Customer QR recovery (design approved; pending live validation and deployment)

The customer login offers a public **Request a report** link before authentication. Email login reads the response's business result: only `sent` claims a link was emailed; `not_found` retains the email form and shows an accessible unavailable-report explanation plus a request CTA. A legacy `not_found` carrying an outage reason is treated as a retryable error. Mapping fetch failures or malformed payloads return a logged `503 lookup_unavailable`, not a false no-report result; mapping requests are bounded to five seconds. Failed internal no-match notifications are logged without preventing customer recovery.

Adobe ID authentication remains distinct from report availability. Failed OAuth callbacks return to `/login?reason=authentication-failed` with retry and email-login options. Authenticated portal lookup with no group mapping goes to `/request-report?reason=unavailable`; lookup outages or invalid destinations go to `/login?reason=lookup-unavailable`. Homepage `redirect=/` no longer overrides a mapped report; real report deep links still win. A permitted but missing protected account document offers report intake, while unauthorized customers still reach `/403` and unrelated public 404s retain their normal behavior.

`scripts.js` initializes the new `portal-recovery` block on `/403`, with a static fallback during module loading. It offers **Request a report**, **My Portal**, and **Sign out and use another account** without claiming the report does not exist or granting access. The request form adds an explanatory notice only for `reason=unavailable`; ordinary intake fields, Turnstile, consent, sample-report link and manual Sales follow-up remain unchanged. The existing validation-summary accent is intentionally preserved; it is not a newly introduced card treatment.

**Review mockups:** `/prototypes/qr-report-access/index.html` imports the actual changed components and styles. Its screen selector covers initial login, missing email mapping, link sent, lookup/delivery/authentication errors, access denial, contextual and ordinary request forms, confirmation, and the unchanged staff sign-in. Light/dark previews intercept all application fetches locally and never send real emails or leads. The header and outer review controls are mockup chrome, not production changes. Jose approved the design on 2026-10-05. Live phone and authentication validation remain required before merge; frontend delivery and the Cloudflare Worker require separate rollout. Nothing has been merged or deployed.

**Regression coverage:** browser unit tests cover response handling, deep links, network errors, contextual intake, and route initialization; Worker tests cover OAuth recovery, mapping failures, missing account documents, and retained authorization boundaries. `test/fixtures/qr-report-access-browser.js` exercises 12 screens, light/dark themes, and 12 viewports (320, 360, 375, 390, 393, 412, 430, landscape 844, tablet 768, breakpoint 999/1000, desktop 1440), checking overflow, field containment, 44px primary targets, input text sizing, retry and request completion. Customer wrappers explicitly fill the mobile width under both framework conventions; request inputs include padding within their declared width rather than spilling outside the form column. Chromium/Pixel and WebKit/iPhone contexts plus Firefox checks are browser automation, not proof of behavior on every physical phone. Real iPhone Safari/Android Chrome QR, keyboard, Adobe ID, email delivery and production Turnstile checks remain a release gate.

Auth is handled by the Cloudflare worker in `workers/cloudflare/cug-adobe-oauth-worker` (OAuth+PKCE via Adobe IMS, plus self-service magic links and staff-issued share links; CUG enforcement reads `x-aem-cug-*` headers from the origin). Token/session lifetimes (`src/session.js`): **magic link = 30 min** (`MAGIC_LINK_MAX_AGE`, self-service freshness); **share link = 30 days** (`SHARE_LINK_TTL`, dashboard and DA tool sharing). Session length is **per-login-type** (`sessionTtlForEmail`): a **staff** login (email domain in `STAFF_DOMAINS` = `adobe.com,semrush.com`) gets **4 days** (`EVENT_SESSION_TTL`) so an event device logged in over the weekend stays in all week; a **customer** session keeps **4 hours** (`SESSION_TTL`). Both the signed-JWT `exp` and the `auth_token` cookie `Max-Age` derive from that TTL. Applied at every mint point: OAuth callback and `?token=` magic/share-link redemption. Alongside the HttpOnly `auth_token`, the worker sets a non-HttpOnly **`signed_in` marker cookie** (`Max-Age = SESSION_TTL + 1 day`, so it outlives a timed-out session) carrying no identity/authorization — it only lets the header tell "session lapsed" from "never signed in" to show the expiry notice. The marker is set wherever a session is minted and cleared on `/auth/logout`.

### Report-request API and lead storage

`workers/cloudflare/cug-adobe-oauth-worker/src/report-requests.js` owns the lead boundary:

- `POST /api/report-requests` is public, JSON-only, size-bounded, and verifies Cloudflare Turnstile server-side. It applies a honeypot, then a best-effort 5-per-10-minute salted IP-digest KV rate limit only after a valid Turnstile challenge, and salted idempotency-key deduplication. Raw client IPs and Turnstile tokens are never persisted or logged.
- `GET /api/report-requests` and `GET /api/report-requests.csv` require `session.method === 'oauth'` and an exact `@adobe.com` email. Event-staff credentials, Semrush OAuth, magic links, and share links receive `401`/`403`, even though some can access other staff surfaces.
- Durable records are stored in the `REPORT_REQUESTS` D1 binding using `migrations/0001_report_requests.sql`: internal request ID, timestamp, submitted fields, consent version/timestamp, and search text. A D1 batch writes the request before its foreign-key-constrained idempotency mapping; if another request already owns that mapping, the provisional duplicate is removed within the same batch. Responses that contain lead information — and errors from these endpoints — send `Cache-Control: private, no-store`. CSV cells are quoted and formula-prefixed values are escaped.

The form does not generate a report or add submission telemetry. D1 is provisioned and migrated, the internal salts and `TURNSTILE_SECRET_KEY` are configured, and the managed Turnstile widget is bound to `act.aem.now`, `main--summit-portal--aemsites.aem.page`, and `main--summit-portal--aemsites.aem.live` with its public site key in DA metadata. Before production launch, establish D1 backup/recovery and obtain approval for the privacy copy, accountable data owner, and retention/deletion policy. Data is retained until that policy is approved; no automated deletion is configured.

**Why staff sessions open every customer page:** the live CUG config gates every customer page to `adobe.com, semrush.com, <customer-domain>`, so a logged-in Adobe/Semrush staff session can search the dashboard (`/adobe/dashboard`) and open any report directly, then email it to a customer with the existing **Share** button (one-month link). No per-customer links need to live on a device.

### Allowed domains come from the CUG sheet, not the origin header (`src/cugsheet.js`)

**Whether** a path is gated still comes from the origin's `x-aem-cug-required`. **Which** domains it allows is resolved from `/closed-user-groups.json` — the same sheet the DA "Protected Pages" tool (`tools/cug/cug.js`) reads — for paths under **`/accounts/`**; everywhere else the `x-aem-cug-groups` header still decides. Both `checkCugAccess` (page access) and `/auth/sharelink` (grant scoping) read it, so a minted link always matches what redemption will enforce.

**`cug-login-path` column** (SITES-47399): an optional sheet column carrying an authorable login path/URL per row (an authored EDS page or an external IdP URL). "Apply Page Access" emits it as `x-aem-cug-login-path` alongside `x-aem-cug-required`/`x-aem-cug-groups`, for a *custom* edge worker to redirect on without a pre-auth lookup — this repo's own worker doesn't consume it (its unauthenticated redirect is always the fixed `/login`), it only strips the header before the response reaches the browser, same as the other two.

**Scope is deliberately narrow.** Only the account namespace, which DIH creates and maintains, is automated — there, a wrong row can at worst expose one customer's own report folder. The other paths the sheet covers are internal surfaces (`/adobe**` the staff dashboard, `/data/**`, `/customers/**`, `/insights**`) and stay on the manually-applied header, so opening one still takes a deliberate human step. This matters because the automation removes a checkpoint: before, a sheet edit did nothing until someone ran the DA tool; now an account row is live within one cache TTL, unreviewed. Every 4,417 insight reports live under `/accounts/`, so the restriction costs nothing today.

**Why:** the header is served from the AEM Config Service, which is *only* written when a human clicks **Apply Page Access** in that DA tool, while DIH appends and publishes a sheet row for every account it generates. Between two clicks, new accounts fall through to the catch-all `/accounts**` row and look staff-only at the edge: the customer 403s on their own report and copy-mode sharing fails with "Page has no customer group to share". Observed 2026-08-03: the last apply had run mid-day 29 Jul, leaving 165 accounts (sheet rows 3992+, including `freshpet`) stale. Reading the sheet closes that window — a row is live within one cache TTL of publication, with no button to press.

**Safety properties.** The sheet can only narrow to the groups it names; it never makes a gated page public (`cug-required` is untouched) and is never consulted for public or session-less requests. Rows with blank `cug-groups` are skipped, exactly as the DA tool skips them, so they can't shadow a broader row. Matching mirrors the Config Service: trailing `*`/`**` is a prefix glob, everything else is exact, most specific wins. Any failure returns `null` and leaves the header in charge; resolution never throws. Note the header is a fallback for the *sheet being unavailable*, not a per-path one: the catch-all `/accounts**` row always matches, so inside the scope the sheet decides whenever it loaded at all.

**Cache and timing.** Cached per isolate for **5 min**, keyed by `ORIGIN_HOSTNAME`, on top of a 300s edge cache; a whole load (all pages) shares one **3s** deadline; failures back off for **60s** whether or not a stale copy survived, so an origin outage can't make every request re-attempt. **Stale-if-error** keeps the last good copy rather than dropping customers back to the staff-only header. The cost of that resilience is revocation lag: removing a domain from a row takes up to ~**10 min** to bite (isolate TTL + edge cache), and longer while the origin is failing — for an urgent revoke, edit the row *and* redeploy the worker. Loading and parsing the 4,157-row sheet measures ~3 ms once per isolate; matching is ~0.1 ms per request. Covered by `test/cugsheet.test.js`, plus sheet-vs-header cases in `test/cug.test.js` and `test/sharelink.test.js`.

The Config Service still needs an occasional apply for `cug-required` on genuinely new path *shapes* (existing static rules like `/accounts**` already cover every account), and accounts missing a sheet row entirely (e.g. `charter-hall`) still resolve to staff-only — that's a DIH-side data gap, not a config one.

### On-site event access (generic staff login)
This describes an ordinary, unmarked staff browser. On a kiosk-marked browser,
the same login issues only booth-scoped credentials; entering `/booth` also
migrates an existing broad staff session. The touchscreen cannot be reused as
a staff dashboard by navigating, signing out or logging in again.

For non-managed event iPads that can't do Adobe SSO/Okta, `POST /auth/staff-login` (`src/stafflogin.js`) takes `{ username, password }`, verifies it against the **`EVENT_STAFF_CREDENTIALS`** worker secret, and mints a full 4-day staff session (`groups: ['adobe.com','semrush.com']` → opens every customer page; the synthetic `<username>@adobe.com` identity also passes the share-link staff gate). The login UI exposes it as a de-emphasized **"Event staff access"** form in the `portal-login` block, below the Adobe-ID and magic-link options. The credential secret is a newline/comma list of `username:sha256hex(password)` pairs — set it with `wrangler secret put EVENT_STAFF_CREDENTIALS --env summit` (never commit it). **Kill switch:** generic-login tokens carry a `gen_epoch` claim equal to the `EVENT_CRED_EPOCH` var; bumping `EVENT_CRED_EPOCH` (in `wrangler.toml`, then redeploy) instantly revokes every generic session (real-staff OAuth/magic-link sessions carry no `gen_epoch` and are unaffected). After the event, rotate the password and/or bump the epoch.

## Telemetry & report-view attribution

Engagement is tracked with **Simple Analytics** (`window.sa_event`, loaded in `head.html`) plus Adobe **RUM** for performance. Insight pages mount `scripts/utils/insights-tracking.js` (events: `insights_pageview`, `insights_scroll_depth` at 25/50/75/100%, `insights_download_click`, `insights_cta_click`, `insights_section_view`) and `insights-feedback.js` (thumbs up/down + tags).

**Who viewed a report.** Each session records the login method it was minted from (`session.method` in the JWT — `oauth` | `staff` | `magiclink` | `sharelink`; set at every mint point in `src/index.js`/`stafflogin.js`). `/auth/me` returns that `method`. Client telemetry resolves it once via `scripts/utils/viewer-identity.js` and merges only `auth_method` into every event — **the viewer's email is never sent to Simple Analytics**, verified login or not. SA is used without a consent banner on the premise that events stay anonymous; attaching an email would identify a named individual and require consent we don't collect. (A short-lived PR briefly attached `viewer_email` for verified logins — reverted per legal/privacy review, see `fix/telemetry-drop-viewer-email`.) Identity resolution never throws and is time-capped (2s) so a slow auth endpoint can't block tracking.

Note: `/auth/me` runs in the Cloudflare worker, so `auth_method` attribution is only live behind the worker (not the bare `aem-cli` localhost preview, where it degrades to anonymous).

## Design Tokens

Global tokens defined in `styles/styles.css` with `light-dark()` for automatic dark mode. Report blocks alias them via `--rpt-*` tokens:

| Report Token | Purpose |
|---|---|
| `--rpt-surface` | Block backgrounds |
| `--rpt-border` | Card borders |
| `--rpt-text` | Primary text color |
| `--rpt-text-body` | Body/description copy (`#292929` / `#ccc`) |
| `--rpt-text-secondary` | Secondary text |
| `--rpt-text-muted` | Muted text |
| `--rpt-red` | Adobe red (`#e60000`) |

## Responsive Design

- **Breakpoint**: 1000px (mobile-first)
- **Desktop (>=1000px)**: Centered blocks, max-width 1200px, 24px side padding, 16px rounded corners
- **Mobile (<1000px)**: Edge-to-edge, no side padding, no rounded corners

### Insight pages — mobile polish
- Section spacing on insight pages collapses to `gap: 8px` with `padding: 0 0 8px` on `main` so the hero is flush against the header (no top gap) while subsequent sections sit 8px apart.
- Hero website badge (`.rh-insight-badge`) keeps the desktop white-pill styling on mobile (no dark-transparent override).
- Dark KPI strip (`.report-stats.dark .rs-dark-strip`) is a single solid-black surface on mobile — no 1px dividers between the 4 cells.
- Dark KPI strip's scroll-hint chevron + 36px bottom padding only apply when there is no `.rpt-widget-footer` callout below the grid (`:not(:has(.rpt-widget-footer))`) so the at-a-glance callout doesn't have empty space below it.
- Widget title bars unify across blocks: `.rai-section-head-strip` matches `.rav-section-head` at `(width < 768px)` — `min-height: 56px`, `padding: 10px 16px`, `font-size: 16px / 600`. "Your briefing" / "Search performance" read as peers of "LLM visibility" / "Performance insights".
- `.report-ai-visibility .rav-stats` uses `repeat(2, 1fr)` at every width (was 3-up base + 3-up `<768px`). LLM visibility's two stats sit at 50/50; tablet rule already used 2 columns.

## Remaining Work

### Polish
- Footer styling could be improved (currently uses default list rendering)
- Header nav sections are hidden (`display: none`) — could show on desktop
- Accessibility: Chart SVGs need better `aria-label` descriptions

### Potential Enhancements
- Report-carousel: Slide transition animations could be smoother
- Performance: Images in content/ are not optimized
