# Archived Plans — v1 (2026-10-17)

These plans describe the first local-first release. They were superseded on
2026-10-17 when the project moved to the next-stage roadmap in
[`../ROADMAP.md`](../ROADMAP.md).

## What was archived

- [`ROADMAP.md`](./ROADMAP.md) — the v1 roadmap: product definition, format,
  architecture, stack, security, testing, and Phases 1–8.
- [`PHASE-1.md`](./PHASE-1.md) — foundation, schema, compiler, golden Bunbun
  tour, minimal player.
- [`PHASE-2.md`](./PHASE-2.md) — read-only analyzer, symbols, graph, brief, CLI.
- [`PHASE-3.md`](./PHASE-3.md) — LLM authoring pipeline.
- [`PHASE-4.md`](./PHASE-4.md) — cinematic player, code browser, runs.
- [`PHASE-5.md`](./PHASE-5.md) — browser/cloud narration and accessibility.
- [`PHASE-6.md`](./PHASE-6.md) — ask interludes, drilldown, progress sync.
- [`PHASE-7.md`](./PHASE-7.md) — OpenCode V2 plugin.
- [`PHASE-8.md`](./PHASE-8.md) — local release and hardening.

## Shipped baseline

All eight phases are complete. The v1 release verification recorded:

- `pnpm typecheck` → 0 errors;
- `pnpm lint` → 0 errors, 0 warnings;
- `pnpm test` → 37 files / 209 tests;
- `pnpm test:browser` → 13 passed;
- `pnpm test:a11y` → 4 passed at 0 critical/serious;
- `pnpm build` → 178.63 kB gzip;
- `pnpm check:toolchain` → TypeScript 7.0.2;
- `pnpm sothspell doctor` → required checks pass;
- the Bunbun tree remains read-only.

## What stays binding

The v1 decisions that the next-stage roadmap continues to honour:

- pnpm only, TypeScript 7, no classic compiler API;
- local-first, loopback-by-default, read-only source access;
- the versioned Sóþspell document and deterministic compiler;
- evidence-anchored code, diagrams, and narration;
- no writes to the Bunbun checkout;
- accessibility as a release gate;
- subagent worktree ownership and sequential merge discipline.
