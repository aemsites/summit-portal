# Implementation project guidelines

Read `AGENTS.md`, `PROJECT.md`, the project's README, current/target state, design, roadmap, tracker and your assigned task before editing. Confirm predecessor tasks are complete. Work only on files assigned to your task, with tests for every runtime behavior change.

Use this app-managed worktree and branch. Do not create or rename branches with raw Git commands. If parallel implementation is explicitly approved, use separate project sessions/worktrees managed by the app; keep file ownership exclusive. Do not push, deploy Workers, publish DA pages, change production data, create credentials or run migrations without an explicit request and required approvals.

Follow the site's EDS block pattern (`init(el)`, scoped CSS, responsive design) and the existing Worker test pattern. Do not modify `scripts/ak.js`, create content import scripts, commit attendee PII or secrets, or weaken CUG. Browser-local success is not enough: verify the Worker path with automated tests and the page visually with an authorized preview.

When a decision is unresolved, stop the affected task and report the options rather than inventing a policy. Before marking a task complete, run its targeted verification, record results in the tracker, and update `PROJECT.md` for significant behavior changes. Preserve pre-existing worktree edits.
