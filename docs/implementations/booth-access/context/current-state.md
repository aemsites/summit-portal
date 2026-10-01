# Current state

## What already works

The portal is an EDS site that runs `scripts/ak.js`; its pages are primarily authored in DA and are **not** stored under a local `content/` directory in this checkout. `scripts/scripts.js:1-4,32-33` loads page areas. The site's Worker at `workers/cloudflare/cug-adobe-oauth-worker/src/index.js:95-161,295-297` owns authentication routes and proxies other requests to the origin before applying CUG access checks.

Staff can sign in on an event device via `/login?staff` (`blocks/portal-login/portal-login.js:96-119,207-232`; `src/stafflogin.js:39-86`). That mints a four-day staff session, capable of viewing every customer page (`PROJECT.md:101-106,123-128`). `/adobe/dashboard` uses `blocks/customer-picker/customer-picker.js:852-929` to list prepared reports from the DA sheets. Its event tabs are authored from `/data/event-tabs.json`, and event membership lives in columns of `/data/insights-list.json` (`customer-picker.js:114-145,384-402`).

Staff can email or copy a page link via the dashboard's `blocks/customer-picker/share-form.js:18-41,77-156`. `/auth/sharelink` (`src/sharelink.js:58-118,170-266`) requires a staff session; an emailed grant must match the page's customer CUG domain. A share token lasts **seven days** (`src/session.js:14,229-242`). The self-service email login is a separate magic-link flow (`blocks/portal-login/portal-login.js:1-91`, `src/magiclink.js:119-165`) and does not search an event attendee roster.

The Worker checks CUG-required origin headers, with a private sheet-driven group override for account pages (`src/cug.js:26-88`). Staff sessions include staff groups, so merely opening a page by path from a logged-in booth browser succeeds. `blocks/cobrand/cobrand.js:1-28` supplies an Adobe/Semrush lockup; its CSS also makes the presence of that block a **Cannes-specific page theme** (`blocks/cobrand/cobrand.css:1-7,63-101`).

## Boundaries and gaps

| Concern | Existing source | Gap for booth |
|---|---|---|
| Public welcome / login | `blocks/portal-login/portal-login.js` | No attractive event-neutral email lookup experience that matches a registration row. |
| Report discovery | `blocks/customer-picker/customer-picker.js` | Staff dashboard searches reports/companies, not attendees; its `/data/` sheets are not a safe place to expose private registration emails. |
| Event associations | `/data/event-tabs.json`, `/data/insights-list.json` | Report membership by event is not an attendee-to-report authorization map. A single company may have several websites or pages. |
| Report access | `src/cug.js`, `src/stafflogin.js` | Staff device can open all reports; entering an email on that device is identification by assertion, not verification. |
| Email handoff | `src/sharelink.js`, `src/session.js` | Staff-only seven-day, domain-based link; not necessarily valid for personal-address registrants or a month of revisit. |
| Sales follow-up | Existing authored CTAs vary by report. | No generic event booking destination or booth handoff contract found. |
| Presentation | `blocks/cobrand/` | Partner lockup exists, but its theme is coupled to Cannes and is not event-neutral configuration. |
| Preview | `docs/universal-booth-access.html` | Concept only; its email, report and finish screens are illustrative, not functional. |

## Current data flow

1. A prepared report is indexed in the DA insights list with a concrete `Folder` path (`customer-picker.js:280-402`).
2. Staff sign in to the event browser (`stafflogin.js:39-86`) and can open the report under their staff CUG session (`cug.js:47-88`).
3. Staff may manually share a page by entering a customer email or copying a seven-day link (`share-form.js:77-156`).
4. An attendee's registration email currently does **not** select a prepared report automatically.

## Constraints for the target

- Never change `scripts/ak.js`. Reuse EDS block conventions and DA-authored page content.
- No import infrastructure for site content; no public roster sheet or emails in the browser bundle.
- Existing customer login, staff dashboard, CUG groups, and generic report pages must keep working.
- CUG must still protect pages; a mapping or signed link must not authorize a different company report.
- Browser-only "clear state" cannot clear a long-lived staff cookie or browser history. Kiosk operational controls remain necessary.
- Report landing pages are authored outside this checkout; local fixtures can be used to test markup, but the live DA page must be separately published by its owner.
