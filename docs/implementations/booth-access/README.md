# Reusable booth access

> Status: Implementation authorized for the October 1 demo; scope revised below
>
> Source: [`docs/universal-booth-access.html`](../../universal-booth-access.html)
>
> Created: 2026-09-24

## October 1 implementation decision

José authorized implementing the current design and creating a PR for a working
booth prototype. The lookup contract supersedes the roster-based proposal below:
use existing customer CUG email-domain permissions to discover prepared reports,
without an event roster or event binding. One authorized report opens directly;
multiple authorized reports require an explicit report picker. Do not guess a
website from an email domain, expose the staff report catalogue to visitors, or
grant staff domains customer-wide lookup.

Keep the kiosk staff-authenticated and derive recipient/report state on the
Worker. Entering an email is identification, not authentication. Reuse existing
staff share-link delivery and its seven-day, domain-scoped access policy; do not
claim a new report-exclusive grant or change normal login. Sales handoff remains
informational. Private-roster provisioning and new report-token infrastructure
in the historical task plan are not prerequisites for this revised prototype.

Publishing `/booth`, deploying the Worker, merging code, and approving event
rollout are separate steps. Record their actual status rather than treating a
PR or mockup as a live deployment.

## Objective

At an event, attract a registered attendee to the reusable **`https://act.aem.now/booth`** touchscreen page, have them enter their registration email, open the **existing prepared portal-landing page directly**, and return from that report to a Finish view that emails the report link to the same registration address. The current concept makes the on-site sales conversation more prominent, but does not book meetings. Keep the current portal entry/login flow for ordinary visitors.

## Success criteria

1. Every attendee in the approved event roster has either exactly one checked report assignment or a visible preparation exception before doors open. No guessed website search or fallback to another company's report.
2. The kiosk works at one reusable `/booth` URL with an existing staff login, without a badge reader, custom event landing page, or a requirement that an expert verify the attendee's identity.
3. A booth-only Finish control on the actual report returns to the **same reusable booth page**. The only attendee action there is **Email my report**, which sends the prepared report link to the registration address used for lookup. Sales and later 1:1s are non-interactive guidance; **Done** clears the attendee's visible state.
4. No roster emails, report mappings, credentials or signed links are published in the site's client-side HTML/JSON, source control or analytics.
5. The welcome page, actual report with its Finish control, and Finish view work without horizontal overflow on the supplied 40-inch portrait screen (up to 2160 x 3840), with touch targets, keyboard support and a tested reset path.

## Scope

**In:** registration-email lookup, private event roster/report mapping, reusable booth welcome/Finish UI, a booth-only return control on existing report pages, report email to the matched registration address, non-interactive sales guidance, configured Adobe/Semrush presentation, portrait report readiness, event rehearsal and runbook.

**Out:** QR scanner integration, five-digit codes, arbitrary company search, badge printing, clickable sales or booking controls without a defined owner/process, automatic CRM booking, new report generation, a different site per event, changes to existing customer login for non-event visitors, and import scripts for authored site content.

## Read order

1. [`AGENTS.md`](../../../AGENTS.md) and [`PROJECT.md`](../../../PROJECT.md).
2. [`../AGENT-GUIDELINES.md`](../AGENT-GUIDELINES.md).
3. This README and the [shared booth brief](../../universal-booth-access.html).
4. [`context/current-state.md`](context/current-state.md), then [`context/target-design.md`](context/target-design.md).
5. [`design/experience.md`](design/experience.md).
6. [`roadmap.md`](roadmap.md) and [`tracker.md`](tracker.md).
7. The assigned task file.

## Architecture in one sentence

At `/booth`, an existing staff login authorizes a staff-only event selection, which persists on the locked-down kiosk. Each attendee lookup creates a separate short-lived context and sends the browser directly to the approved report page. A conditional report-page control returns to Finish on `/booth`; the Worker handles a recipient-bound report email while existing CUG still protects reports.

This is a **proposal**, not a claim that the current Worker already supports it. The roster store, email token design and brand configuration need owners and sign-off before implementation. Sales and booking workflows can be defined separately.

## Decisions and risks

| Topic | Current direction | Boundary / risk |
|---|---|---|
| Booth URL | **Confirmed by José:** one evergreen `https://act.aem.now/booth`, with existing entry/login unchanged. Event setup may use `/booth?event=<id>` once, then return to a clean `/booth` URL. For unmanaged devices, the operator can bookmark the existing `/login?staff&redirect=<encoded booth URL>` flow. | `<id>` identifies an event; it is not an access credential. Gate `/booth` to staff in the existing CUG configuration, require staff auth for setup/lookup, and lock the browser before attendees use it. |
| Attendee identity | Email match opens a report on a staff-authenticated booth device; the expert may check the badge, but verification is not required. | Anyone who knows an enrolled email at an unattended kiosk might see that company's report. This is **not** attendee authentication. Event/privacy owners must accept or change this before rollout. |
| Existing staff access | Reuse `/login?staff` and the Worker session; never ship staff credentials to the page. | The staff session can access all customer reports. Lock the browser to the booth experience and rehearse back-navigation and inactivity; a UI reset is not a security boundary. |
| Report-to-Finish | Load a small Finish control only on the approved report path while a valid booth context exists. Return to the same reusable booth page, not an event-specific page. | The report is a separate DA page. The control must survive navigation and keep Finish reachable without exposing the attendee's email in the URL or client storage. |
| Roster | Private Worker-side event-to-email-to-report map, separate from the public report index. | Do not publish registration PII in DA `/data/` or checked-in JSON. Confirm who can provision, correct and delete event records. |
| Report email | Send only to the matched registration address; use a report-scoped link design. | Today's `/auth/sharelink` is staff-only, lasts seven days, rejects recipients whose domain is not allowed, and grants domain-based CUG access. It cannot simply be repurposed as an unrestricted month-long event link. |
| Branding | **Adobe Brand Visibility** is the product name on both modes. Event configuration chooses Adobe-only or Adobe/Semrush co-branded booth chrome using existing approved assets. | Existing `cobrand` styles imply a Cannes-specific theme. Do not recolor all reports or rename the product to suit an event; brand-owner review remains necessary. |
| Sales | José confirmed that "Speak with sales here" and "Schedule a 1:1" are **guidance, not buttons** in the current design. | There is no agreed booking destination, staffing handoff or CRM integration. Do not make these paths implementation gates or pretend the UI has actions until owners define them. |
| Feedback on the mockups (Sept 29) | The Entry needs an event-worthy attract moment; the example screenshot and product QR compete with lookup. The Finish should feel like a reward and give human handoff more visual prominence. The [local design preview](design/booth-preview.html) now illustrates this direction **for review**, not as approved production UI. | "Your AI visibility score, in 60 seconds" is not a supported promise: reports are prepared in advance, and a score or completion time is not guaranteed. A direct booking action remains contingent on a real sales workflow. The separate product QR asset remains available for physical signage. |
| Deadline | First cited event: October 13; prior request: finalized two weeks earlier (September 29). | As of September 24, this leaves roughly five days for a production-ready cut. Confirm which gates can actually be met before committing to that date. |

## Decisions to confirm with owners

- **Privacy/event owner:** explicitly accept email-only report access on the staff kiosk, or require a stronger gate.
- **Event team:** final roster format, correction deadline, branding mode, staff-only event setup/bookmark, screen browser and network. Name who handles a live Adobe specialist introduction, whether there is on-site availability, and the fallback when nobody is free before turning the guidance into an action. Booking mechanics remain optional follow-up work.
- **Adobe brand/content owner:** approve the revised attract motion/headline, any real search snippets or customer logos before use, and placement/copy for a separate product-page QR sign.
- **Engineering owner:** approved private roster store and provisioning path; report-bound email link lifetime and whether personal registration addresses can receive them.
- **Report/content owner:** which existing portal landing pages demonstrate portrait layout and whether their branding can change at runtime.

No live roster, tokens or production worker changes are part of this planning phase.

## Files in this project

- `context/`: grounded current state and proposed target contracts.
- `design/experience.md`: screen states, copy and portrait design requirements; [`design/booth-preview.html`](design/booth-preview.html) is a local clickable review mockup, and [`design/touchscreen-review.html`](design/touchscreen-review.html) is its scaled portrait Chrome review window. Those source files depend on one another and on repository logos, so **do not send the reviewer HTML alone**. Run `node docs/implementations/booth-access/design/export-touchscreen-review.mjs <destination.html>` to create a single shareable file containing the reviewer, both screens and embedded logos. Adobe Clean loads from Typekit when online; the file remains functional with a system-font fallback offline. Neither file is a production page.
- `roadmap.md`: dependencies and gates.
- `tracker.md`: task status.
- `tasks/`: implementation-ready slices, pending the explicit decisions above.
