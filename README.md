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

**Planning.** This repository currently contains the roadmap, phase plans, domain
glossary, and agent instructions. No application code has been scaffolded yet.
The first implementation phase starts at [`plans/PHASE-1.md`](plans/PHASE-1.md).

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
- [Domain context](CONTEXT.md) — the project glossary.
- [Agent instructions](AGENTS.md) — how agents work in this repository.

## Stack (planned)

pnpm 12.14.0 · Node.js 26 · TypeScript 7.0.2 · React 19.3.1 · Vite 8.3.4 ·
TanStack Router 1.170.45 · Hono 4.13.13 · Zod 4.6.7 · Vercel AI SDK 7.0.143 ·
Shiki 4.5.0 · React Flow 12.12.0 · ELK 0.12.0 · better-sqlite3 13.0.3 ·
Vitest 5.0.5 · Playwright 1.64.1 · axe-core 4.14.0 · `@opencode/plugin` 2.0.32.

TypeScript 7.0 has no programmatic compiler API; the analyzer uses `oxc-parser`,
not the TypeScript compiler API. See the roadmap for the full version table and
constraints.

## Similar work

DeepWiki, CodeSee tours/maps, Swimm, VS Code CodeTour, GitDiagram, Scrimba, and
NotebookLM Audio Overviews each solve part of the problem. Sóþspell combines
evidence-anchored code, animated diagrams, narration, semi-interactive Q&A,
resumable progress, and harness-native plugins. The roadmap has the comparison
and sources.

## License

To be decided before the first public release.
