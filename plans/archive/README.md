# Archived Plans

Completed plan eras, kept for the decisions and shipped evidence they record.
Active plans live in [`../`](../).

| Era | Dates      | Outcome                                                                     | Archive                 |
| --- | ---------- | --------------------------------------------------------------------------- | ----------------------- |
| v1  | 2026-10-17 | Local-first release: schema, analyzer, authoring, player, narration, plugin | [`v1/`](./v1/README.md) |
| v2  | 2026-10-17 | Multi-harness, multi-language, collaborative platform: Phases 9–16          | [`v2/`](./v2/README.md) |

## What stays binding

Both eras keep these constraints, and the current stage inherits them:

- pnpm only, TypeScript 7, no classic compiler API;
- local-first, loopback-by-default, read-only source access;
- the versioned Sóþspell document and deterministic compiler;
- evidence-anchored code, diagrams, and narration;
- no writes to the Bunbun checkout;
- accessibility as a release gate;
- subagent worktree ownership and sequential merge discipline.

Each era's README records its shipped baseline and the decisions that remain
relevant to later work.
