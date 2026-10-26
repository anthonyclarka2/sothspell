# Archived Plans — v2 (2026-10-17)

These plans describe the second stage: from a single-user local player to a
multi-harness, multi-language, collaborative platform. They were completed on
2026-10-17 and archived on 2026-10-21. The 0.2.0 release notes are in
[`../../../docs/release-notes.md`](../../../docs/release-notes.md).

## What was archived

- [`ROADMAP.md`](./ROADMAP.md) — the v2 roadmap: feature inventory, phase
  sequence, architecture changes, cross-cutting requirements, testing
  standards, and risks.
- [`PHASE-9.md`](./PHASE-9.md) — preferences UI and connection profiles.
- [`PHASE-10.md`](./PHASE-10.md) — harness adapter contract, Claude Code and
  Codex adapters.
- [`PHASE-11.md`](./PHASE-11.md) — public GitHub import with a shallow-clone
  sandbox.
- [`PHASE-12.md`](./PHASE-12.md) — GitHub OAuth accounts and cross-device run
  sync.
- [`PHASE-13.md`](./PHASE-13.md) — Python, Go, Rust, and Java analyzers.
- [`PHASE-14.md`](./PHASE-14.md) — locale-aware tours and the translation
  pipeline.
- [`PHASE-15.md`](./PHASE-15.md) — human review, regeneration, and approval.
- [`PHASE-16.md`](./PHASE-16.md) — embeddable player and export command.

## Shipped baseline

All eight phases are complete. The final gate recorded:

- `pnpm test` → 98 files / 810 tests;
- `pnpm test:browser` + `pnpm test:a11y` → 57 passed, including 20 embed
  browser tests;
- `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm check:toolchain`, and
  `pnpm sothspell doctor` clean;
- the Bunbun tree unchanged.

Owner-gated paths that remain unverified with live credentials: real provider
calls, real Claude Code/Codex/OpenCode sessions, and real GitHub OAuth.

## What stays binding

The v1 constraints continue: pnpm only, TypeScript 7, no classic compiler API,
read-only source, local-first defaults, the versioned Sóþspell format,
accessibility as a release gate, and the Bunbun checkout untouched. See the
[archive index](../README.md#what-stays-binding).
