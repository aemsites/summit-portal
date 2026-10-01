# DOC-01: Publish final shared flow and handoff

| Field | Value |
|---|---|
| Domain / size | Docs/process / S |
| Wave / stream | 3 / Integration |
| Dependency | QA-01 |

## Problem and objective

The current HTML brief is an attractive concept, not a guarantee that the proposed report email, branded modes and reset behavior have shipped. After rehearsal, make the document describe the **actual** launch experience, the owner's handoff and any accepted limits.

## Read first and follow

- `docs/universal-booth-access.html:1290-1570`: shared nontechnical document and simple mockups.
- `docs/implementations/booth-access/rehearsal.md` and `operations.md`: approved facts.
- `PROJECT.md:14-17,101-128`: living repo documentation.

## Files and ownership

Modify `docs/universal-booth-access.html`, `PROJECT.md` and `docs/implementations/booth-access/README.md`. Read and integrate the existing uncommitted work in the HTML and `PROJECT.md` first; never overwrite it. No runtime changes belong in this task.

## Deliverables

1. Team-facing HTML explicitly distinguishes delivered features from deferred wishes; keep the manager/seller/event-friendly design and avoid an engineering appendix.
2. One short operator handoff that points to the private roster process, correct registration email, device/browser/network and sales routes; no roster PII.
3. `PROJECT.md` describes the shipped behavior and references the implementation plan and owner runbook.

## Verification and done

Documentation only: verify all links/paths exist, review at desktop/mobile/portrait widths and run `git diff --check`. Final document must match the rehearsed experience, not merely the planned mockups.
