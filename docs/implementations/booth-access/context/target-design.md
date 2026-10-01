# Target design (proposed)

## Service boundaries

| Surface | Proposed responsibility | Files / system |
|---|---|---|
| EDS booth page | Event-neutral welcome, Finish view and error states at `https://act.aem.now/booth` | New `blocks/booth-access/booth-access.js` and `.css`; **one** authored DA page, not one per event |
| Report-page helper | A booth-only Finish control on the existing report, with a link back to the booth page | `scripts/lazy.js` conditionally loads a small `scripts/utils/booth-return.js` and scoped CSS |
| Cloudflare Worker | Staff-only lookup and delivery APIs, private event configuration, short-lived booth context, report-path validation | `workers/cloudflare/cug-adobe-oauth-worker/src/booth.js`, `src/index.js`, Worker config/tests |
| Private event roster | Lookup by event ID and normalized registration email; report path, status, brand mode; no PII in served JSON | Dedicated Worker-side store, pending provisioning decision |
| Existing reports | Render an approved portal-landing page behind CUG and scale appropriately in portrait | DA report content, relevant scoped report block CSS |
| Mail | Deliver access only to the registration address; reject an unassigned or wrong-company send | Existing notification service with a **new report-scoped** grant contract |
| Event operations | Supply and reconcile the final roster and event configuration; staff login, screen and human sales handoff | Runbook and approved private provisioning process |

## Experience states

`staff opens /booth -> existing staff login (if needed) -> event setup -> welcome -> lookup -> existing report -> Finish on /booth -> cleared -> welcome`

- **Staff setup:** protect the single `/booth` page with a staff-only CUG rule. Before handing over the touchscreen, an operator opens `/booth?event=<event-id>` and signs in if needed. On unmanaged devices, explicitly bookmark `/login?staff&redirect=<encoded /booth?event=...>` because the ordinary CUG redirect to `/login` does **not** add the `staff` flag; managed staff can use their existing Adobe ID path. A staff-only Worker endpoint validates the event ID, records or signs a **device event binding** (separate from an attendee visit) and sends the browser to clean `/booth`. The binding cannot outlive the staff login or the event. The query value is a selector, **not** authorization; hide browser navigation/setup from attendees in kiosk mode.
- **Welcome:** event-neutral question-led attract design with illustrative, pausable motion and an explicit "email used to register" label; no company search or auto-complete. The local concept removes the public-example image/link and Adobe product-page QR from the attendee Entry; those assets can be used by staff or on separate signage after review, never as a competing access path.
- **Lookup:** normalize and match a whole email against an active event's private approved roster. UI shows a neutral no-match message with an expert-help path; no directory or other-company suggestions. A unique match **navigates directly** to its existing portal-landing path. There is no company confirmation or reconstructed report screen. Resolve duplicates before activation.
- **Existing report:** the real DA report opens on the same origin using the staff session. Use the canonical trailing-slash account path (`src/index.js:117-125` redirects extension-less account paths). Only in an active booth context for that exact report, conditionally add a visible "Finish" control via `scripts/lazy.js` and a dedicated helper. No per-report editing, iframe or QR reader.
- **Finish:** the control returns to the **same reusable `/booth` page** (for example `/booth?step=finish`, with no email/path in the URL). The page re-reads a short-lived server-side attendee context. **Email my report** is the primary action: a deliberate tap asks the Worker to send the matched report link to the registration email stored in that context. Make an in-person Adobe-team introduction visually prominent without presenting it as a functional booking control. Keep reset available but visually quiet. Sales/1:1 guidance becomes an action only after the event team defines an owner, availability, fallback and a destination; send success and error states must be explicit.
- **Cleared:** "Done" clears only the short-lived **attendee** context and visible state, then returns to the welcome view. The staff-selected device event binding remains for the next attendee. An idle timeout should also leave the report and clear the attendee context. Browser back/history and the staff session require device-level safeguards; front-end reset alone is not a security guarantee.

## Proposed API contracts

Do not implement until privacy and operations review the access model. Shapes illustrate ownership, not a final API commitment.

| Endpoint | Input | Output | Rules |
|---|---|---|---|
| `POST /auth/booth/select` | `{ eventId }` during operator setup | Binds the active event and redirects/returns to clean `/booth` | Existing staff session required; validate an active event; signed/opaque HttpOnly binding expires no later than the staff session. Event ID is not a password. |
| `GET /auth/booth/config` | Authenticated booth device with staff-selected event binding | `{ presentation }` | Staff session required; only approved, active event config is returned; no attendee email data or unconfirmed booking URL. Event selection persists across attendees but cannot outlive the staff session. |
| `POST /auth/booth/lookup` | `{ email }` | `{ reportPath }` plus a short-lived HttpOnly booth-context cookie, or a neutral not-found response | Staff session and **bound active event** required; exact normalized email; response `Cache-Control: private, no-store`; rate limit; path must come from approved roster, never client-supplied. Client navigates to the path; no second screen. |
| `GET /auth/booth/context` | Staff session + booth-context cookie | Minimal active/report-path match for the report helper, or active Finish state for the booth page | Validate both cookies and expiry; only show a Finish control on the exact approved report path; never return the roster email to report JS. |
| `POST /auth/booth/send` | No recipient or report path in the request | `{ result: "sent" }` | Re-read the bound context and server-side match; **recipient is the matched registration email**, not editable on kiosk. Duplicate sends controlled. No token, report path or email echoed to anonymous clients/analytics. |
| `POST /auth/booth/done` | No attendee data | Clears short-lived attendee context only | Returns to welcome for the next attendee in the same event; does **not** invalidate staff login, event selection or browser history. |
| Event configuration | `id`, `status`, `presentation`, expiry | Rendered presentation and routing | An allowlisted, event-scoped configuration rather than one new page per event. Add a booking destination only in a separate agreed change. |

Private roster record proposal: `eventId + normalizedEmail -> { name, company, reportPath, status }`. Validate email syntax, duplicate email assignments, missing report paths, CUG coverage, inactive events and revocations before publishing. Use paths under approved report namespaces, not user-provided URLs. Keep imports, changes and deletion behind a controlled operational route, **not** a checked-in or public DA sheet. Decide how staff select the event and how that selection is bound to the device without making a user-editable event ID an authorization boundary. Retention and an approved bulk-provisioning workflow are still open.

## Report access and delivery

The kiosk already has a staff session; it must **not** return a staff cookie/token in JavaScript or use email to mint a broad staff session. Keep two separate HttpOnly contexts bound to that session: a staff-selected event binding that survives between attendees, and a short-lived attendee context with the exact approved report path that is cleared on Done. An email match is not proof of identity. An unattended user who knows an enrolled address may see that report on the kiosk: this is a consciously requested UX tradeoff, subject to owner acceptance. Limit access by event/approved roster, harden the browser, and keep a human nearby; none of those changes turns email knowledge into authentication.

Sending a reusable report link to a phone needs a separate grant design. Existing `/auth/sharelink` requires a customer-domain email, is valid seven days, and mints a domain grant rather than a single-path grant (`sharelink.js:170-218`; `session.js:229-242`). Proposed: an event-purpose signed link valid for the approved revisit window (previous discussion suggested ~30 days), bound to the event, **exact report path and intended registered email**, with verification and CUG enforcement on redemption so it cannot open any other report. Do not globally extend all share links. A recipient who receives the link may forward it; decide with privacy owners whether bearer links are acceptable, how they are revoked, and whether email re-verification is needed. Use existing mail infrastructure for sending, but verify its template is provisioned before event rehearsal.

## Branding and layout

One booth UI supports `adobe` and `semrush` presentation modes, using existing approved assets. Avoid hardcoded event names/dates and avoid applying the Cannes `:has(.cobrand)` page theme to unrelated reports. Treat authored report branding separately from kiosk chrome; event selection alone must not silently restyle customer report content. Review at **2160 x 3840 first**, then 1080 x 1920 fallback, mobile and desktop; confirm the device's actual CSS viewport on site. Attract motion must be pausable and respect reduced-motion preferences. Preserve responsive report charts/carousels and visible navigation. The product-page QR is a separate-signage option, not part of the proposed Entry screen.

## Migration and rollout

1. Approve the risk and contracts; choose a private roster store and a report-link policy. Do not publish roster data yet.
2. Implement isolated Worker APIs and tests without changing existing login/share-link behavior.
3. Publish **one** DA-authored `/booth` page with a reusable block; validate staff setup through its event bookmark and the existing login flow using sample records only. Keep the root portal/login unchanged.
4. Test known/missing/duplicate emails, wrong-event mapping, token replay/expiry/revocation, mail failures and kiosk reset. Exercise the real report on the final display/browser.
5. Load the actual roster through the approved private operations path; audit gaps and rehearse on site. Keep a way to disable an event quickly.

## Open gates

| Gate | Owner decision needed |
|---|---|
| Email-only access | Written event/privacy acceptance of report visibility for anyone who knows an enrolled email at the booth. |
| Private roster | Chosen store, approved provisioning/reconciliation workflow and retention/deletion date. |
| Report link | Duration, forwarding/revocation policy, personal-email policy and whether email verification is required. |
| Branding | Assets and scope: booth UI only, or specific report variants as well. |
| Follow-up | **Not a core blocker.** Define an owner and process before turning static sales/1:1 guidance into buttons or adding a scheduling URL. |
| Hardware | Browser runtime, kiosk lockdown, touch keyboard, internet, timed reset and portrait testing. |
