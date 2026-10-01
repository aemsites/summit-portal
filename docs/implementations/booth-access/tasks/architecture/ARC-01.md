# ARC-01: Approve the booth contracts

| Field | Value |
|---|---|
| Domain / size | Architecture / M |
| Wave / stream | 0 / A |
| Dependency | None |

## Problem and objective

The brief is intentionally nontechnical, but it leaves decisions that determine whether the feature is safe and feasible. Secure report links, registration data and unattended kiosk behavior cannot be designed by inference. Obtain owner decisions and update the draft target design before any Worker or UI implementation.

## Read first and follow

- `docs/universal-booth-access.html:1290-1570`: agreed customer-facing experience.
- `docs/implementations/booth-access/context/current-state.md`: existing boundaries.
- `workers/cloudflare/cug-adobe-oauth-worker/src/sharelink.js:58-118,170-218`: current sharing constraints.
- `workers/cloudflare/cug-adobe-oauth-worker/src/cug.js:26-88`: how page access is decided.
- `docs/implementations/booth-access/design/experience.md`: screen states to resolve.

## Files to modify

- `docs/implementations/booth-access/context/target-design.md`: record choices and signed-off risks.
- `docs/implementations/booth-access/design/experience.md`: finalize states, copy and behavior.
- `docs/implementations/booth-access/README.md`: replace open gates with decisions.

## Deliverables

1. Record explicit event/privacy acceptance or rejection of email-only viewing on the staff kiosk. Verification by a booth expert remains optional unless owners change this decision.
2. Use José's confirmed **single `/booth` page** (not the existing root entry). Choose private roster store, provisioning owner, retention date, duplicate-email policy and exact report path selection per website; detail staff-only `/booth?event=<id>` setup and clean-URL redirect.
3. Decide which registered email addresses are eligible for email delivery, how long the report-specific link works, forwarding/revocation policy, and whether email identity must be re-verified.
4. Approve Adobe/Semrush branding scope. Record seller handoff and booking destination as **open optional follow-ups**, not required for the core email/report flow.
5. Record the event date and an honest go/no-go schedule.

## Boundaries and verification

Do not change runtime files; do not claim security approval by default. No parallel files to block in Wave 0: INF-01 starts after this task. Work in the existing app-managed worktree, not a manually created branch.

Review the amended documents with the named owners and verify all five decisions have a named owner and status. `git diff --check` should pass. Done means implementation tasks can make these decisions from a written contract rather than inventing them.
