# Agent Instructions

## Project snapshot

- **Sóþspell** (ASCII slug `sothspell`) is an AI-guided project walkthrough
  application. It generates a cinematic, semi-interactive explanation of a
  codebase with synchronized narration, diagrams, and highlighted code anchors.
  The website is first; an OpenCode V2 plugin follows; other harness adapters
  are a future track.
- **Repository status: Phase 4 implemented (2026-10-17).** The workspace,
  schema, compiler, golden tour, analyzer, authoring pipeline, cinematic player,
  virtualized code browser, and local run persistence exist. Narration and the
  OpenCode plugin are placeholders until their phases land.
- **Example project:** Bunbun at `/Users/ajc/Projects/codegens/bunbun`, pinned to
  commit `9fef24d`. It is **read-only**. No command may create, modify, or delete
  anything inside that tree. All snapshots, tours, audio, logs, and runs live
  under `SOTHSPELL_HOME` (default `~/.sothspell`).
- **Language:** TypeScript 7.0.2. The compiler has no programmatic compiler API
  in 7.0; do not add `ts-morph`, `typescript-estree`, `vite-tsconfig-paths`, or
  any package that imports the classic `typescript` compiler API at runtime.
  Use `oxc-parser` for syntax and symbol extraction.
- **Package manager:** pnpm only (`pnpm@12.14.0`). Never use npm or yarn.
- **Runtime:** Node.js 26 or newer. ESM only.
- **Web stack:** React 19, Vite 8, TanStack Router, Tailwind CSS 4, Hono 4 on
  Node, SQLite via `better-sqlite3`.
- **Visual direction:** clean modern devtool. Off-white/ink surfaces, cobalt
  accent, Geist Sans/Mono, restrained motion. No gradients, neon, or parchment
  pastiche.
- **OpenCode target:** V2 (`@opencode/plugin` 2.0.32), not V1.

## How to work

- Always use these skills: `tdd`, `codebase-design`, and `caveman` in ultra mode
  (`/caveman ultra`). Use `opencode` for OpenCode V2 work, `design-taste-frontend`
  for UI work, and `writing-for-agents` when editing this file or other agent
  instructions.
- When planning, ask the relevant questions first and incorporate the user's
  answers into the plan. Record stable decisions in memory.
- Prefer small, targeted changes over broad refactors.
- Always read a file before writing to it.
- Keep the plan documents current. A behavior or decision change updates the
  relevant `plans/PHASE-*.md`, `plans/ROADMAP.md`, and `CONTEXT.md`.
- Use subagents for parallel work, each in its own worktree at
  `<project-root>/.worktrees/<phase>-<wave-or-track>-<short-name-of-task>`, then
  merge sequentially.
- Always commit changes after a task is complete. Be descriptive and exact. Read
  the git log for examples of good long commit messages.
- End every commit message with exactly this trailer on its own line, preceded by
  a blank line:
  `Co-Authored-By: OpenCode v2 <5565189+anthonyclarka2@users.noreply.github.com>`

## Working style

- Always save file changes to disk and keep them in the working tree; never
  discard or revert changes unless the user explicitly requests it.
- If a bug is discovered, fix the root cause rather than layering on unrelated
  patches.
- When a feature is complete, commit the local changes unless the user explicitly
  says not to.
- If build or type checks fail for unrelated pre-existing issues, call that out
  clearly instead of claiming overall project success.
- Create comments that explain **why** an object, function, or module exists, not
  only what it does.
- Do not add a dependency that needs the TypeScript 6 compiler API without an
  explicit owner decision. The TypeScript 7 constraint is architectural.

## Subagent dispatch

Parallel work is isolated in git worktrees under
`<project-root>/.worktrees/<phase>-<track>-<short-name>`. Each subagent owns a
branch named after its worktree and a non-overlapping file set. The main agent
owns integration, plans, docs, and the final verification.

Every subagent must:

1. read `AGENTS.md`, `CONTEXT.md`, and the relevant phase plan;
2. run `pnpm install --frozen-lockfile` in its worktree;
3. work test-first and run `pnpm exec vitest run <its paths>`, then
   `pnpm typecheck`, `pnpm lint`, and `pnpm test`;
4. commit on its branch with the standard co-author trailer;
5. report the branch, commit, files, test output, and any integration
   assumptions.

The main agent merges branches sequentially with `git merge --no-ff`, resolves
conflicts in favor of the agreed contract, reruns the full gate, and deletes the
worktree only after the merge is verified. A subagent must never write to the
Bunbun tree or to another agent's worktree.

### Phase 5 dispatches (2026-10-17)

| Track | Branch / worktree | Owner scope | Session |
| --- | --- | --- | --- |
| Narration package | `phase-5-a-narration` / `.worktrees/phase-5-a-narration` | `packages/narration/**` only: sentence splitting, alignment, browser speech, ElevenLabs client, file asset store, tests | `ses_eb653ebb7ffeGazvoXzSytxXwM` |
| API audio/narration | `phase-5-b-api-audio` / `.worktrees/phase-5-b-api-audio` | `apps/api/**` only: narration service, `POST /api/narration`, `GET /api/audio/:hash` with range support, tests | `ses_eb653ebb7ffdGB5uz1mPyW6YC2` |

Main owns `apps/web/**`, `packages/player/**`, `packages/core/**`, plans, docs,
and the final player integration. The narration contract lives in
`packages/narration/src/types.ts` and is frozen for both tracks.

## Verification

Do not claim completion without fresh verification output.

- Add or update a focused test before implementing a behavior change. When fixing
  a bug, add a specific regression test so it cannot reoccur.
- Prefer real behavior tests over mock-only assertions.
- Test at public seams. Proposed seams are listed in `plans/ROADMAP.md` §18;
  confirm them before writing the first test for a phase.
- Run the smallest relevant command first, then the full gate:
  `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`,
  `pnpm test:browser`, `pnpm test:a11y`.
- Verify every user-facing change in a real browser, not only happy-dom.
- After any Bunbun analysis, authoring, playback, or plugin run, verify:
  `git -C /Users/ajc/Projects/codegens/bunbun status --porcelain` prints nothing.
- Record performance numbers (analysis time, bundle size, LCP, audio cache size)
  when a phase plan requires them.

## Repository layout

- `apps/web/` — React player and virtualized code browser.
- `apps/api/` — Hono API, static web host, full-file source route, and the
  local SQLite run store.
- `apps/cli/` — `sothspell` CLI (`analyze` and `author` now; `serve` and
  `doctor` as their phases land).
- `packages/core/` — tour schema, compiler, source access, validation, IDs.
- `packages/analyzer/` — read-only snapshots, symbols, graph, brief, anchor
  resolution, cache.
- `packages/authoring/` — `GuideModel`, prompts, context packs, curriculum and
  chapter generation, validation, repair, cache, quality report.
- `packages/player/` — framework-free playback state machine.
- `packages/narration/` — browser and ElevenLabs adapters, alignment, cache
  (Phase 5 placeholder).
- `packages/diagram/` — diagram IR, validation, ELK layout.
- `packages/harness/` — harness adapter contract (Phase 7 placeholder).
- `packages/opencode-plugin/` — OpenCode V2 plugin (Phase 7).
- `examples/bunbun-tour/` — checked-in golden tour pinned to Bunbun `9fef24d`.
- `docs/` — development guide now; architecture, authoring, player, narration,
  plugin, privacy, self-hosting, accessibility, and troubleshooting as phases
  land.
- `plans/` — roadmap and phase plans.
- `CONTEXT.md` — domain glossary. Required reading before domain code.
- `AGENTS.md` — this file.

## Commands

```bash
pnpm install
pnpm dev
pnpm typecheck
pnpm lint
pnpm test
pnpm test:browser
pnpm test:a11y
pnpm build
pnpm check:toolchain
pnpm schema:json
pnpm tour:build
pnpm sothspell doctor
pnpm sothspell analyze /Users/ajc/Projects/codegens/bunbun --brief
pnpm sothspell analyze /Users/ajc/Projects/codegens/bunbun --save
pnpm sothspell author /Users/ajc/Projects/codegens/bunbun --model fixture --out /tmp/bunbun-tour
SOTHSPELL_MODEL=openai/gpt-5.2 pnpm sothspell author /Users/ajc/Projects/codegens/bunbun --out /tmp/bunbun-tour
pnpm sothspell serve
```

`pnpm sothspell analyze` and `pnpm sothspell author` are available now; `serve`
and `doctor` arrive with their phases. The dev server ports are `4319` (API) and
`5173` (web); an agent may kill processes on those ports to free them.

## Domain vocabulary

Use the exact terms in [`CONTEXT.md`](CONTEXT.md): sóþspell, truth story,
project snapshot, revision, chapter, beat, stage, code anchor, code page,
diagram instruction, diagram focus, narration, sentence timing, word timing,
playback mode, run, interlude, guide, authoring pipeline, golden tour, stale
tour, deep link, progress, harness adapter, read-only.

Do not introduce synonyms such as "story," "lesson," "slide," "video," "wiki,"
or "chat" for these concepts in code, tests, or docs.

## Plans and phase docs

- [`plans/ROADMAP.md`](plans/ROADMAP.md) is the hub: product definition,
  architecture, format, stack, security, testing, phase sequence, risks.
- `plans/PHASE-1.md` through `plans/PHASE-8.md` are the phase plans. Each has a
  goal, scope, decisions, waves, test seams, Bunbun acceptance, exit criteria, and
  risks.
- Status lines: `planned` → `in progress` → `complete (<date>)`, with shipped
  evidence under the phase.
- Update the phase plan when a decision changes during implementation. Do not
  leave the roadmap and a phase plan disagreeing.

## Bunbun demo rules

- Read-only. No `.sothspell/` directory, no generated files, no lockfile changes,
  no edits inside `/Users/ajc/Projects/codegens/bunbun`.
- The checked-in golden tour stores small attributed excerpts and hashes; it is
  not a copy of the repository.
- The app resolves the Bunbun path only when the user opens the demo. Tests skip
  cleanly when the checkout is absent and never fail into a write.
- Use Bunbun commit `9fef24d` for the first golden tour. Regenerating the tour
  requires a new commit pin and a review note.

## Memory

Use the project memory tool for stable decisions, constraints, and research
findings (for example: stack choices, Bunbun pin, security invariants). Do not
store secrets, API keys, or large source excerpts in memory. `CONTEXT.md` remains
the canonical domain glossary; memory is for agent continuity.
