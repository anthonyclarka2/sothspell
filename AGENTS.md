# Agent Instructions

## How to work

- Prefer small, targeted changes over broad refactors; keep changes scoped to the user request.
- Always use these skills: `tdd` and `codebase-design`.
- Keep token usage low: use the `caveman` skill in ultra mode (`/caveman ultra`) by default.
- When planning, ask the relevant questions first and incorporate the user's answers into the plan.
- Use subagents for parallel work, each in its own worktree at `<project-root>/.worktrees/<phase>-<wave-or-track>-<short-name-of-task>`, then merge sequentially.
- Always read a file before writing to it.
- Always commit changes after a task is complete. Be descriptive and exact. Look at the git log for examples of good long commit messages.

## Working style

- Always save file changes to disk and keep them in the working tree; never discard or revert changes unless the user explicitly requests it.
- If a bug is discovered, fix the root cause rather than layering on unrelated patches.
- When a feature is complete, commit the local changes to git unless the user explicitly says not to.
- If build or type checks fail for unrelated pre-existing issues, call that out clearly instead of claiming overall project success.
- Always create comments for objects, functions, etc, that explain the "why" not just the "how" of the item being documented.

## Verification

Do not claim completion without fresh verification output.

- Add or update a focused test before implementing a behavior change; when fixing a bug, always add a specific regression test so it cannot reoccur.
- Prefer real behavior tests over mock-only assertions.
