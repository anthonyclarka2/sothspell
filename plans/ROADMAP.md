# Sóþspell — Canvas Playback Roadmap (v3)

**Status: planned.** Planning baseline: 2026-10-21. Source brief:
[`CANVAS-FEATURES.md`](CANVAS-FEATURES.md). The spatial reference image was
supplied in the planning session; it is not checked in.

The v1 and v2 eras are archived in [`archive/`](archive/README.md). This
roadmap starts the canvas era: an opt-in playback layout that places the tour
diagram and its code evidence on one spatial canvas, with explicit links,
multiple diagrams, code relationships, full keyboard and screen-reader access,
and export.

The canvas is a viewer feature. It does not change authoring prompts, narration,
the tour format's meaning, or the embed player.

## Owner decisions (2026-10-21)

1. Canvas is an **opt-in playback mode**. The current diagram-and-code stage
   stays the default and remains the embed layout. Canvas can become the default
   only after the performance and accessibility gates pass.
2. Incoming and outgoing links use **symbol-level calls for TypeScript and
   JavaScript**, with import and reference edges for the other analyzers. The UI
   labels the relation kind and confidence; it never presents an import edge as
   a call.
3. PDF export uses **print-to-PDF** with a print-specific layout. PNG and JPG are
   raster captures of the canvas layout.
4. Below 768 px, the canvas becomes a **compact vertical list** with the same
   containers, actions, and relationship text. The spatial canvas returns above
   that width.
5. The v1 and v2 constraints stay binding: pnpm only, TypeScript 7, read-only
   source, local-first defaults, versioned Sóþspell format, accessibility as a
   release gate, and no writes to Bunbun.
6. New runtime dependency: `modern-screenshot` for PNG/JPG capture. PDF adds no
   runtime dependency. Test coverage uses `@vitest/coverage-v8`.
7. Canvas view state is local to the browser. It does not sync through accounts
   in this era.

## Feature inventory

| #   | Feature                                                                    | Phase    |
| --- | -------------------------------------------------------------------------- | -------- |
| 1   | Canvas scene model and deterministic layout                                | Phase 17 |
| 2   | Opt-in canvas view with diagram-to-code evidence links                     | Phase 17 |
| 3   | Multiple diagrams on one canvas                                            | Phase 17 |
| 4   | Canvas controls, fullscreen, and shortcut                                  | Phase 17 |
| 5   | Symbol-aware tour targets and generated-tour repair                        | Phase 18 |
| 6   | Symbol-level call/reference index for TypeScript and JavaScript            | Phase 18 |
| 7   | Incoming and outgoing code containers                                      | Phase 18 |
| 8   | Click any object name to open its definition                               | Phase 18 |
| 9   | Orthogonal connectors with two visual weights (evidence in 17, flow in 18) | 17–18    |
| 10  | Keyboard navigation and shortcut help                                      | Phase 19 |
| 11  | Screen-reader outline and live announcements                               | Phase 19 |
| 12  | Auto-zoom, auto-arrange, undo, and first-run explanations                  | Phase 19 |
| 13  | High contrast, color-blind palette, and 200% text                          | Phase 19 |
| 14  | Compact list fallback below 768 px                                         | Phase 19 |
| 15  | PNG, JPG, and print-to-PDF export                                          | Phase 20 |
| 16  | 60 fps budget, coverage gate, and Playwright matrix                        | Phase 20 |
| 17  | Docs, AGENTS, CONTEXT, and release notes                                   | Phase 20 |
| 18  | Shared-symbol bridge between two open diagrams                             | Phase 18 |

Optional features found during research are listed in
[section 10](#10-optional-features-from-research).

## Phase sequence

```
Phase 17  Canvas foundation
   │
   └──► Phase 18  Code relationships
             │
             └──► Phase 19  Accessible interaction
                       │
                       └──► Phase 20  Export, performance, hardening
```

Phase 19 starts after Phase 18's relation contract and outline extension merge.
Phase 20 depends on Phase 19. The phases are sequential; parallel tracks within
a phase need a non-overlapping file set.
Phase 17 is pointer-complete and baseline-accessible; Phase 19 completes the
keyboard and assistive-technology model. No phase ships a canvas that fails the
axe gate at 0 critical / 0 serious for the states it introduces.

## Status

| Phase | Status                           | Primary outcome                                                          |
| ----- | -------------------------------- | ------------------------------------------------------------------------ |
| 17    | complete (2026-10-21)            | Opt-in canvas, scene layout, evidence links, multiple diagrams, controls |
| 18    | complete (2026-10-21)            | Symbol targets, call/reference index, incoming/outgoing containers       |
| 19    | complete (2026-10-21, automated) | Keyboard model, screen-reader outline, preferences, contrast and text    |
| 20    | planned                          | PNG/JPG/PDF export, performance budget, coverage, docs, final gate       |

## 1. Product direction

The current player splits the stage into a diagram panel and one code panel. That
works for a single evidence excerpt, but it cannot show several diagrams, more
than one code container, or the path from a diagram object to the exact line it
cites. The canvas removes that constraint without changing the tour's meaning;
Phase 18 adds one optional symbol target to the format.

The viewer gets:

- the beat's diagram as the home card;
- one code container per cited anchor, opened from a diagram object or a code
  reference;
- a thin evidence link from the diagram object to the anchor's start line or
  cited range;
- a thicker, fainter flow link from container to container;
- optional additional chapter diagrams on the same board;
- Incoming and outgoing exploration that opens callers or callees as new
  containers, and toggles the layer off again;
- keyboard and screen-reader equivalents for every spatial action;
- PNG, JPG, and print-ready PDF output.

The canvas is not a freeform editor. It is a curated playback board: the tour
decides the diagram and anchors, the user decides what to open and where to put
it, and the board can always return to a deterministic arrangement.

## 2. Domain concepts

These terms are added to [`CONTEXT.md`](../CONTEXT.md) as Phases 17–18 land.

- **Canvas view** — an opt-in playback layout that places the home diagram, code
  containers, and their links on one pannable, zoomable board. It is a view of a
  beat, not a second tour format.
- **Canvas scene** — the pure data model of a canvas view: diagram cards, code
  containers, links, selection, and viewport. It contains no DOM and no React.
- **Diagram card** — a movable container that renders one positioned diagram.
  The beat's diagram is the home card; other chapter diagrams are satellite
  cards.
- **Code container** — a movable container that shows one compiled anchor: its
  symbol, path, line range, highlighted excerpt, and actions. The first code
  container for a beat is its primary evidence.
- **Evidence link** — a thin solid connector from a diagram object to the
  anchor's start line or cited range. It carries one citation.
- **Flow link** — a thicker, fainter connector between two code containers. It
  carries a relation kind (`calls`, `references`, or `imports`) and a
  confidence.
- **Relation index** — the symbol-level graph used by incoming and outgoing
  exploration. It is derived from a snapshot; it never executes project code.
- **Symbol target** — a stable symbol ID attached to a diagram node or code
  anchor. A symbol target lets the canvas open the definition even when the
  current beat does not cite that anchor.
- **Canvas outline** — the semantic text equivalent of the canvas: an ordered
  list of diagrams, objects, containers, and relationships with the same
  actions. It is the screen-reader path and the compact-layout path.
- **View preference** — a local browser preference for canvas behaviour:
  auto-zoom, auto-arrange, reduced motion, contrast, palette, or text scale. It
  is not a connection profile and does not sync.
- **Compact canvas** — the vertical list presentation used below 768 px. It uses
  the same scene and actions with the spatial links rendered as text.
- **Auto-zoom** — the optional viewport change that frames a newly opened
  container with its source. It is undoable and can be disabled from its
  first-run message.
- **Auto-arrange** — the optional deterministic layout that places containers
  after they are opened. It is undoable and can be disabled from its first-run
  message.

## 3. Architecture changes

The v1 and v2 module boundaries stay. The canvas is a view adapter over the
existing compiled tour, plus one new relationship service.

```
packages/canvas       new: scene model, layout, selection reducer, view
                      preferences schema, export model. Pure TypeScript.
packages/core         + optional symbolId on anchors and diagram nodes; schema
                      1.2.0 migration that repairs generated tours.
packages/diagram      + symbolId on positioned nodes; no layout change.
packages/analyzer     + call sites in FileAnalysis, symbol-level `calls` edges in
                      ProjectGraph.edges, and ANALYZER_VERSION 0.4.0. TS/JS
                      resolve calls; other analyzers keep import/reference edges.
packages/authoring    + carry candidate symbol IDs into anchors and diagram
                      nodes; shared artifact writer for tour, snapshot, and
                      project record.
apps/cli              + call the shared artifact writer for authored tours and
                      `analyze --save`.
packages/harness      + call the shared artifact writer in the shared runtime.
apps/api              + bounded canvas relation route; project-record and
                      snapshot resolution; safe excerpt reads for related symbols.
apps/web              + CanvasView, custom React Flow nodes and edges, controls,
                      preferences store, outline, compact view, export actions.
packages/embed        unchanged in this era; the embed keeps the current stage.
packages/player       unchanged; playback remains the clock and state owner.
```

### Why these seams

- `packages/canvas` is a deep module: callers hand it a compiled tour and a beat,
  and get a scene, a layout, and selection transitions. Tests cross that seam
  without React or DOM.
- The canvas does not own playback. The existing `PlayerPage` keeps the playback
  engine, narration, run persistence, and transport. The canvas is a different
  stage body.
- The relation index is an analyzer concern, not a canvas concern. The API
  returns a bounded subgraph and excerpts; the canvas never reads files.
- React Flow is already a web dependency. The canvas reuses it for pan, zoom,
  nodes, edges, subflows, and viewport math. No second graph library.

### Generated-tour repair

Generated tours currently write a symbol ID into `DiagramNode.anchorId`, while
beats normalize their anchors to `beat_..._anchor_n`. The golden tour works
because it was hand-built with matching anchor IDs; generated tours have diagram
nodes that cannot open their cited code. Phase 18 fixes this with an additive
schema field and migration:

- add optional `symbolId` to `DiagramNode` and `CodeAnchor`;
- when a 1.1.0 node's `anchorId` starts with `symbol:`, move it to `symbolId`;
- authoring writes candidate symbol IDs to `symbolId`;
- the canvas resolves `symbolId` to the current beat anchor first, then to the
  relation index;
- keep `anchorId` for explicit anchor references such as the golden tour.

## 4. Interaction and visual grammar

### Layout

- The home diagram sits at the centre of the initial viewport.
- Beat anchors open as code containers to the right of the diagram, in reading
  order. Containers wrap into a second column when needed.
- Incoming containers open to the left; outgoing containers open to the right.
- Satellite diagrams enter as collapsed cards in a diagram tray, not all at
  once. Opening one places it without moving the home card. When two open
  diagrams contain objects with the same symbol target, a dashed bridge badge
  marks the shared symbol and opens one shared code container for both.
- Manual positions snap to an 8 px grid. The board supports pan, wheel zoom,
  pinch zoom, and keyboard zoom.
- The initial layout is deterministic for the same tour, beat, viewport size,
  and preference set. Auto-arrange is an explicit command with undo.

### Links

- Evidence links are 1.5 px solid, one per diagram-object-to-line citation, with
  at least 3:1 contrast against the canvas background.
- Flow links are 4 px and lighter than evidence links, one per
  container-to-container relation. They still meet 3:1 contrast; "fainter" is
  achieved with a muted colour and a wider stroke, not by dropping below the
  contrast floor.
- Both use orthogonal routing with 90-degree corners and an 8 px corner radius.
- A selected container highlights its links and de-emphasizes unrelated links
  and borders. Container text stays at full contrast; unrelated cards are never
  dimmed to the point where their text fails contrast.
- Link labels appear on selection or focus, not permanently. A legend explains
  the two weights, the relation kinds, and static confidence.
- Relation kind is encoded by line style and label as well as colour. Evidence
  is solid; `calls` is solid; `references` is dashed; `imports` is dotted.

### Controls

- Bottom-left: zoom out, zoom percentage, zoom in, reset zoom, fit all, home,
  auto-arrange, fullscreen, outline.
- Top-left: chapter and beat breadcrumb with a Stage/Canvas switch.
- Top-right: display options (contrast, palette, text scale, motion) and export.
- `?` opens a keyboard shortcut sheet.
- The fullscreen button carries the shortcut hint `F`. On entry it pulses for two
  seconds and a dismissible message says: "Full screen. Press F or Esc to
  return." The pulse does not take focus and does not rely on colour alone.
- The shortcuts are: `F` fullscreen, `0` fit all, `1` reset zoom, `+`/`-` zoom,
  `Shift+A` auto-arrange, `Shift+H` home, `?` shortcut sheet, `Escape` step out.
  Arrows and `H`/`J`/`K`/`L` move selection, so they are not reused. Space on a
  button activates it; Space on the board background and `T` pass through to the
  player for playback and theater.

### Motion

- Viewport transitions are 180–240 ms and only animate `transform`.
- Links do not animate continuously. A selected evidence link may draw once.
- `prefers-reduced-motion: reduce` makes viewport changes instant and removes
  draw-on effects.
- Auto-zoom and auto-arrange never move focus. They announce the change and
  offer undo.

### HCI rules

- Overview first, detail on demand: home diagram, then containers, then lines.
- Focus plus context: the selected object keeps its neighbours visible and dims
  the rest.
- Progressive disclosure: collapsed code containers show the symbol and first
  lines; expand for the full excerpt.
- Direct manipulation with a reversible result: drag, zoom, auto-arrange, and
  auto-zoom all have a reset or undo.
- Consistent gestures: wheel zooms, drag on the background pans, drag on a card
  header moves it. Touch uses one finger to pan and two to zoom.
- No hidden gesture is the only path. Every action has a visible control and a
  keyboard path.
- Minimum target size is 24×24 CSS px; primary controls are 32×32.
- Toasts never take focus, never auto-dismiss while hovered or focused, and
  remain available in the shortcut/help panel.

## 5. Cross-cutting requirements

- **Read-only source.** Relation reads use path containment plus an explicit
  redaction check. The existing source route is hardened in Phase 18. No project
  code runs and no package script runs.
- **Security.** The relation route validates the tour, symbol ID, direction,
  limit, and offset. It returns only bounded excerpts. It never returns absolute
  paths, secrets, or unredacted files.
- **Local-first.** Canvas works without an account. The golden tour works with
  the local Bunbun checkout; without it, relations degrade to an explicit
  "relations unavailable" state and the rest of the canvas still works.
- **Format stability.** Schema 1.2.0 is additive. Every 1.0.0 and 1.1.0 tour
  parses through migration; the golden tour is not rewritten unless a new pin is
  approved.
- **Accessibility.** Every canvas state passes axe at 0 critical / 0 serious,
  has a keyboard path, and has a text equivalent in the outline. VoiceOver
  results are required; NVDA is owner-gated on a Windows VM or remote machine.
- **Performance.** The canvas meets the budget in section 7 on the reference
  scene. A failure blocks promotion from opt-in to default.
- **Bundle.** Canvas code is loaded only when the canvas view opens. PNG/JPG
  capture code is loaded only when export opens.
- **No telemetry.** Canvas interactions add no network calls. The relation
  request is the only new API call and it is local.
- **Bunbun read-only.** No command writes into
  `/Users/ajc/Projects/codegens/bunbun`.

## 6. Testing standards

- TDD for the scene, layout, selection reducer, preferences, relation selection,
  and export model. Confirm each seam before the first test.
- Unit tests at the `packages/canvas` public interface. No React internals.
- Analyzer tests for calls, references, imports, ambiguity, recursion, and
  unresolved callees. Bunbun acceptance for real symbol edges.
- API tests through Hono for valid, missing, stale, malformed, oversized, and
  path-escape relation requests.
- Browser tests for every pointer journey: open canvas, click object, open
  container, add diagram, toggle incoming, toggle outgoing, click definition,
  zoom, fit, home, auto-arrange, undo, fullscreen, export.
- Keyboard tests for Tab entry, arrow/HJKL movement, Enter drill-in, Enter
  activate, Escape step-out, `F`, `0`, `1`, `?`, and focus return.
- Screen-reader structure tests: outline order, names, relationship text, live
  region messages, and no focus theft.
- Accessibility tests: axe with WCAG 2.2 A/AA tags on every canvas state;
  forced colours; increased contrast; reduced motion; 200% text; 375, 768, 1024,
  and 1440 widths; light and dark.
- Export tests: PNG and JPG downloads, dimensions, no controls in the capture,
  print media layout, and page-break rules. PDF uses the browser print path and a
  manual checklist.
- Performance: a deterministic 40-node / 40-link scene, 3-second pan/zoom
  sample, p95 frame time, long-task count, and recorded numbers.
- Coverage: `packages/canvas` at ≥90% lines and functions and ≥85% branches;
  analyzer relation code at ≥90% lines; API relation routes at ≥90% lines.
  Playwright covers the interactions; a browser JS coverage report is a
  follow-up, not a gate in this era.
- Bunbun acceptance in Phases 17, 18, 19, and 20, with
  `git -C /Users/ajc/Projects/codegens/bunbun status --porcelain` empty.

## 7. Performance budget

Reference machine: the owner's macOS development machine, Chrome stable,
1440×900 viewport, device scale factor 2. Reference scene: 2 diagrams (32
objects), 8 open code containers, 40 links.

| Metric                                      | Budget       |
| ------------------------------------------- | ------------ |
| Time to interactive canvas after tour fetch | ≤ 250 ms     |
| Pan/zoom p95 frame interval                 | ≤ 16.7 ms    |
| Long tasks during 3 s pan/zoom              | 0 over 50 ms |
| Canvas-specific JS, gzip                    | ≤ 60 KB      |
| Export chunk, gzip                          | ≤ 40 KB      |
| Peak heap during reference scene            | ≤ 150 MB     |

The CI gate uses a generous p95 of 20 ms and a 100 ms long-task ceiling to avoid
machine noise. The owner records the real numbers in `docs/canvas.md`. A CI
failure is investigated, not waived.

Implementation rules:

- Memoize custom node and edge components; keep node data and callbacks stable.
- Use `onlyRenderVisibleElements` for the reference scene and larger boards.
- Do not read the whole nodes array inside node components.
- Keep viewport state out of React render loops; use React Flow's viewport API.
- Render compiled anchor HTML once per container; do not re-highlight on zoom.
- Collapse code containers beyond 24 lines by default.
- Cap open relation containers at 8 per expansion.
- Lazy-load export code and the diagram layout engine.

## 8. Bunbun acceptance

1. Open the golden tour and switch to Canvas.
2. Click a diagram object with an anchor; a code container opens and an evidence
   line reaches the cited line.
3. Add a second chapter diagram to the board.
4. On `beat_write_02`, open the `CommentsService` container. Incoming shows
   `CommentsController.create`; outgoing shows at least one same-class method
   such as `CommentsService.parseText`; both carry the `calls` label.
5. Open `AppModule` from the request-path diagram; the definition opens and
   incoming importers show the `imports` or `references` label. Outgoing may be
   empty; the UI says so.
6. Click an object name without a current-beat anchor; the definition opens as a
   container.
7. Complete the journey with the keyboard only and with the outline.
8. Export the current view as PNG and JPG; open the print layout as PDF.
9. Run axe at 0 critical / 0 serious, forced colours, 200% text, and 375 px.
10. Confirm the Bunbun tree is unchanged.

## 9. Research notes

The design choices below are grounded in current library and accessibility
documentation. Sources are recorded so later work can re-check them.

### Canvas rendering and performance

- React Flow recommends memoized node and edge components, stable callback and
  object references, avoiding whole-node-array reads inside components, hiding
  collapsed node trees, and simplifying styles. It also provides
  `onlyRenderVisibleElements` as an opt-in viewport optimisation.
  [Performance guide](https://reactflow.dev/learn/advanced-use/performance),
  [ReactFlow props](https://reactflow.dev/api-reference/react-flow).
- React Flow's subflow model supports parent and child nodes with
  `parentId`/`extent: 'parent'`, which fits a diagram card with object children.
  [Subflows](https://reactflow.dev/learn/layouting/sub-flows).
- React Flow ships `step` and `smoothstep` edges; a custom edge can add the
  two-weight evidence/flow grammar and rounded 90-degree routing.
  [Edge types](https://reactflow.dev/examples/edges/edge-types).
- DOM nodes keep text selectable and accessible. A raster canvas would be faster
  at extreme scale but would lose semantics; the reference scene is small, so
  DOM plus culling is the right trade.

### Accessibility

- React Flow provides keyboard focus and ARIA roles for nodes and edges, but its
  default arrow keys move a selected node. The canvas needs a container-level
  roving selection model, so it disables that movement and owns the keys.
  [React Flow accessibility](https://reactflow.dev/learn/advanced-use/accessibility).
- A roving `tabindex` keeps one canvas tab stop and moves focus inside with
  arrows, which matches the requested keyboard model.
  [WAI APG keyboard interface](https://www.w3.org/WAI/ARIA/apg/practices/keyboard-interface).
- Complex graphics need a short description plus a long text equivalent. The
  outline is that long equivalent; it is not optional decoration.
  [W3C complex images](https://www.w3.org/WAI/tutorials/images/complex).
- Reflow permits two-dimensional layout for diagrams and canvases, but controls,
  headings, and other non-canvas content must still reflow at 320 CSS px; the
  compact view covers non-canvas content.
  [WCAG 1.4.10](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html).
- Text must survive 200% resizing without clipping or loss.
  [WCAG 1.4.4](https://www.w3.org/WAI/WCAG22/Understanding/resize-text.html).
- Graphical objects and focus indicators need 3:1 contrast; focus appearance
  needs a visible perimeter and contrast against adjacent colours.
  [WCAG 1.4.11](https://www.w3.org/WAI/WCAG21/Understanding/non-text-contrast.html),
  [WCAG 2.4.13](https://www.w3.org/WAI/WCAG22/Understanding/focus-appearance.html).
- Status messages need a live region that exists before the message, and
  auto-dismissing messages must not trap a slow reader. First-run messages stay
  until dismissed, or pause on hover/focus and remain available in help.
  [WCAG 4.1.3](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html),
  [WCAG 2.2.1](https://www.w3.org/WAI/WCAG21/Understanding/timing-adjustable.html).
- `forced-colors` replaces author colours; use system colours and native
  semantics, and do not rely on a separate high-contrast palette as the only
  path. `prefers-contrast: more` is the user's requested increase.
  [MDN prefers-contrast](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@media/prefers-contrast).
- Okabe–Ito is a widely used colour-blind-safe qualitative palette; the canvas
  also uses line style and labels so colour is never the only signal.
  [Okabe–Ito reference](https://conceptviz.app/blog/okabe-ito-palette-hex-codes-complete-reference).
- The Fullscreen API requires a user gesture, reports `fullscreenElement`, and
  exits on Esc; the canvas must sync state from `fullscreenchange` and provide a
  visible return path.
  [MDN Fullscreen API](https://developer.mozilla.org/en-US/docs/Web/API/Fullscreen_API).

### Code relationships and canvas UX

- CodeSee's map documentation describes pan, zoom, file filtering, and
  annotation on an interactive codebase map; the canvas borrows the overview and
  navigation model, not the editor.
  [CodeSee: explore your map](https://docs.codesee.io/docs/explore-your-map).
- Call hierarchy tools present incoming and outgoing calls separately and let a
  user jump to the definition. The two-button model and the "open as container"
  action follow that established pattern.
  [Call Graph Navi](https://dev.to/d_grid_0a2db665ac005538fb/visualize-function-call-graphs-interactively-in-vs-code-call-graph-navi-personal-project-p2h).
- Graph UX guidance recommends predictable layouts, focus and context, filters,
  progressive disclosure, and keyboard support. The canvas uses a deterministic
  home card, dims unrelated links, and caps relation expansion.
  [Cambridge Intelligence: graph UX](https://cambridge-intelligence.com/blog/designing-intuitive-data-experiences-with-graph-visualizations).
- Edge bundling reduces clutter but hides individual relationships; the canvas
  uses a two-weight container-to-container link instead of bundling, and keeps
  the specific evidence link separate.
  [Edge bundling overview](https://blog.tomsawyer.com/force-directed-edge-bundling-for-graph-visualization).
- `modern-screenshot` is an actively maintained fork of `html-to-image` with
  zero dependencies and PNG/JPEG output; it is a better fit than the unmaintained
  `html2canvas` for a Vite browser build.
  [modern-screenshot](https://github.com/qq15725/modern-screenshot).
- Print-to-PDF keeps text selectable and accessible, unlike a rasterised PDF
  built from a screenshot; the browser print path also matches the existing
  accessibility posture.
  [MDN print](https://developer.mozilla.org/en-US/docs/Web/API/Window/print).

## 10. Optional features from research

These are not required by the brief. They are sequenced as follow-ups unless a
phase has spare capacity.

| Feature                       | Value                                         | Priority | Candidate |
| ----------------------------- | --------------------------------------------- | -------- | --------- |
| Minimap                       | Keeps orientation on a large board            | P2       | Phase 20  |
| Container search              | Finds a symbol or path without panning        | P2       | Phase 20  |
| Relation filters              | Hides imports or tests to reduce noise        | P2       | Phase 20  |
| Focus mode                    | Isolates the selected path and hides the rest | P1       | Phase 19  |
| Shareable canvas URL          | Deep-links the open containers and selection  | P2       | Phase 18  |
| Notes on the canvas           | Personal annotations, not part of the tour    | P3       | Later     |
| Multi-select and group        | Bulk arrangement of containers                | P3       | Later     |
| Command palette               | Keyboard-first action discovery               | P2       | Phase 20  |
| "Explain this link" interlude | Asks the guide about a relation               | P3       | Later     |

## 11. Risks and open questions

1. **Static call precision.** Syntax-only analysis misses dynamic dispatch,
   aliases, dependency injection, and cross-package re-exports. The relation
   index records confidence and the UI labels it. A wrong edge must look
   uncertain, not authoritative.
2. **Noise.** A module such as `AppModule` can have many importers, and a service
   such as `CommentsService` can have many callers. The first expansion is capped
   at 8 containers, sorted by path and line, with a "show more" action.
3. **Relations unavailable.** A tour is usable without a source root, but the
   relation buttons need both a snapshot and the local source root to quote
   code. The project record stores the root locally. If it is missing, the
   buttons are disabled with an explanation, not a silent failure. Authoring
   saves the snapshot and the project record to reduce this case.
4. **Schema migration.** The 1.2.0 migration repairs symbol-like `anchorId`
   values. A tour with a real anchor ID that happens to start with `symbol:` is
   ambiguous; the migration only moves it when the document has no anchor with
   that ID.
5. **Hairball.** The board can become unreadable if every relation opens at
   once. The design caps expansions, dims unrelated links, and keeps evidence
   links separate from flow links.
6. **Accessibility of spatial layout.** No automated tool proves screen-reader
   equivalence. The outline is a first-class path. Phase 19 requires VoiceOver
   results and treats NVDA as owner-gated on a Windows VM or remote machine.
7. **60 fps in CI.** Headless timings vary. The CI gate is deliberately looser;
   the real budget is recorded on the reference machine. A regression blocks
   promotion, not the opt-in ship.
8. **Fullscreen variance.** The Fullscreen API is not available in every
   embedding context. The control hides or falls back to theater mode when
   `document.fullscreenEnabled` is false.
9. **Export fidelity.** Fonts, shadows, and transforms can differ in a raster
   capture. The export hides controls, waits for fonts, and pins a screenshot
   test. PDF is print CSS, so it follows the browser's pagination.
10. **Scope.** The optional list is deliberately outside the four phases. Adding
    search, notes, or multi-select mid-phase would weaken the accessibility and
    performance gates.

## 12. Success metrics

- A viewer can switch to Canvas from any beat and back without losing the beat,
  playback position, narration mode, or run progress.
- Clicking a diagram object opens a code container and draws a line to the exact
  cited line; the line is visible in the default zoom and at 200% text.
- Two diagrams can be open at once without overlap or lost selection.
- Incoming and outgoing relations open the correct definition for
  `CommentsService.create` and `CommentsController.create`, with the relation
  kind labelled. `AppModule` demonstrates a definition with import/reference
  relations only.
- The keyboard-only journey in section 6 completes with focus never trapped and
  never lost.
- The outline presents every diagram object and code container in reading order
  with its relationships and actions.
- axe reports 0 critical / 0 serious for every canvas state at 1440, 1024, 768,
  and 375 px, in light, dark, forced-colours, and increased-contrast modes.
- The reference scene meets the performance budget on the owner's machine.
- PNG and JPG downloads match the visible board; print-to-PDF produces a
  readable, selectable-text handout.
- `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, `pnpm test:browser`,
  `pnpm test:a11y`, `pnpm test:canvas:perf`, `pnpm test:coverage`, and
  `pnpm check:toolchain` pass, and Bunbun remains read-only.

## 13. Phase plans

- [Phase 17 — Canvas Foundation](PHASE-17.md)
- [Phase 18 — Code Relationships](PHASE-18.md)
- [Phase 19 — Accessible Interaction](PHASE-19.md)
- [Phase 20 — Export, Performance, Hardening](PHASE-20.md)
