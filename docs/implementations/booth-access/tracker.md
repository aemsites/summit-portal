# Reusable booth access: tracker

**October 1:** implementation authorized and roster scope superseded. “Verified”
below means repository/fixture verification, not production rollout or inbox
receipt. The child implementation does not deploy or merge production.

| Area | State | Evidence / remaining gate |
|---|---|---|
| Isolated booth Worker + evergreen shell | Verified locally | Exact routes, bundled single-source assets, Wrangler dry-run |
| CUG-authorized discovery + picker | Verified locally | Exact email OR domain; fresh private index/CUG/mapping, most-specific permissions, authorized-alias filtering, explicit selection; neighbor denied |
| Context + real delivery integration | Verified locally | Bound HttpOnly context, KV TTL, Durable Object serialization, real share/JWT redemption tests; exact-email grants never add an unauthorized domain |
| Approved Entry/Finish UI + report return | Verified with explicit test fixtures | 2160 × 3840 and 390 × 844; long report fixed control; motion/focus; reset/error/idle/bfcache |
| Documentation + PR | External PR gate | Current contract/runbook recorded; dedicated app creation failed twice with EMU 403, no matching PR exists |
| Worker activation | Deployed; correction awaiting review/redeploy | Parent reports active `45ee8181-2d01-4108-a9f0-ad27506c3a5b`; Entry works, redirect-option 502 fixed; exact-email lookup 404 correction verified locally |
| Actual email receipt | External gate | Staff-authenticated live lookup/send once to approved recipient; no fixture result substitutes |
| Final device/privacy acceptance | External gate | Kiosk lockdown, actual CSS viewport, keyboard/network, asserted-email/domain risk acceptance |

## Superseded ten-task plan

These are **not** completed as originally specified. Retain the historical task
documents as planning evidence; the current contract is in
[target design](context/target-design.md).

| ID | Historical task | October 1 disposition |
|---|---|---|
| ARC-01 | Approve access, roster, report-link and branding contracts | Revised: existing exact-email/domain CUG discovery; operational/privacy gate remains |
| INF-01 | Provision private event roster | Scope reduction: no roster or event binding |
| BE-01 | Staff-only exact attendee lookup | Replaced by CUG-authorized email/domain prepared-report discovery, not registration matching |
| BE-02 | Constrain event link to one report | Scope reduction: preserve 30-day authored CUG grants, exact-email links do not grant a whole domain; no new token |
| BE-03 | Email matched registration address | Replaced by stored asserted business email + selected authorized path |
| FE-01 | Reusable portrait lookup | Implemented using preserved design, business-email copy |
| FE-02 | Real report to Finish/email/reset | Implemented; existing report content remains intact |
| FE-03 | Report portrait/branding adaptation | Scope reduction: no unrelated report layout or runtime co-brand switching |
| QA-01 | Rehearse flow and final device | Fixture flow verified; live mail/hardware/operator gates remain |
| DOC-01 | Shared handoff guide | Current implementation/runbook recorded, original design artifacts preserved |
