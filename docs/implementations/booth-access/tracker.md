# Reusable booth access: tracker

**October 1:** implementation authorized and roster scope superseded. “Verified”
below means repository/fixture verification, not production rollout or inbox
receipt. The child implementation does not deploy or merge production.

## Local security hardening

These changes are implemented in the security-review worktree, **not deployed**.
The historical deployment table below does not prove these protections are live.

| Area | State | Evidence / remaining gate |
|---|---|---|
| Booth-only credential and persistent boundary | Verified locally | Scoped purposes rejected by general authentication; dashboard/API/share/format denials; reset, logout, OAuth/re-login and legacy migration regressions |
| One active report with controlled switching | Verified locally | Original recipient/deadline retained; fresh permission checks; independent sent/uncertain/view outcomes per report |
| Fail-closed report lifecycle | Verified locally | Real workerd early concealment; client verification failure/timeout, idle/history/reset recovery; wrapper removal preserves original nodes/layout |
| Touchscreen downloads and extra tabs | Verified locally | PDF/opaque export MIME and disposition denials; late client download/target suppression; ordinary portal downloads retained |
| Matching Worker/assets and managed touchscreen | Not activated | Reviewed deployment, close old report tabs, reload/migrate kiosk, final hardware/network rehearsal; administration on a separate browser/device |

## October 8 recovery fixes (not deployed)

| Area | State | Evidence / remaining gate |
|---|---|---|
| Bounded Entry operations and reset | Verified locally | Ten-second fetch/body deadline for all Entry APIs; visible fail-closed recovery; serialized reset; stale response suppression; unconfirmed send never replayed |
| Keyboard dismissal with focus retained | Verified locally | Layout/VisualViewport restoration removes reserve; geometry zero, field switching, reopen, pinch and cleanup unit checks; real-browser reduced/restored viewport fixtures |
| Matching assets and documentation | Verified locally | `booth-recovery-1` Entry/adapter/keyboard versions, 118 frontend and 25 Worker shell/injection tests, changed-file lint, Worker dry run |
| Device and production acceptance | External gate | 40-inch 2160 x 3840 physical display; CSS scaling/DPR/native keyboard unknown; no fresh protected-customer certification, real Turnstile/inbox receipt or production deployment |

## Historical implementation and activation

| Area | State | Evidence / remaining gate |
|---|---|---|
| Isolated booth Worker + evergreen shell | Verified locally | Exact routes, bundled single-source assets, Wrangler dry-run |
| CUG-authorized discovery + picker | Verified locally | Exact email OR domain; fresh private index/CUG/mapping, most-specific permissions, authorized-alias filtering, explicit selection; neighbor denied |
| Context + real delivery integration | Verified locally | Bound HttpOnly context, KV TTL, Durable Object serialization, real share/JWT redemption tests; exact-email grants never add an unauthorized domain |
| Approved Entry/Finish UI + report return | Verified locally and initial live flow | 2160 × 3840 and 390 × 844 fixtures; real selected report and top-visible Finish verified; guarded Entry recovery |
| Fresh-document history boundary + safe exit | Verified live on `c13ab557` | Fresh report request redirects; actual Back lands Entry with no report; exit signs out, `/auth/me` and booth status return 401; ordinary unmarked CUG redemption and races verified in tests |
| Documentation + PR | External PR gate | Intended source: `jose-correia/summit-portal:josec-adobe-sync-remote`, pushed successfully with personal credentials; dedicated app redundant push still uses `josec_adobe` and fails 403 before creation. Child upstream branch also exists; no PR anywhere, no CLI bypass |
| Worker activation | Deployed; runtime frozen | Exact `01df090` deployed as `ab90af30-5e54-4f99-99dd-af21df62f395`; adds marker-purpose/auth separation after verified `c13ab557` history flow; 269 Worker tests pass, one existing skip |
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
