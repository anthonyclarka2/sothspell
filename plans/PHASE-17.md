# Phase 17 — Canvas Foundation

**Status: complete (2026-10-21).** Planning baseline: 2026-10-21. Depends on:
the v1 player, the v2 embed decision, and the compiled tour.

## Goal

Ship an opt-in canvas view that places the beat diagram and its code evidence on
one pannable, zoomable board. A viewer can open a code container from a diagram
object, add a second diagram, frame the board, go fullscreen, and return to the
existing stage without losing playback state.

This phase proves the spatial model. It does not add incoming/outgoing
relationships, the full keyboard model, or export.

## Scope

### In

- A new `packages/canvas` package with a pure scene model, deterministic layout,
  viewport math, and a selection reducer.
- An opt-in canvas view in `apps/web`, selected by `?view=canvas` on the existing
  player route. The Stage/Canvas switch preserves the beat, playback position,
  narration state, and run progress.
- The beat's diagram as a home card. Diagram objects are canvas nodes inside the
  card, so an object can own a connector handle.
- Code containers for the beat's compiled anchors, collapsed to 24 lines by
  default, with the symbol/path/line header and an "Open code page" action. The
  action is hidden when the source route cannot resolve the tour's project; the
  link carries the tour ID.
- Evidence links from a diagram object to the anchor's start line or cited range,
  using orthogonal routing with 8 px rounded corners.
- Multiple diagrams: a tray of the chapter's other diagrams; opening one adds a
  satellite card. Home returns to the beat diagram.
- A minimal canvas outline: an ordered text list of the home diagram, its
  objects, the open code containers, and their actions. Phase 19 adds relation
  counts and the full screen-reader model.
- Canvas controls: zoom out, zoom percentage, zoom in, reset zoom, fit all, home,
  auto-arrange, fullscreen, outline toggle, and a shortcut sheet.
- Fullscreen through the Fullscreen API with `F` as the shortcut, a two-second
  button pulse, and a dismissible return hint. If fullscreen is unavailable, the
  control hides and a theater-mode fallback is offered.
- Follow-beat behaviour: a beat change swaps the home diagram and focuses the
  beat's objects. Containers the user opened stay open when their anchor still
  exists. A visible "Follow beat" toggle pauses that behaviour.
- Baseline accessibility: all Phase 17 actions have a focusable control or a
  native button path, semantic names, visible focus, a live region for state
  changes, and axe at 0 critical / 0 serious.
- At widths below 768 px, Phase 17 keeps the existing Stage and explains that
  the compact canvas arrives in Phase 19. No spatial canvas is forced on a phone
  before the compact layout exists.

### Out

- Incoming/outgoing relationships and the relation index.
- Symbol-target schema changes and the generated-tour repair.
- The full arrow/HJKL container navigation model and the relation-aware
  screen-reader outline. Phase 17 ships a minimal text outline.
- Auto-zoom, auto-arrange preferences, first-run coach marks, and undo toasts.
  Phase 17 ships auto-arrange as a manual command without a preference.
- High-contrast, colour-blind, and 200% text modes beyond what the existing
  design tokens already provide.
- PNG, JPG, and PDF export.
- Canvas in the embed bundle.
- Freeform notes, multi-select, search, and minimap.

## Decisions

1. **View, not route.** Canvas is a search parameter on the existing player
   route, so deep links, run persistence, and the transport keep working. A
   separate route would duplicate playback and narration.
2. **React Flow, one graph library.** The canvas reuses `@xyflow/react` for pan,
   zoom, nodes, edges, and subflows. Diagram cards are parent nodes; diagram
   objects are child nodes. Code containers are independent nodes.
3. **Pure scene first.** `packages/canvas` owns the scene, layout, and selection
   logic. The React layer only renders and dispatches. This is the test seam.
4. **Two link weights now.** Evidence links ship in Phase 17. Flow links are
   reserved in the scene model but have no relation data yet.
5. **Deterministic initial layout.** The same tour, beat, and viewport produce
   the same arrangement. User moves are session state until Phase 19 adds saved
   layouts.
6. **Collapse long code.** A container shows at most 24 lines before "Show all".
   This is both a reading and a performance decision.
7. **No hidden canvas on mobile.** Phase 17 falls back to the Stage with a clear
   note. Phase 19 adds the compact list that fulfils the owner decision.

## Waves

### Wave 1 — Scene and layout

- `packages/canvas` public interface:
  - `buildCanvasScene(tour, beat, options)` → diagrams, containers, links,
    selection, and home id;
  - `layoutCanvas(scene, viewport, options)` → positions and bounds;
  - `viewportFor(bounds, viewport, padding)` → `{ x, y, zoom }`;
  - `createCanvasSelection(scene)` → reducer with `select`, `enter`, `escape`,
    `focusContainer`, `focusObject`, and `openContainer`.
- The scene includes all beat anchors and the chapter's diagrams. It opens at
  most 6 code containers initially and offers "Show all anchored code" for the
  rest; `stage.anchorIds` remains capped at 3 separately.
- `layoutCanvas` is synchronous and deterministic: a grid/sweep placement, not
  ELK. Auto-arrange is a separate async command that may use ELK and falls back
  to the deterministic layout.
- The layout places the home diagram centrally, containers in reading order to
  the right, and satellite diagrams in a tray row. No overlap at the default
  viewport.
- Tests: deterministic output, no overlap, home is centered, bounds include all
  cards, viewport clamps zoom, selection stepping, and empty/one-anchor cases.
- No React imports in the package.

### Wave 2 — Renderer and evidence links

- `CanvasView` with `ReactFlowProvider`, memoized custom node and custom edge
  components, and a stable node/edge factory.
- `DiagramCardNode` renders the positioned diagram with object child nodes.
  Each object has a source handle on its right edge and a native button
  behaviour for keyboard activation.
- `CodeContainerNode` renders the compiled anchor HTML once, line numbers from
  the anchor, a target handle per visible line, and the header actions.
- `EvidenceEdge` uses the custom two-weight grammar; Phase 17 only needs the
  evidence variant.
- Clicking an object with an anchor that resolves in the current beat opens or
  focuses its container and draws the link. An object whose ID does not resolve,
  including a generated tour's symbol-shaped `anchorId`, is disabled with an
  explanation instead of silently doing nothing.
- The "Open code page" action is shown only when the source route can resolve the
  tour's project. Phase 18 extends the route to authored and imported projects.
- Empty state: a beat with no diagram shows the code containers and a short
  explanation, matching the current stage's behaviour.
- Tests: render a fixture scene, click an object, assert one container and one
  edge; open the same object twice, assert focus instead of duplication; open
  the code page; assert hidden lines stay out of the DOM until expanded.

### Wave 3 — Multiple diagrams, controls, and player integration

- Stage/Canvas switch in the player header; `?view=canvas` is validated by the
  route and survives reload.
- Diagram tray with the chapter's other diagrams; add, focus, remove, and home.
- Controls component with zoom in/out, percentage, reset, fit, home,
  auto-arrange, fullscreen, outline toggle, and shortcut sheet.
- Auto-arrange as a manual async command that may use ELK, with the
  deterministic grid as fallback; no preference yet. `layoutCanvas` stays
  synchronous.
- Fullscreen adapter: request/exit, `fullscreenchange` sync, `fullscreenerror`
  handling, focus return, two-second button pulse, `F` shortcut, and the
  dismissible hint.
- Follow-beat toggle and beat transition behaviour.
- Tests: switch round-trip preserves beat and playback; add two diagrams; fit
  and reset change the viewport; home returns to the beat diagram; fullscreen
  adapter unit tests; stubbed browser test for the fullscreen hint and shortcut.
- Real Chrome check: enter and exit fullscreen with the button and with `F`.

### Wave 4 — Baseline accessibility and fallback

- Semantic names for every control and container; `aria-live="polite"` region
  for viewport, selection, fullscreen, and auto-arrange messages.
- A minimal outline panel (`CanvasOutline`) with ordered headings, objects,
  containers, and actions. It is the text equivalent for Phase 17 and the base
  for Phase 19.
- Visible focus ring at 3:1 against adjacent colours.
- Keyboard path for every Phase 17 action: Tab reaches controls and containers,
  Enter activates, Escape closes the shortcut sheet or leaves fullscreen.
- `<768 px` fallback to the Stage with a dismissible explanation.
- Add canvas states to the axe suite: default, one container, two diagrams,
  shortcut sheet, and fullscreen hint.
- Tests: axe at 0 critical / 0 serious; tab order; outline parity for every
  Phase 17 action; focus ring; no focus theft; reduced-motion viewport change.

## Test seams

- `packages/canvas` scene builder: one compiled tour and beat in, one scene out.
- `packages/canvas` layout: positions and bounds only; no DOM.
- `packages/canvas` selection reducer: events in, state out.
- React canvas: a fixture tour through the real route; assert visible containers,
  edges, and controls.
- Fullscreen adapter: a fake document with `fullscreenEnabled`,
  `requestFullscreen`, `exitFullscreen`, and events.
- Player integration: the existing playback and narration tests stay green.

## Bunbun acceptance

1. Open `/t/tour_bunbun_golden/beat_purpose_01?view=canvas`.
2. Click `ATProto PDS`; a code container opens with the cited excerpt and an
   evidence line.
3. Add `Repository map` from the diagram tray; both diagrams remain usable.
4. Use fit, reset, home, zoom, and auto-arrange; the home diagram returns.
5. Enter fullscreen with the button and with `F`; exit with `F` and `Esc`.
6. Switch back to Stage; the beat and playback position are unchanged.
7. At 375 px, the Stage is shown with the compact-canvas note.
8. Run axe; confirm 0 critical / 0 serious.
9. Confirm the Bunbun tree is unchanged.

## Exit criteria

- `?view=canvas` is reachable from the player and survives reload.
- A diagram object opens exactly one code container and one evidence link.
- Two diagrams can be open without overlap at 1440×900 and 1024×768.
- The minimal outline exposes every Phase 17 action.
- All Phase 17 controls work with pointer and keyboard.
- Fullscreen works in real Chrome and has a tested fallback.
- Axe passes at 0 critical / 0 serious for the new states.
- Existing player, narration, run, code-page, and embed tests pass unchanged.
- The canvas scene and layout have unit coverage at ≥90% lines.
- Bunbun remains read-only.

## Risks

- **React Flow keyboard defaults.** Its arrow keys move selected nodes. Phase 17
  must not rely on that behaviour; disable it and own the key handling.
- **Group-node coordinates.** Parent and child positions are relative. A custom
  node factory must keep parent-before-child order and stable dimensions.
- **Line-level handles.** A code container's line handle position depends on the
  rendered line height. Measure once per container and update on text scale.
- **Perceived jank.** Viewport state must not re-render every node. Keep the
  viewport in React Flow and only render a percentage label from a throttled
  subscription.
- **Scope.** Incoming/outgoing, the full keyboard model, and export stay out of
  this phase even if the scene model makes them tempting.

## Working style

- Use `tdd` for the scene, layout, selection, and fullscreen adapter.
- Use `codebase-design` for the `packages/canvas` interface. Keep the seam small.
- Use `design-taste-frontend` for the canvas chrome; keep the existing off-white
  and ink tokens, cobalt accent, Geist Sans/Mono, and restrained motion. The
  spatial reference image shared during planning is a model, not a colour palette
  to copy.
- Use `opencode` only if a harness plugin needs a canvas entry point; this phase
  does not.
- Verify in real Chrome, not only happy-dom.
- Record the first canvas bundle size and the default-scene frame sample.

## Shipped (closure, 2026-10-21)

- **`packages/canvas`** — pure scene, deterministic layout, viewport fitting,
  and selection. 40 unit tests cover home/satellite diagrams, the six-container
  cap, evidence links, no-overlap layout, viewport clamps, and selection moves.
- **Opt-in canvas** — `?view=canvas` on the existing player route, a Stage/Canvas
  switch that preserves playback and run state, and a `<768 px` Stage fallback
  with a Phase 19 note.
- **Renderer** — React Flow diagram cards with object child nodes, memoized
  custom nodes/edges, orthogonal rounded evidence links, code containers with
  per-line target handles, 24-line collapse, and code-page links.
- **Controls** — zoom in/out, percentage, reset, fit, home, auto-arrange,
  follow-beat, outline, fullscreen, shortcut sheet. Fullscreen has a two-second
  pulse and a dismissible return hint.
- **Outline** — a minimal ordered text path for every Phase 17 action.
- **Shortcuts** — `F`, `0`, `1`, `+`/`-`, `Shift+A`, `Shift+H`, `O`, `B`, `?`,
  and `Esc`, scoped to the canvas root.

### Closure verification (fresh, 2026-10-21)

- `pnpm exec vitest run packages/canvas apps/web`: 6 files / 58 tests.
- `pnpm test`: 108 files / 902 tests passed on the pre-closure run; one isolated
  rerun of `packages/authoring/src/bunbun-authoring.acceptance.test.ts` passed
  after a 5s timeout in a parallel full-suite run.
- `pnpm typecheck`, `pnpm lint`, and `pnpm build` clean.
- `SOTHSPELL_WEB_PORT=5273 SOTHSPELL_API_PORT=4318 pnpm test:browser`:
  72 passed, including 8 canvas journeys and the canvas axe states.
- Real Chrome: fullscreen via button, `F`, and `Esc`; keyboard object activation;
  no focus theft.
- Bunbun tree clean.

### Follow-ups

- Code-page capability gating and authored/imported project roots land in Phase
  18 with the shared project record.
- Compact canvas, auto-zoom/auto-arrange preferences, full keyboard navigation,
  and the relation-aware outline land in Phase 19.
- 60 fps measurement, export, and the coverage gate land in Phase 20.
- Manual container dragging and saved layouts remain Phase 19 work.
