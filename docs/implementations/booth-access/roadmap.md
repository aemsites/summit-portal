# Reusable booth access: delivery roadmap

This is a dependency map, **not** a promise that an October 13 event can be supported by the earlier September 29 finalization target. Set dates with the owners once ARC-01 is signed off.

| Wave | Goal | Entry gate | Tasks |
|---|---|---|---|
| 0 / Decision and foundation | Resolve the risk, map contract and private roster store | None | ARC-01, INF-01 |
| 1 / Core experience | Server lookup, direct report navigation, booth-only Finish control, report-bound delivery and portrait presentation | Approved access/roster contracts | BE-01, BE-02, BE-03, FE-01, FE-02, FE-03 |
| 2 / Rehearsal | Exercise the integrated flow and equipment | Core tasks verified | QA-01 |
| 3 / Handoff | Publish the agreed team-facing documentation and operational checklist | Rehearsal accepted | DOC-01 |

## Streams and file ownership

| Stream | Tasks, in order | Exclusive edit area |
|---|---|---|
| A / decisions and provisioning | ARC-01 -> INF-01 | `context/target-design.md`, `design/experience.md`, Worker config, private-provisioning runbook |
| B / Worker | BE-01 -> BE-02 -> BE-03 | Worker `src/`, Worker `test/`; BE-02 may touch the router after BE-01, BE-03 after BE-02 |
| C / booth UI | FE-01 -> FE-02 | `blocks/booth-access/` and its browser tests; after FE-01, FE-02 also owns `scripts/lazy.js`, `scripts/utils/booth-return.js`, `styles/booth-return.css` and the report-helper browser test |
| D / report portrait | FE-03 | Scoped report styles / approved assets; no `blocks/booth-access/` edits |
| Integration | QA-01 -> DOC-01 | Rehearsal checklist, then shared brief and `PROJECT.md` |

Streams B and C can overlap **after** BE-01's API shape is agreed; C's integration check waits for BE-01. Stream D can run separately once branding scope is approved. Never edit `src/index.js` from two parallel Worker tasks or `booth-access.js` from two UI tasks.

## Milestones

| After | Gate |
|---|---|
| ARC-01 | Privacy accepts or changes the email-only visibility risk; source roster and personal-email policy, link lifetime and branding documented. Sales/booking mechanics are deferred, not a blocker for report lookup and email delivery. |
| INF-01 | Private store bound in an isolated test environment; no roster data in site or Git; instructions for validating duplicate/missing assignments and deleting data approved. |
| BE-01 | Staff-only exact-email lookup with active-event boundary and safe no-match; Worker tests pass. |
| BE-03 | Scoped link cannot open another company report; only approved recipient emailed; expired/revoked tokens fail; Worker tests pass. |
| FE-02 + FE-03 | Question-led, pausable Welcome, **direct real report**, booth-only Finish control, report email, human handoff guidance and quiet-but-usable reset checked at the 2160 × 3840 event target first, then fallback/mobile/desktop sizes; existing non-booth login and report views unchanged. A booking CTA is not part of this gate without a staffed process. |
| QA-01 | On-site browser/network/keyboard/send/reset/back-nav rehearsed; all 400 expected assignments reconciled or explicitly excepted; go/no-go recorded. |

## Scope and sequencing safeguards

- Do not globally lengthen current share links or silently reinterpret their CUG grant.
- Do not put the roster, email-to-path map, or signed links in client-side data sheets, event query strings or logs.
- Do not treat a frontend idle reset as revoking a four-day staff session.
- Keep brand switching config-driven, with no one-off event page.
- A missing or duplicate registration email must not fall back to company search.
- Production Worker deployment, data provisioning and DA publishing are separate owner-approved actions, not automatic task steps.

## Exit

The project is ready only when all tasks are verified, owners approve the risk and browser setup, and the published DA booth page and real report are rehearsed on the final portrait hardware. If the September 29 target is firm, scope and dates must be renegotiated rather than treating untested email-only access as done.
