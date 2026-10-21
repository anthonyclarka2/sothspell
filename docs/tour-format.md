# Sóþspell Format

A Sóþspell is JSON validated by `packages/core/src/schema.ts` and exported as
draft-2020-12 JSON Schema at
`packages/core/schema/sothspell.schema.json`.

## Shape

- `schemaVersion` — currently `1.2.0`. `1.0.0` and `1.1.0` still parse and
  migrate forward on read.
- `id`, `title`, `subtitle`, `audience`.
- `project` — slug, name, revision (commit, branch, dirty).
- `chapters` — 1–12 chapters.
  - `diagrams` — one or more diagram instructions.
  - `beats` — one or more beats.
    - `narration`, `durationMs`, `anchors`, `stage`, `suggestedQuestions`.

## Anchors

An anchor is a read-only citation:

```json
{
  "id": "anchor_service",
  "path": "src/service.ts",
  "symbol": "Service",
  "symbolId": "symbol:src/service.ts#Service",
  "lines": { "start": 1, "end": 8 },
  "contentHash": "sha256:…",
  "label": "Service",
  "language": "typescript",
  "excerpt": "export class Service {…}"
}
```

`symbol` is the human-facing qualified name. `symbolId` is the analyzer's
stable symbol target, so the canvas can open the definition even when the beat
only cites a line range. It is optional: an old tour, or an anchor whose symbol
the analyzer cannot name, still parses and plays.

The compiler resolves the symbol first, falls back to the line hint when the
excerpt hash requires it, and verifies the hash. The API compares the hash with
the live file and shows a stale badge when they differ.

## Stage and diagrams

- A chapter owns diagrams; a beat focuses node and edge IDs.
- Diagram kinds: `architecture`, `dependency`, `flow`, `tree`, `sequence`.
- Node types and edge kinds are controlled; coordinates and colors are derived
  by ELK and the renderer, never by the model.
- Limits: 16 nodes, 24 edges.
- A diagram node may carry `anchorId` when it cites an anchor in the same
  document, or `symbolId` when it opens a symbol definition. `symbolId` is
  optional and never replaces a real anchor reference.

## Versioning

- Schema changes require a migration step and a schema version bump. The chain
  is `1.0.0 → 1.1.0` (locale and translations) then `1.1.0 → 1.2.0` (optional
  `symbolId` plus a repair for generated tours).
- The `1.2.0` repair moves a diagram node's `anchorId` to `symbolId` only when
  the value starts with `symbol:` and no anchor in the document has that ID. A
  real anchor reference is preserved.
- Tours are pinned to a project revision; stale anchors are visible, not silently
  rewritten.
- Prompt and model versions are recorded in quality reports.
