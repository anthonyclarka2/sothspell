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

**v1 release complete (2026-10-17); next stage in progress.**
The repository contains:

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
- narration: browser speech and opt-in ElevenLabs cloud narration with aligned
  timings, content-addressed audio, range serving, and fallback;
- in-tour questions with cited answers, drilldown generation, and a
  `sothspell serve`/`doctor` local runtime;
- the OpenCode V2 plugin with commands, tools, typed RPC, a host model adapter,
  generated-tour serving, and an embedded-host smoke test;
- unit, browser, accessibility, and plugin tests, including the Bunbun
  acceptance pass.

The v1 plans are archived in [`plans/archive/`](plans/archive/README.md). The
next stage is in [`plans/ROADMAP.md`](plans/ROADMAP.md): preferences UI, Claude
Code and Codex harness plugins, GitHub import, accounts and sync,
Python/Go/Rust/Java analyzers, and the embeddable player are complete; the
review UI is complete; multi-language narration and translation is in progress.
A reviewed real-model Bunbun tour and live cloud narration remain owner-gated on
provider credentials; fixture and browser paths are verified.

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
- **OpenCode plugin shipped.** The same tour artifact runs inside the OpenCode V2
  plugin, using the user's configured model and project context.
- **More harnesses next.** Phase 10 adds Claude Code and Codex behind the
  `HarnessAdapter` seam, then the remaining agent CLIs.

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

- [Roadmap](plans/ROADMAP.md) — next-stage feature inventory, phase sequence,
  architecture changes, security, testing standards, and risks.
- [Archived v1 plans](plans/archive/README.md) — the first-release roadmap and
  Phases 1–8, with the shipped baseline.
- [Architecture](docs/architecture.md) — packages, pipeline, trust boundaries,
  and storage.
- [Tour format](docs/tour-format.md) — the document, anchors, diagrams, and
  versioning.
- [Phase 9](plans/PHASE-9.md) — preferences UI for authoring and narration
  connections.
- [Phase 10](plans/PHASE-10.md) — Claude Code and Codex harness plugins.
- [Phase 11](plans/PHASE-11.md) — public GitHub import with sandboxed cloning.
- [Phase 12](plans/PHASE-12.md) — GitHub OAuth accounts and cross-device sync.
- [Phase 13](plans/PHASE-13.md) — Python, Go, Rust, and Java analyzers.
- [Phase 14](plans/PHASE-14.md) — multi-language narration and translation.
- [Phase 15](plans/PHASE-15.md) — human review UI for generated tours.
- [Phase 16](plans/PHASE-16.md) — embeddable player for documentation sites.
- [Development guide](docs/development.md) — workspace, commands, and the
  golden-tour workflow.
- [Repository analysis](docs/analysis.md) — read-only snapshots, symbols, cache,
  CLI, and project brief.
- [Tour authoring](docs/authoring.md) — model port, context packs, curriculum,
  validation, repair, quality reports, and the author CLI.
- [Player and code browser](docs/player.md) — playback controls, keyboard map,
  virtualized code pages, stale badges, and progress.
- [Narration](docs/narration.md) — browser and cloud speech, synchronization,
  caching, and privacy.
- [Guide and interludes](docs/guide.md) — in-tour questions, citations,
  drilldown, and progress.
- [OpenCode plugin](docs/opencode-plugin.md) — install, commands, tools, RPC,
  and the host model adapter.
- [Harnesses](docs/harnesses.md) — the adapter contract and the Claude Code and
  Codex adapters.
- [Settings and connection profiles](docs/settings.md) — provider profiles, the
  secret store, and resolution rules.
- [GitHub import](docs/import.md) — URL forms, sandbox limits, and the import
  API/UI/CLI.
- [Accounts and sync](docs/accounts.md) — GitHub OAuth, sessions, sync merge
  rules, export, and delete.
- [Embeddable player](docs/embed.md) — export, the host API, progress, CSP, and
  the docs fixture.
- [Human review](docs/review.md) — the review state machine, editing,
  regeneration, anchor gating, and decisions.
- [Self-hosting](docs/self-hosting.md) — install, serve, storage, and upgrades.
- [Privacy](docs/privacy.md) — what stays local and what cloud choices send.
- [Accessibility](docs/accessibility.md) — the axe gate and keyboard map.
- [Troubleshooting](docs/troubleshooting.md) — common local failures.
- [Release notes](docs/release-notes.md) — the first release and limitations.
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
