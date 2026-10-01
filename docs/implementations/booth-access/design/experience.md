# Experience design: first pass

The shared brief contains the overview for managers and event teams. This file defines the screen behavior needed to implement and review the design, without claiming the illustrated screens already work.

The [local design preview](booth-preview.html) shows the **two new surfaces** at the single reusable `/booth` URL: welcome and Finish. Enter `jordan@northstar.com` to see how a successful lookup would hand off to the existing report; it deliberately stays on the preview instead of navigating or sending email. The real report lives on its existing portal-landing URL between the two surfaces. The Adobe/Semrush selector and screen switcher are for design review only, not attendee-facing event controls.

For interactive review on a laptop, open the [touchscreen review window](touchscreen-review.html) directly in Chrome. Its **default is the event target, 2160 × 3840 CSS pixels**; 1080 × 1920 is a fallback check, not the design target. The reviewer scales the portrait frame to fit a laptop, which makes its type look smaller than it is at native size. "Inspect larger" fills the width and allows vertical scrolling without changing the iframe's CSS viewport. The physical display resolution does not by itself establish the browser's CSS viewport: confirm the event device's OS/browser scaling before approving readability.

The source reviewer loads `booth-preview.html` in an iframe and uses repository icons. For a handoff outside this checkout, use `node docs/implementations/booth-access/design/export-touchscreen-review.mjs <destination.html>` and share **only the generated file**, not the original reviewer. The generated file embeds the full preview, controls, Adobe mark and optional Semrush mark; it does not require the source directory or a local server. The Typekit Adobe Clean stylesheet remains optional and needs internet; without it, the browser uses the existing system-font fallback. The report lookup and email interactions remain illustrative.

Visual direction for the **review concept**: a question-led Adobe booth activation, not a login page or a fake report. The product name at the top is always **Adobe Brand Visibility**. Use the repo's Adobe icon, Adobe Clean from the site's existing font kit, a white canvas, dark charcoal attract surface and Adobe red (`#EB1000`) for emphasis and the main action. In portrait, "Is your brand visible in AI search?" attracts from a distance; an illustrative orbit supplies restrained ambient motion without displaying invented search results or implying a live scan. A visible Pause motion control and reduced-motion behavior keep the field usable. A separate large registration-email area stays central. The alternate presentation adds the Semrush partner mark; it does **not** rename the Adobe product or recolor the report. Final mark and motion treatment need brand-owner review.

The public [Frescopa example](https://act.aem.now/example-report/frescopa/) and the existing static product-page QR asset are **not on either attendee screen** in this concept. They are optional resources for a staffed demonstration and separate booth signage, respectively, pending approval and a kiosk-safe return path for any public example link. Do not represent illustrative visuals as live customer results.

The existing portal token is `#e60000` (`styles/styles.css`), while the Adobe reference used for this design preview specifies `#EB1000`. Resolve that local booth-token difference with the brand owner during implementation; do not globally recolor existing reports as part of the booth task. The site's current Typekit kit includes Adobe Clean 400/700 but not the heavier Black weight, so the preview uses approved Bold (700) rather than synthesizing a missing face. One type family is intentional here.

## Flow at the display

| State | Primary copy/action | Secondary behavior |
|---|---|---|
| Staff setup | Operator opens `/booth?event=<event-id>` and signs in with existing staff login if needed | Server validates and binds the event, then redirects to clean `/booth` before attendees use it. No per-event page; the event ID in the bookmark is not a password. |
| Attract | "Is your brand visible in AI search?" / "Open your prepared report" | An illustrative moving signal gives the screen presence before interaction; Pause motion, input focus and reduced-motion settings stop movement. No live search, score or 60-second turnaround is promised. |
| Email entry | Email keyboard, large labeled field, "View my report" | Trim and normalize; submit with touch or Enter; a valid match goes directly to the existing report URL. Never suggest another person's address. |
| Looking up | "Finding your report…" | Disable repeat requests until response; allow retry on a real network error. |
| No match | "We couldn't find a prepared report for that email. Please check the email you registered with or ask the booth team." | Do not reveal whether an account exists, offer a public company search, or silently pick a report. |
| Existing report | Real portal-landing page + persistent, unambiguous "Finish" control | Navigate only to the server-approved path. Conditionally inject a small booth control after page load on that path; it returns to Finish on the booth page. No fake report screen or per-report DA edits. |
| Finish | **Email my report** and **Finish and clear this screen** are the only attendee controls. A prominent non-interactive panel invites a conversation with an Adobe specialist through the booth team and mentions a possible follow-up. | The booth page restores a short-lived server-side context, not an email from the URL. Email sends the link to the exact registration address used for lookup; no alternate recipient, sales action or booking destination is supplied by the browser. A direct sales or booking control is a separate decision requiring an owner, availability and a real handoff/fallback. |
| Reset | Clear current attendee context and return to the attract state | Idle timeout and device/browser history behavior need hardware rehearsal; no blanket "session cleared" claim while staff remains signed in. |

## Layout intent

- Compose for the **2160 × 3840 event target first**, not as an enlarged 1080px page. The question-led attract area and separate email action occupy the portrait canvas, with 68px field text in a 174px-high field and a 60px primary-action label. Confirm physical readability and touch reach on the real screen rather than treating laptop fit-to-window as proof.
- Make the registration field and red action unmistakable despite the animated attract area. Motion is illustrative, subtle, pausable and stopped during email focus; it must not simulate report generation, show unapproved logos or cycle unverifiable search results. Preserve contrast and static comprehension with motion reduced or disabled.
- Do not put the Frescopa public example or product-site QR in the Entry view. A separate booth sign can use the QR to `https://business.adobe.com/products/brand-visibility.html` with an explicit **Adobe product page** label. This is not badge scanning or attendee report access. A public example on the attendee kiosk would require a safe return path before enabling it.
- The Finish screen uses an optimistic editorial handoff without claiming the report has been emailed before the user taps. The email action remains primary; a visually prominent, non-clickable Adobe-team handoff is secondary. Reset remains available to attendees and staff, visually quiet but never operator-only or hidden.
- Keep rounded surfaces and controls restrained. Avoid a collage of report snippets, fake scores, unapproved customer logos or additional calls to action competing with email entry/delivery.
- One primary action per step, with an obvious way to back out. Keep touch targets at least 44 x 44 CSS pixels and avoid hover-only interactions.
- Design for portrait first. Place the attract heading near the top with the form below it, then rehearse touch reachability with the real browser's on-screen keyboard visible.
- Support keyboard and screen reader operation; label inputs and announce lookup/send results without relying only on color.
- Keep attendee email off the idle screen, final thank-you screen and browser URL. Never put it in page analytics.
- Adobe-only versus Adobe/Semrush co-branded mode changes the partner lockup, not the product name or layout. Use approved existing brand assets rather than drawing a new logo.

## Interaction questions for design review

1. Confirm the report opens in the same tab, with a conditional booth-only Finish control. Test cookie context, browser Back and the control's position on the actual report.
2. Before adding any sales or booking control in a later phase, confirm the named on-site owner, availability and fallback if nobody is free, booking destination, consent/data capture and who follows up. Until then the panel remains clear non-interactive guidance rather than a simulated CTA.
3. "Email my report" runs only on deliberate tap. Do not send without intent.
4. Does the shared report link need to last about a month as discussed earlier? Confirm against the security/revocation policy before the UI promises a duration.

## Review evidence

Use a real prepared sample report (not customer PII) at **2160 x 3840 first**; use 1080 x 1920 as a fallback check only. Capture idle Entry (including pause and reduced-motion states), onscreen keyboard, real report with Finish control, Finish view, no-match, send-failure and reset states. Verify the event browser's actual CSS viewport, no horizontal overflow or clipped actions, scanability of separate signage, and check that returning for the next attendee never exposes the previous attendee's visible context. User-test at a realistic standing distance: can an attendee identify the next action within a few seconds, enter an email without motion competing, distinguish a product-page QR from a report link, and clear the screen after finishing?
