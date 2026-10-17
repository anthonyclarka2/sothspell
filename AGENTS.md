# Agent Instructions

## Project snapshot

- **Sóþspell** (ASCII slug `sothspell`) is an AI-guided project walkthrough
  application. It generates a cinematic, semi-interactive explanation of a
  codebase with synchronized narration, diagrams, and highlighted code anchors.
  The website shipped first; the OpenCode V2 plugin is complete; Claude Code,
  Codex, and other harness adapters are Phase 10 of the next stage.
- **Repository status: v1 release complete (2026-10-17); next stage in
  progress.** Phases 9–13 and 16 are complete: preferences, harness plugins,
  GitHub import, accounts and sync, language analyzers, and the embeddable
  player. Phase 14 (translation) and Phase 15 (review UI) are active. The v1
  plans are archived in `plans/archive/`; the next-stage roadmap and Phases
  9–16 live in `plans/ROADMAP.md` and `plans/PHASE-9.md` through
  `plans/PHASE-16.md`.
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

### Subagent dispatches (v1, 2026-10-17 — historical)

| Track               | Branch / worktree                                                    | Owner scope                                                                                                             | Session                          |
| ------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| Narration package   | `phase-5-a-narration` / `.worktrees/phase-5-a-narration`             | `packages/narration/**` only: sentence splitting, alignment, browser speech, ElevenLabs client, file asset store, tests | `ses_eb653ebb7ffeGazvoXzSytxXwM` |
| API audio/narration | `phase-5-b-api-audio` / `.worktrees/phase-5-b-api-audio`             | `apps/api/**` only: narration service, `POST /api/narration`, `GET /api/audio/:hash` with range support, tests          | `ses_eb653ebb7ffdGB5uz1mPyW6YC2` |
| OpenCode V2 plugin  | `phase-7-a-opencode-plugin` / `.worktrees/phase-7-a-opencode-plugin` | `packages/opencode-plugin/**` only: V2 plugin, commands, tools, RPC, default runtime, OpenCode model adapter, tests     | `ses_eb642b477ffeRkFGjnWK7KpoiW` |

All v1 tracks were merged and their worktrees and branches were removed after
verification. The narration contract lives in
`packages/narration/src/types.ts`.

### Next-stage dispatches (2026-10-17)

| Phase | Track / worktree / branch | Owner scope                                                                             | Session                          |
| ----- | ------------------------- | --------------------------------------------------------------------------------------- | -------------------------------- |
| 9     | `phase-9-a-preferences`   | `packages/settings/**`, settings API routes, `/settings` page, profile-aware resolution | `ses_eb608b86cffe8nuLB3XC1PKR20` |
| 10    | `phase-10-a-harness`      | `packages/harness/**`, Claude Code and Codex adapter packages, OpenCode plugin refactor | `ses_eb608b86bffepaeqpbK3W8DRRF` |
| 11    | `phase-11-a-import`       | `packages/import/**`, import API/UI, `sothspell import`                                 | `ses_eb608b86affeoF0nH3bsJw8lcF` |
| 12    | `phase-12-a-accounts`     | `packages/accounts/**`, auth/account/sync API and UI, run user scope                    | `ses_eb608b85effezfutU5v30MDhau` |
| 13    | `phase-13-a-analyzers`    | `packages/analyzer/**`, Python/Go/Rust/Java adapters and fixtures                       | `ses_eb608b85effdbBCIsoHfBwtSUY` |
| 16    | `phase-16-a-embed`        | `packages/embed/**`, `examples/embed-docs/**`, `sothspell export`                       | `ses_eb608b85dffeAIjNC7nHDCGSde` |
| 14    | `phase-14-a-translation`  | Schema locale/translations, translation pipeline, locale UI, per-locale narration       | `ses_eb5ed20a8ffeBEXMbEr0EbcVqY` |
| 15    | `phase-15-a-review`       | `packages/review/**`, review API/UI/CLI, regeneration and approval gating               | `ses_eb5ed20a8ffdR416C2wSJRn0Ol` |

Phases 9–13 and 16 are merged and their worktrees and branches were removed after
verification. Phase 14 (translation) and Phase 15 (review UI) are active. Main
owns integration, `plans/**`, `docs/**`, `CONTEXT.md`, and the final
verification for every track. Shared-file edits (`app.ts`, `router.tsx`,
`cli.ts`) were resolved by main at merge.

## Verification

Do not claim completion without fresh verification output.

- Add or update a focused test before implementing a behavior change. When fixing
  a bug, add a specific regression test so it cannot reoccur.
- Prefer real behavior tests over mock-only assertions.
- Test at public seams. Each phase plan lists its proposed seams; confirm them
  before writing the first test for a phase.
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
- `apps/cli/` — `sothspell` CLI (`analyze`, `author`, `serve`, and `doctor`).
- `packages/core/` — tour schema, compiler, source access, validation, IDs.
- `packages/analyzer/` — read-only snapshots, symbols, graph, brief, anchor
  resolution, cache. Phase 13 adds a `LanguageAnalyzer` port for Python, Go,
  Rust, and Java.
- `packages/authoring/` — `GuideModel`, prompts, context packs, curriculum and
  chapter generation, validation, repair, cache, quality report.
- `packages/player/` — framework-free playback state machine.
- `packages/narration/` — browser and ElevenLabs adapters, alignment, cache.
- `packages/diagram/` — diagram IR, validation, ELK layout.
- `packages/harness/` — harness adapter contract; Phase 10 adds the shared
  runtime and the Claude Code and Codex adapters.
- `packages/opencode-plugin/` — OpenCode V2 plugin (Phase 7).
- `examples/bunbun-tour/` — checked-in golden tour pinned to Bunbun `9fef24d`.
- `docs/` — development, architecture, analysis, authoring, player, narration,
  guide, plugin, self-hosting, privacy, accessibility, and troubleshooting.
- `plans/ROADMAP.md` — the next-stage roadmap (Phases 9–16).
- `plans/PHASE-9.md` … `plans/PHASE-16.md` — next-stage phase plans.
- `plans/archive/` — the archived v1 roadmap and Phases 1–8.
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

`pnpm sothspell analyze`, `author`, `serve`, and `doctor` are all available. The
dev server ports are `4319` (API) and `5173` (web); an agent may kill processes
on those ports to free them.

## Domain vocabulary

Use the exact terms in [`CONTEXT.md`](CONTEXT.md): sóþspell, truth story,
project snapshot, revision, chapter, beat, stage, code anchor, code page,
diagram instruction, diagram focus, narration, sentence timing, word timing,
playback mode, run, interlude, guide, authoring pipeline, golden tour, stale
tour, deep link, progress, harness adapter, read-only.

Do not introduce synonyms such as "story," "lesson," "slide," "video," "wiki,"
or "chat" for these concepts in code, tests, or docs.

## Plans and phase docs

- [`plans/ROADMAP.md`](plans/ROADMAP.md) is the hub for the next stage: feature
  inventory, phase sequence, architecture changes, cross-cutting requirements,
  testing standards, and risks.
- `plans/PHASE-9.md` through `plans/PHASE-16.md` are the next-stage phase plans.
  Each has a goal, scope, decisions, waves, test seams, Bunbun acceptance, exit
  criteria, and risks.
- `plans/archive/` holds the v1 roadmap and Phases 1–8, plus an archive index
  that records the shipped baseline and the decisions that stay binding.
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
