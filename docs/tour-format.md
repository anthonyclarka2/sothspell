# Sóþspell Format

A Sóþspell is JSON validated by `packages/core/src/schema.ts` and exported as
draft-2020-12 JSON Schema at
`packages/core/schema/sothspell.schema.json`.

## Shape

- `schemaVersion` — currently `1.0.0`.
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
  "lines": { "start": 1, "end": 8 },
  "contentHash": "sha256:…",
  "label": "Service",
  "language": "typescript",
  "excerpt": "export class Service {…}"
}
```

The compiler resolves the symbol first, falls back to the line hint when the
excerpt hash requires it, and verifies the hash. The API compares the hash with
the live file and shows a stale badge when they differ.

## Stage and diagrams

- A chapter owns diagrams; a beat focuses node and edge IDs.
- Diagram kinds: `architecture`, `dependency`, `flow`, `tree`, `sequence`.
- Node types and edge kinds are controlled; coordinates and colors are derived
  by ELK and the renderer, never by the model.
- Limits: 16 nodes, 24 edges.

## Versioning

- Schema changes require a migration function and a schema version bump.
- Tours are pinned to a project revision; stale anchors are visible, not silently
  rewritten.
- Prompt and model versions are recorded in quality reports.
