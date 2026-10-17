# Sóþspell

**Sóþspell** (Old English for "truth story") is an AI-guided walkthrough of a
software project. It explains a codebase from the top down like a film: a
narrator describes the system, diagrams build and change with the story, and the
relevant code is highlighted and linked as each module, class, function, object,
or feature is discussed.

The explanation can play continuously when the user has nothing to ask. The user
can pause at any moment, open the code, click a diagram node, or ask a question;
answering does not lose their place. Progress is recorded so the walkthrough can
resume later.

## Status

**Phase 4 implemented (2026-10-17).** The repository contains:

- a pnpm workspace on TypeScript 7.0.2, React 19, Vite 8, and Hono 4;
- the versioned Sóþspell schema, a generated JSON Schema, and a compiler that
  resolves anchors, hashes excerpts, highlights code with Shiki, and lays out
  diagrams with ELK;
- a checked-in golden Bunbun tour pinned to commit `9fef24d`;
- a read-only repository analyzer with `oxc-parser`: deterministic snapshots,
  symbol extraction, import/reference graphs, NestJS/Prisma signals, a project
  brief, a per-file cache, and the `sothspell analyze` CLI;
- an LLM authoring pipeline: `GuideModel` port, AI SDK adapters, a deterministic
  fixture model, context packs, curriculum planning, chapter/diagram generation,
  validation, bounded repair, caching, quality reports, and the
  `sothspell author` CLI;
- the cinematic player: auto-advance, pause/resume, scrubber, speed, theater
  mode, completed-beat tracking, keyboard control, a virtualized full-file code
  browser with stale badges and anchor outlines, and local-first run progress
  mirrored to a local SQLite table;
- unit, browser, and accessibility tests, including the Bunbun acceptance pass.

Narration (Phase 5), Q&A (Phase 6), the OpenCode plugin (Phase 7), and release
hardening (Phase 8) are planned but not built yet. A reviewed real-model Bunbun
tour is owner-gated on provider credentials; the fixture model verifies the
pipeline offline.

## Quick start

```bash
pnpm install
pnpm dev            # API on 127.0.0.1:4319, web on 127.0.0.1:5173
```

Open <http://127.0.0.1:5173> and play the golden tour. The API reads full files
from `SOTHSPELL_PROJECT_ROOT` (default: the pinned Bunbun checkout) for the code
browser.

Analyze a local repository read-only and author a tour:

```bash
pnpm sothspell analyze /Users/ajc/Projects/codegens/bunbun --brief
pnpm sothspell analyze /Users/ajc/Projects/codegens/bunbun --save
pnpm sothspell author /Users/ajc/Projects/codegens/bunbun --model fixture --out /tmp/bunbun-tour
SOTHSPELL_MODEL=openai/gpt-5.2 pnpm sothspell author /Users/ajc/Projects/codegens/bunbun --out /tmp/bunbun-tour
```

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm test:browser
pnpm test:a11y
pnpm build
pnpm check:toolchain
pnpm schema:json
pnpm tour:build      # regenerate the golden tour from the pinned Bunbun checkout
```

## The shape of the product

- **Website first.** A local-first, self-hosted web player analyzes a local
  repository read-only and plays a generated tour.
- **OpenCode plugin next.** The same tour artifact runs inside the OpenCode V2
  plugin, using the user's configured model and project context.
- **Other harnesses later.** A small `HarnessAdapter` seam keeps the core
  portable without building adapters before they are needed.

Every tour is a **truth story**: code claims are anchored to a pinned project
snapshot, resolved to real symbols, and hashed. The model produces structured
instructions, not HTML or arbitrary diagrams.

## Example project

The first reference project is **Bunbun**, a NestJS + Prisma Next + ATProto
discussion service at commit `9fef24d`. The Bunbun tree is read-only; all
snapshots, tours, audio, and runs live under `SOTHSPELL_HOME` (default
`~/.sothspell`). The checked-in golden tour lives in `examples/bunbun-tour/` and
stores only small, attributed excerpts.

## Documentation

- [Roadmap](plans/ROADMAP.md) — product definition, architecture, format, stack,
  security, testing, risks, and phase sequence.
- [Phase 1](plans/PHASE-1.md) — foundation, schema, compiler, golden tour,
  minimal player.
- [Phase 2](plans/PHASE-2.md) — repository intelligence and symbol graph.
- [Phase 3](plans/PHASE-3.md) — LLM authoring pipeline.
- [Phase 4](plans/PHASE-4.md) — cinematic player and code browser.
- [Phase 5](plans/PHASE-5.md) — narration and accessibility.
- [Phase 6](plans/PHASE-6.md) — semi-interactive guide and progress sync.
- [Phase 7](plans/PHASE-7.md) — OpenCode V2 plugin.
- [Phase 8](plans/PHASE-8.md) — self-hosted release and hardening.
- [Development guide](docs/development.md) — workspace, commands, and the
  golden-tour workflow.
- [Repository analysis](docs/analysis.md) — read-only snapshots, symbols, cache,
  CLI, and project brief.
- [Tour authoring](docs/authoring.md) — model port, context packs, curriculum,
  validation, repair, quality reports, and the author CLI.
- [Player and code browser](docs/player.md) — playback controls, keyboard map,
  virtualized code pages, stale badges, and progress.
- [Authoring skill](skills/sothspell-author/SKILL.md) — the checklist an agent
  uses to author or review a tour.
- [Domain context](CONTEXT.md) — the project glossary.
- [Agent instructions](AGENTS.md) — how agents work in this repository.

## Stack

pnpm 12.14.0 · Node.js 26 · TypeScript 7.0.2 · React 19.3.1 · Vite 8.3.4 ·
TanStack Router 1.170.45 · Hono 4.13.13 · Zod 4.6.7 · Shiki 4.5.0 ·
React Flow 12.12.0 · ELK 0.12.0 · oxc-parser 0.154.0 · fast-glob 3.3.3 ·
ignore 7.0.12 · yaml 2.9.1 · Vercel AI SDK 7.0.143 · Vitest 5.0.5 ·
Playwright 1.64.1 · axe-core 4.14.0.

TypeScript 7.0 has no programmatic compiler API; the analyzer will use
`oxc-parser`, not the TypeScript compiler API. See the roadmap for the full
version table and constraints.

## Similar work

DeepWiki, CodeSee tours/maps, Swimm, VS Code CodeTour, GitDiagram, Scrimba, and
NotebookLM Audio Overviews each solve part of the problem. Sóþspell combines
evidence-anchored code, animated diagrams, narration, semi-interactive Q&A,
resumable progress, and harness-native plugins. The roadmap has the comparison
and sources.

## License

To be decided before the first public release.
