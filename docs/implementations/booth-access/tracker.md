# Reusable booth access: tracker

**October 1:** implementation authorized and roster scope superseded. “Verified”
below means repository/fixture verification, not production rollout or inbox
receipt. The child implementation does not deploy or merge production.

| Area | State | Evidence / remaining gate |
|---|---|---|
| Isolated booth Worker + evergreen shell | Verified locally | Exact routes, bundled single-source assets, Wrangler dry-run |
| CUG-authorized discovery + picker | Verified locally | Exact email OR domain; fresh private index/CUG/mapping, most-specific permissions, authorized-alias filtering, explicit selection; neighbor denied |
| Context + real delivery integration | Verified locally | Bound HttpOnly context, KV TTL, Durable Object serialization, real share/JWT redemption tests; exact-email grants never add an unauthorized domain |
| Approved Entry/Finish UI + report return | Verified locally and initial live flow | 2160 × 3840 and 390 × 844 fixtures; real selected report and top-visible Finish verified; guarded Entry recovery |
| Fresh-document history boundary + safe exit | Verified locally; final live gate pending | Bound signed non-PII device marker survives reset; exact selected document only; forged/expired/rotated markers, ordinary unmarked CUG redemption and concurrent-reset tests |
| Documentation + PR | External PR gate | Current contract/runbook recorded; dedicated app creation failed twice with EMU 403, no matching PR exists |
| Worker activation | Deployed; final history correction awaiting redeploy | Parent deployed `0a5949b7` as `057e241a-4bb3-4cb2-9538-7a0ef313c77b`; exact lookup/report/Finish/clear passed, then fresh Back reload exposed gap |
| Real email dispatch / receipt | Dispatch verified; receipt external | One approved send accepted by server and shown in UI; inbox receipt not verified; do not resend during history retest |
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
