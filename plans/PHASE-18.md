# Phase 18 — Code Relationships

**Status: complete (2026-10-21).** Planning baseline: 2026-10-21. Depends on:
Phase 17.

## Goal

Make the canvas explain code relationships. A viewer can click any object with a
known symbol to open its definition, then use **Incoming** and **Outgoing** to
open the code that calls it or the code it calls. Relations are truthful about
their kind and confidence.

This phase also repairs the generated-tour symbol target gap so diagram clicks
work for authored tours, not only the hand-built golden tour.

## Scope

### In

- Tour schema 1.2.0:
  - optional `symbolId` on code anchors and diagram nodes;
  - a migration chain from 1.0.0 and 1.1.0;
  - a repair that moves symbol-like `DiagramNode.anchorId` values to
    `symbolId`;
  - compiled anchors and positioned diagram nodes carry the field.
- Authoring carries candidate symbol IDs into anchors and diagram nodes.
- One shared save operation writes `tour.json`, `quality.json`, `snapshot.json`
  at the existing slug-level path, and a local `project.json` with the source
  root. The API, CLI, harness runtime, and `analyze --save` all call it.
- Analyzer symbol edges:
  - `FileAnalysis.callSites` for TypeScript and JavaScript, cached per file;
  - project-level resolution for local functions, methods, imported bindings,
    and typed `this` members;
  - `ProjectGraph.edges` gains a `calls` kind with optional call-site line;
  - unresolved callees are dropped and counted, never guessed;
  - `ANALYZER_VERSION` bumps to 0.4.0.
- A bounded canvas relation service and route that returns:
  - one symbol definition with a highlighted excerpt;
  - incoming or outgoing containers, capped at 8;
  - relation kind and confidence per container;
  - a truncation flag and a total byte cap.
- Canvas UI:
  - Incoming and Outgoing toggle buttons on every code container, with
    `aria-pressed` and hide-on-second-press behaviour;
  - relation containers placed left for incoming and right for outgoing;
  - flow links between the source container and each related container;
  - a relation legend and static-confidence label;
  - definition links from diagram objects and container symbol headers;
  - a bounded `identifierTargets` payload for safe future inline linking. Safe
    in-text annotation is deferred; diagram objects and container headers open
    definitions now.
  - a shared-symbol bridge between two open diagrams, so a symbol present in
    both opens one shared code container.
- Loading, empty, unavailable, stale, and error states. Relation failure never
  breaks canvas playback.
- Golden Bunbun acceptance for at least one proven call edge and one reference
  edge.

### Out

- Full call graphs for Python, Go, Rust, and Java. Those adapters keep their
  import and reference edges, labelled as such.
- Cross-package re-export resolution beyond the existing import bindings.
- Runtime or dynamic dispatch analysis.
- Recursive expansion without user action.
- Graph search, filters, and saved relations. Those are optional follow-ups.
- Relations in the embed bundle. The embed has no relation buttons in this era.

## Decisions

1. **One graph field, not two.** `ProjectGraph.edges` already carries
   module-to-module `imports` and module-to-exported-symbol `references` edges.
   Add `calls` rather than a second parallel edge array. `contains` is declared
   in the type but is not emitted today; the canvas does not depend on it.
2. **Syntax only.** The analyzer never asks the TypeScript compiler for types.
   Calls resolve through lexical scope, imports, field/parameter type
   annotations, and same-class members. Ambiguity is dropped or marked with
   import confidence.
3. **Truthful labels.** A call edge says `calls`; an imported binding says
   `references`; a module import says `imports`. The UI does not call every edge
   a call.
4. **Definition first.** The symbol definition endpoint is separate from the
   relation endpoint so a diagram object can open its definition even when it has
   no incoming or outgoing edges.
5. **Bounded response.** One request returns at most 8 containers and 64 KiB of
   excerpt HTML. "Show more" is an explicit user action with an offset.
6. **Snapshot plus source root.** Authoring writes the snapshot at the existing
   slug-level path and a local `project.json` with the source root. Existing tours
   resolve the root from that record or a configured project root. The snapshot
   alone cannot supply excerpts. Tours created before the record existed show
   relations unavailable until they are re-authored or a root is configured. If
   no root is available, relations are explicitly unavailable.
7. **Old tours keep working.** A tour without `symbolId` falls back to exact
   symbol name plus path. If that is ambiguous, the definition action is hidden.
8. **No cascade.** Opening incoming or outgoing does not recursively open the
   next level. Each container has its own buttons, so the user controls growth.
9. **No embed work.** Canvas is a web-player view. The embed keeps the current
   stage and has no relation endpoint dependency.

## Waves

### Wave 1 — Schema 1.2.0 and generated-tour repair

- Add `symbolId` to `CodeAnchorSchema` and `DiagramNodeSchema`.
- Add `SCHEMA_VERSION = '1.2.0'`; keep 1.0.0 and 1.1.0 supported.
- Replace the single-step migration with a chain:
  - 1.0.0 → 1.1.0 adds locale and translations;
  - 1.1.0 → 1.2.0 adds optional `symbolId` and repairs symbol-like node
    `anchorId` values.
- Repair rule: move `anchorId` to `symbolId` only when the value starts with
  `symbol:` and no anchor with that ID exists in the document.
- Authoring: `anchorFor` sets `symbolId` from the candidate ID; assembled diagram
  nodes set `symbolId` from the draft candidate and drop the candidate-shaped
  `anchorId`.
- Compiler: `CompiledAnchor.symbolId` and `PositionedNode.symbolId`.
- Regenerate `packages/core/schema/sothspell.schema.json` with
  `pnpm schema:json`; add it to the phase gate.
- Tests: 1.0.0 and 1.1.0 migrations, generated tour round-trip, explicit anchor
  IDs preserved, golden tour unchanged, translation preserves symbol IDs, and the
  exported JSON Schema reports 1.2.0.
- Seam: `parseSothspell` and `compileSothspell`.

### Wave 2 — Symbol call edges and snapshot persistence

- Extend `FileAnalysis` with optional `callSites`:
  `{ fromQualifiedName, callee, member, line }`. A call site is unresolved syntax
  and stays cached per file.
- Track function, method, arrow-function, and class containers while walking the
  TypeScript/JavaScript AST, so a call has a stable caller symbol.
- Resolve after all files are analyzed, in `buildSourceAnalysis`:
  - same-file symbol;
  - same-class method;
  - `this.member` where the member is a class field, constructor parameter
    property, or method with a resolvable type;
  - imported binding to an exported symbol;
  - otherwise drop and count.
- Follow constructor parameter property types such as
  `private readonly service: CommentsService` and imported class types. A member
  name alone is not enough; without a resolvable type, drop the edge.
- Add `calls` to `GraphEdgeKind`; include optional `atLine`.
- Add optional `line` to `FileImport` and import/reference edges so an importer
  container can point at the import statement, not only the caller definition.
  Only the TS/JS adapter fills it; other adapters leave it undefined.
- Add `unresolvedCalls` to `AnalysisStats` and assert it in an analyzer test.
- Deduplicate edges by `from`, `to`, `kind`, and call line. Sort deterministically.
- Bump `ANALYZER_VERSION` to 0.4.0 so caches invalidate.
- Split the shared artifact writer, for example in
  `packages/authoring/src/save.ts`:
  - `saveAnalysisArtifacts({ home, snapshot, sourceRoot, sourceKind })` writes
    `projects/<slug>/snapshot.json` and `project.json`;
  - `saveTourArtifacts({ home, document, quality, snapshot, sourceRoot, sourceKind, destination })`
    writes the analysis artifacts plus the tour at a file or directory
    destination.
- `analyze --save` uses the analysis writer. The API, CLI, and harness use the
  tour writer and honor `author --out <file>` and `--out <dir>`.
- Call the writer from `apps/api/src/authoring-service.ts`,
  `apps/cli/src/cli.ts`, and `packages/harness/src/runtime.ts`. A CLI- or
  harness-authored tour must not be the one case without a project record.
- Tests: local function call, method call, typed `this` call, constructor
  injection, imported call, aliased import, unresolved callee count, recursive
  call, duplicate call sites, optional import line, and deterministic order.
  Bunbun test counts calls and verifies `CommentsController.create` →
  `CommentsService.create` and `CommentsService.create` → a same-class method.
- Tests: API, CLI (`--out` file and directory), harness, and `analyze --save`
  each produce the expected snapshot and project record; an existing record
  updates atomically.
- Seam: `analyzeProject` output and the shared writer.

### Wave 3 — Relation service and route

- New `packages/analyzer/src/relations.ts` pure selector:
  `selectSymbolRelations(snapshot, symbolId, direction, limit, offset)`. The
  browser never receives a snapshot.
- New API service:
  - resolve the project root from `projects/<slug>/project.json` or the
    configured golden root, in that order;
  - load `projects/<slug>/snapshot.json` only when its `analyzerVersion` matches
    `ANALYZER_VERSION`; otherwise re-analyze the root once;
  - cache by canonical root, fingerprint, and analyzer version;
  - resolve a symbol by ID, or by exact path plus qualified name for old tours;
  - check `snapshot.files[].redacted` before reading an excerpt; return 409 for a
    redacted path;
  - build a transient anchor for the symbol with a hash and a capped excerpt;
  - for call edges, centre the caller excerpt on the call site; for
    import/reference edges, centre the importer excerpt on the import line;
  - return definition, incoming, or outgoing payloads, including a bounded
    `identifierTargets` list (`{ text, symbolId, path }`) for the excerpt so the
    client can annotate exact identifiers without receiving a snapshot.
- Extend the existing project source route to resolve authored and imported
  projects through the same project record, so "Open code page" works beyond the
  golden tour. The route must receive the tour ID, resolve that tour's project
  root, and pass the resolved root to `sourcePayload` instead of the global
  `projectRoot`.
- Thread `tourId` through the web path: add it to the code-page search schema,
  include it in the `CodePane` link, pass it to `fetchAnchor`, and send it as a
  query value. Validate that the tour's project slug matches `projectId`.
- Harden the existing `/api/projects/:projectId/source` route to refuse redacted
  files. This is a pre-existing gap; the relation route must not copy it.
- Routes:
  - `GET /api/tours/:tourId/canvas/symbol?symbolId=<url-encoded-id>` for a
    definition;
  - `GET /api/tours/:tourId/canvas/relations?symbolId=<url-encoded-id>&direction=incoming|outgoing&limit=8&offset=0`.
  - Symbol IDs contain `:` and `/`, so they travel as query values, not path
    segments.
- The route validates the tour, symbol ID, direction, limit, and offset. It
  returns 404 for unknown symbols, 409 for unavailable relations or redacted
  sources, and 400 for malformed input.
- Reuse path containment; never return an absolute path or a secret. Cap excerpt
  bytes and symbol count.
- Tests: valid definition, valid incoming, valid outgoing, call/reference
  precedence, unknown symbol, missing snapshot with and without a root, stale
  snapshot version, redacted path, path escape, oversized response, and
  deterministic order. Add a source-route regression test for a redacted file and
  an authored/imported code-page test that proves the correct tour and root are
  used.
- Seam: Hono route through `createApp` with a fixture project and a fake service.

### Wave 4 — Relation containers and definition links

- Code container header: symbol name, path:lines, language, Incoming, Outgoing,
  Open code page, and collapse.
- Incoming opens containers on the left; outgoing on the right. Reuse an
  existing container instead of duplicating it.
- Incoming and Outgoing are toggle buttons. The active state uses `aria-pressed`.
  Each relation container records which toggles opened it; turning one off hides
  only containers and flow links with no remaining active owner. A container
  opened manually stays open. Turning a toggle on again reuses containers that
  are still open.
- Flow links use the Phase 17 scene model: 4 px and lighter than evidence, with
  at least 3:1 contrast; relation kind is encoded by line style and label.
- Relation legend: evidence, calls, references, imports, static confidence.
- Definition links:
  - diagram object with `symbolId` opens or focuses its definition container;
  - container symbol header opens the definition;
  - old tours resolve exact path plus symbol name;
  - ambiguous or missing targets are hidden with an accessible explanation.
- Extend the Phase 17 outline with Incoming/Outgoing toggles and relation
  containers, so every Phase 18 spatial action has a text equivalent before
  Phase 19 expands the outline.
- Identifier targets: the API returns exact matches, capped at 50 per container;
  in-text annotation is deferred until safe markup rendering exists. Diagram
  objects and container headers already open definitions.
- Shared-symbol bridge: when two open diagrams contain objects with the same
  `symbolId`, mark both objects with a dashed bridge badge and open one shared
  code container from either. If the tours have no `symbolId`, fall back to a
  shared anchor ID.
- Loading state is a skeleton container; empty state says "No incoming calls
  found" or "No outgoing calls found" by direction; unavailable state says why;
  error state is inline and retryable.
- Tests: definition/relation payload includes a bounded identifier target list;
  no snapshot crosses the API; incoming opens left and unique; outgoing opens
  right; toggling off hides only its own unowned set; overlapping incoming and
  outgoing sets share a container without one toggle hiding it; outline exposes
  the relation toggles; flow edge kind and label; reuse; no cascade; definition
  from diagram; definition from header; identifier target payload; shared-symbol
  bridge; unavailable state; keyboard activation of buttons.
- Seam: canvas fixture with a fake relation service in Playwright.

### Wave 5 — Bunbun acceptance and docs

- Use `CommentsService.create` for the call journey: incoming from
  `CommentsController.create`, outgoing to a same-class method. Use `AppModule`
  for the import/reference journey. A reference-only acceptance is not enough;
  if the call edge is missing, the analyzer has a defect.
- Confirm generated tours from `examples/tiny-notes` open diagram definitions.
- Update `docs/analysis.md` for calls and confidence, `docs/tour-format.md` for
  schema 1.2.0, and `docs/canvas.md` for the relation model.
- Record the first relation request latency and payload size.
- Confirm the Bunbun tree is unchanged.

## Test seams

- Schema migration through `parseSothspell`.
- Analyzer through `analyzeProject` on a fixture and on Bunbun.
- Relation selection as a pure function over a snapshot.
- Relation routes through `createApp`.
- Canvas relation UI through a fake service in Playwright.
- Golden tour through the real Bunbun checkout when present; skip cleanly when
  absent.

## Bunbun acceptance

1. Open the golden tour in Canvas on `beat_write_02`.
2. Open the `CommentsService` container from the diagram.
3. Click Incoming; `CommentsController.create` opens to the left with a `calls`
   label.
4. Click Outgoing; at least one same-class method opens to the right with a
   `calls` label.
5. Open `AppModule` on `beat_request_02`; the definition opens and incoming
   importers show `imports` or `references`, not `calls`.
6. Open a definition from a container header and from a diagram object.
7. Confirm no request returns a whole file, an absolute path, or a redacted file.
8. Confirm the Bunbun tree is unchanged.

## Exit criteria

- Generated tours open diagram definitions; the golden tour still works.
- Schema 1.2.0 parses both older versions and the golden tour unchanged; the
  generated JSON Schema and `docs/tour-format.md` report 1.2.0.
- `analyzeProject` emits deterministic call edges for TS/JS, including a proven
  Bunbun call edge.
- Incoming and outgoing open the correct containers, with honest relation kinds.
- Relation requests are bounded, tested for path containment and redaction, and
  never return unredacted or absolute paths.
- A missing snapshot, stale snapshot version, or project root produces a usable
  unavailable state.
- "Open code page" works for an authored or imported project, not only Bunbun.
- The minimal Phase 17 outline survives the Phase 19 expansion without losing
  its actions.
- `pnpm schema:json` regenerates a 1.2.0 schema with no unexpected diff.
- `pnpm typecheck`, `pnpm lint`, `pnpm test`, and the canvas browser tests pass.
- Analyzer relation and route coverage are ≥90% lines.
- Bunbun remains read-only.

## Risks

- **Call resolution false positives.** A same-name method on another class can
  look like a call. Require a class or import binding match before emitting a
  call; otherwise drop or downgrade to reference.
- **Analyzer cost.** Bunbun analysis already runs in tests. The relation route
  must cache by snapshot and never re-analyze on every click.
- **Snapshot drift.** A saved snapshot may be older than the tour or produced by
  an older analyzer. Reject a snapshot whose `analyzerVersion` differs and
  re-analyze; return the revision and show a stale badge when it differs from the
  tour.
- **Missing source root.** A snapshot cannot generate excerpts by itself. The
  local `project.json` is the source of truth for the root; it never belongs in a
  shareable tour. An imported project gets a project record when it is authored.
- **Redaction gap.** The existing source route reads files directly. Harden it in
  this phase and test a redacted path before shipping the relation route.
- **Generated tours.** The repair rule must not move a legitimate anchor ID.
  Only move values that start with `symbol:` and have no matching anchor.
- **HTML size.** Eight relation containers with full excerpts can exceed the
  payload cap. Cap lines per excerpt and return a truncation flag.
- **Embed divergence.** The embed has no relation buttons. Keep the canvas view
  web-only and document the difference.

## Working style

- Use `tdd` for schema migration, call resolution, relation selection, and routes.
- Use `codebase-design` for the relation service interface; the canvas should
  call one small `loadRelations` operation, not assemble graph queries itself.
- Use `domain-modeling` for the relation vocabulary (`calls`, `references`,
  `imports`, confidence) and update `CONTEXT.md` before code.
- Use `design-taste-frontend` for the relation legend and container actions.
- Verify with a real Bunbun checkout and with the fixture project when Bunbun is
  absent.
- Record the relation payload size and latency in `docs/canvas.md`.

## Shipped (closure, 2026-10-21)

- **Schema 1.2.0** — optional `symbolId` on anchors and diagram nodes, a
  1.0.0 → 1.1.0 → 1.2.0 migration chain, and the generated-tour repair that
  moves symbol-shaped node `anchorId` values into `symbolId`. The checked-in
  JSON Schema and `docs/tour-format.md` report 1.2.0.
- **Authoring** — candidate symbol IDs reach anchors and diagram nodes; the
  shared `saveTourArtifacts` / `saveAnalysisArtifacts` writer stores the
  snapshot and local `project.json` for the API, CLI, harness, and
  `analyze --save`.
- **Analyzer 0.4.0** — `callSites`, typed `this` and constructor-injection
  resolution, import/reference lines, `unresolvedCalls`, and `calls` edges. On
  Bunbun: 6,642 call edges and 22,923 unresolved calls. Also fixed OXC source
  offsets for files with non-ASCII text.
- **Relation API** — one bounded `/api/tours/:tourId/canvas/symbol` route for
  definitions, incoming, and outgoing relations; project-record root
  resolution; snapshot version checks; redaction checks; 8-container / 64 KiB
  caps and a 16 KiB per-excerpt cap.
- **Source route** — accepts `tourId`, resolves the authored/imported project
  root, validates the project slug, and returns 409 for redacted files.
- **Web canvas** — Incoming/Outgoing toggles with ownership and reuse,
  orthogonal flow edges, relation labels and legend, definition links from
  symbols and objects, loading/empty/unavailable/error states, shared-symbol
  bridge, and outline actions.
- **Golden fallback** — tours without `symbolId` use a stable
  `legacy:<path>#<symbol>` target that the server resolves against the snapshot,
  so the golden Bunbun tour opens real relations without regeneration.

### Closure verification (fresh, 2026-10-21)

- `pnpm test`: 120 files / 987 tests passed.
- `pnpm typecheck`, `pnpm lint`, and `pnpm build` clean.
- `SOTHSPELL_WEB_PORT=5275 SOTHSPELL_API_PORT=4317 pnpm test:browser`:
  90 passed.
- Live Bunbun journey: `CommentsService.create` Incoming shows
  `CommentsController.create`; Outgoing shows `CommentsService.parseText`;
  both are `calls` edges; no absolute source root in the page.
- API route tests cover definition, incoming, outgoing, limit/offset,
  truncation, unavailable, stale snapshot, redaction, and path escape.
- Bunbun tree clean.

### Follow-ups

- In-text identifier links are not rendered yet. The API returns a bounded
  `identifierTargets` list; safe inline annotation remains a Phase 19/20
  follow-up. Diagram objects, container headers, and the outline already open
  definitions.
- Relation latency and payload size still need recording in `docs/canvas.md`
  during Phase 20 hardening.
