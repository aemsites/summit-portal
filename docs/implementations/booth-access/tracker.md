# Reusable booth access: tracker

Status: `Not started`, `In progress`, `Review`, `Complete`, `Blocked`, `Scope reduction`. `Complete` means verified, not simply coded. No production work is authorized by this plan.

| Wave | Total | Not started | In progress | Review | Complete | Blocked |
|---|---:|---:|---:|---:|---:|---:|
| 0 | 2 | 2 | 0 | 0 | 0 | 0 |
| 1 | 6 | 6 | 0 | 0 | 0 | 0 |
| 2 | 1 | 1 | 0 | 0 | 0 | 0 |
| 3 | 1 | 1 | 0 | 0 | 0 | 0 |
| **Total** | **10** | **10** | **0** | **0** | **0** | **0** |

| ID | Task | Size | Wave | Stream | Status | Depends on | File |
|---|---|---|---:|---|---|---|---|
| ARC-01 | Approve access, roster, report-link and branding contracts | M | 0 | A | Not started | - | [ARC-01](tasks/architecture/ARC-01.md) |
| INF-01 | Provision a private event roster and operations contract | M | 0 | A | Not started | ARC-01 | [INF-01](tasks/infrastructure/INF-01.md) |
| BE-01 | Implement staff-only attendee lookup | M | 1 | B | Not started | INF-01 | [BE-01](tasks/backend/BE-01.md) |
| BE-02 | Constrain event report-link redemption to one report | L | 1 | B | Not started | BE-01 | [BE-02](tasks/backend/BE-02.md) |
| BE-03 | Send a report link to the matched registration address | M | 1 | B | Not started | BE-02 | [BE-03](tasks/backend/BE-03.md) |
| FE-01 | Build the reusable portrait email-lookup screen | M | 1 | C | Not started | BE-01 | [FE-01](tasks/frontend/FE-01.md) |
| FE-02 | Link the real report to Finish, email and reset | L | 1 | C | Not started | FE-01, BE-03 | [FE-02](tasks/frontend/FE-02.md) |
| FE-03 | Adapt report portrait behavior and approved branding | M | 1 | D | Not started | ARC-01 | [FE-03](tasks/frontend/FE-03.md) |
| QA-01 | Rehearse complete flow and final device | M | 2 | Integration | Not started | BE-03, FE-02, FE-03 | [QA-01](tasks/testing/QA-01.md) |
| DOC-01 | Update shared brief and handoff guide | S | 3 | Integration | Not started | QA-01 | [DOC-01](tasks/docs-process/DOC-01.md) |
