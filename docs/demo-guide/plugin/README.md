# Amplify your brand visibility — staff companion

Adapted from Jason's Chrome side-panel plugin. This is a **staff-only guide**, not a customer-facing page or an event-display control. Version **1.1.1** contains the complete 20-section guide, 13 screenshots, a searchable index, copyable talk tracks and reusable setup/readiness checkboxes.

The current content comes from **Amplify your brand visibility activation guide (4).docx**, supplied October 9, 2026, plus José's subsequent explanation of unavailable reports. It includes the revised capability-led Adobe Brand Visibility messaging, edited reference/objection responses, updated screenshots and the new report-ready email image showing 30-day access. The availability guidance explains insufficient data, possible new-site/traffic/AI-access limitations and team follow-up to assess another website, without diagnosing a visitor's site from the lookup. Comments, deleted revisions and fixed Word page numbers are not included. The Word file is unchanged; the older Markdown/Word artifacts are not the current plugin's source.

## Platform page (review approved; PR and rollout pending)

The responsive `/adobe/booth-guide` page uses the same approved guide content without requiring an extension. A dashboard banner above the report picker opens the guide, not the kiosk. Desktop has a sticky index; mobile has compact section navigation. Search excludes private values; screenshots open at full size; readiness/setup checks store only revision-scoped booleans on the staff device.

The Worker requires a real Adobe OAuth session with an `@adobe.com` identity for the page, data and every screenshot. Generic event logins, magic/share links, partners and booth-restricted browsers cannot read it. The runtime/shell contain no private values. Complete content and screenshots belong in private `SESSIONS` KV, not DA, Git, public media or the Worker bundle:

- `booth-guide:current`: the complete guide JSON, including `contentVersion`, `sections` and a `screenshots` array of the 13 PNG filenames.
- `booth-guide:<contentVersion>:screenshots/<filename>`: each original PNG's raw bytes.

José approved the local review and requested a pushed branch/compare link so he can create the PR. The guide is not live yet: merging the frontend alone does not deploy the Worker or upload private content.

For the post-merge rollout, use the existing Summit Worker environment and `wrangler kv key put --binding SESSIONS --env summit --remote --path <private-file> <key>`. Upload and verify all image bytes first, publish the JSON pointer last, and verify all assets after KV propagation. Deploy the merged Worker and verify the matching frontend banner through the normal reviewed release process. Never deploy from an outdated booth branch or print private JSON/credentials in command output. No new namespace, database migration or CUG grant is needed. The current local preview is not a production sign-in test or a published platform page.

## Install the restricted staff package

1. Use a separate staff laptop/browser, not the customer-facing kiosk. The package contains the shared credentials, approved setup email and protected company screenshot.
2. Extract `amplify-brand-visibility-plugin-v4.zip`. Keep the extracted folder in a stable location.
3. In Chrome 116 or newer, open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select the extracted folder containing `manifest.json`.
4. Pin the extension and click its Adobe icon to open the side panel.
5. Open `https://act.aem.now/booth`. Enable **Follow screen** to follow sign-in, Entry, industry selection, the report sections and Finish.

**Follow screen tracks the active booth tab in the same Chrome window.** It does not watch a kiosk on another device or in another browser. On a separate staff laptop, use the section picker/search alongside the customer conversation, or open your own booth tab for rehearsal.

The repository's `docs/demo-guide` folder can also be loaded for a **redacted review**. It deliberately omits the real credentials/test email and masks the company Finish preview. Do not mistake that review version for the event-staff package.

## Use it

- **Guide section** opens every demo and reference section. Manual navigation or search pauses screen following; enable **Follow screen** to resume.
- **Find an answer** searches signals, objections, guardrails, readiness and setup. It does not index private credential values.
- **Show staff credentials / approved setup email** is collapsed by default. Reveal only on the staff device.
- Select a screenshot to open the complete original at full size.
- Booth/sign-in links open a new staff tab; they do not replace the guide or navigate an existing customer tab.
- Readiness and setup checks persist locally. A new content revision starts with unchecked items so a previous version's checks cannot pass revised instructions. **Reset these guide checks** clears only that revision's selected checklist, never the booth session.
- The guide works offline; the actual booth still needs its normal internet connection.
- Screen following reconnects automatically if Chrome suspends its background worker. Repeated connection failures display an explicit warning.

## Quick installation check

Open the guide, search for `INP`, open its definition, follow its section links, open a screenshot and tick a setup check. Reopen the panel and confirm the check remains. On the booth, move from Entry to Industry demos and verify the panel follows. Manually open Objection handling and confirm it stays there until you resume following.

On a company report, scroll through AI, search and performance; on Finish, check the closing guidance. If the status says **URL only**, reload the booth tab to reconnect the content script. If Chrome reports an extension error, stop using the companion until the installation is corrected.

## Scope and privacy

The only permitted website is `https://act.aem.now`. The plugin observes screen/section identifiers, not visitor emails, company names, report scores, cookies or report bodies. It sends no analytics or network requests to a third party. All guide content, fonts and screenshots are bundled.

Removed from the supplied plugin: unrelated journeys, machine-specific Windows paths, arbitrary-site/file access, page-message commands, automatic 50% zoom, Restart navigation and Close-tab actions. The companion cannot send reports, request/generate reports, reset a visit, close the customer tab or change its zoom.

Reload the extension on `chrome://extensions` and reload existing booth tabs after replacing its files. Staff setup failures and questions go to José Correia and the booth lead.
