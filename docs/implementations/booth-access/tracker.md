# Reusable booth access: tracker

**October 1:** implementation authorized and roster scope superseded. “Verified”
below means repository/fixture verification, not production rollout or inbox
receipt. The child implementation does not deploy or merge production.

| Area | State | Evidence / remaining gate |
|---|---|---|
| Isolated booth Worker + evergreen shell | Verified locally | Exact routes, bundled single-source assets, Wrangler dry-run |
| Domain discovery + picker | Verified locally | Fresh private index/CUG/mapping, most-specific permissions, authorized-alias filtering, explicit selection |
| Context + real delivery integration | Verified locally | Bound HttpOnly context, KV TTL, Durable Object serialization, existing share-link policy, duplicate/uncertain send tests |
| Approved Entry/Finish UI + report return | Verified with explicit test fixtures | 2160 × 3840 and 390 × 844; long report fixed control; motion/focus; reset/error/idle/bfcache |
| Documentation + PR | Implementation handoff | README, target contract, PROJECT; PR creation tracked separately |
| Worker activation | External gate | Parent reviews exact commit, checks live baseline, approves/deploys binding/migration |
| Actual email receipt | External gate | Staff-authenticated live lookup/send once to approved recipient; no fixture result substitutes |
| Final device/privacy acceptance | External gate | Kiosk lockdown, actual CSS viewport, keyboard/network, asserted-domain risk acceptance |

## Superseded ten-task plan

These are **not** completed as originally specified. Retain the historical task
documents as planning evidence; the current contract is in
[target design](context/target-design.md).

| ID | Historical task | October 1 disposition |
|---|---|---|
| ARC-01 | Approve access, roster, report-link and branding contracts | Revised: domain discovery approved; operational/privacy gate remains |
| INF-01 | Provision private event roster | Scope reduction: no roster or event binding |
| BE-01 | Staff-only exact attendee lookup | Replaced by CUG-domain prepared-report discovery |
| BE-02 | Constrain event link to one report | Scope reduction: preserve existing 30-day domain share grant, no new token |
| BE-03 | Email matched registration address | Replaced by stored asserted business email + selected authorized path |
| FE-01 | Reusable portrait lookup | Implemented using preserved design, business-domain copy |
| FE-02 | Real report to Finish/email/reset | Implemented; existing report content remains intact |
| FE-03 | Report portrait/branding adaptation | Scope reduction: no unrelated report layout or runtime co-brand switching |
| QA-01 | Rehearse flow and final device | Fixture flow verified; live mail/hardware/operator gates remain |
| DOC-01 | Shared handoff guide | Current implementation/runbook recorded, original design artifacts preserved |
