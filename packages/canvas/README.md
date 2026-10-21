# @sothspell/canvas

Pure scene model for the canvas playback view.

## Interface

- `buildCanvasScene(tour, beat, options)` — one compiled tour and beat in, one
  deterministic `CanvasScene` out. The home card is the beat's stage diagram or,
  when the stage has none, the chapter's first diagram. Requested satellites come
  from the same chapter. The scene opens at most six code containers
  (`options.containerLimit`) and cites only anchors that are open.
- `layoutCanvas(scene, viewport)` — card positions and bounds; synchronous. The
  home card sits at the origin, code containers form one or two columns to its
  right, and satellite diagrams sit in a row below. Items are keyed by
  `diagramCardKey` and `codeContainerKey`.
- `viewportFor(bounds, viewport, padding)` — centred pan/zoom that frames the
  layout, with zoom clamped to 0.25–1.4.
- `createCanvasSelection`, `reduceCanvasSelection`, `escapeCanvasSelection`,
  `homeCanvasSelection` — selection transitions without React. Movement uses
  nearest-neighbour geometry across open diagrams and containers, with no wrap.
- `enterCanvasItem`, `moveCanvasItem` — item-level navigation inside one
  container. The caller passes the visible item order (symbol, lines, relation
  toggles, actions), so the canvas never guesses an action. `enter` on a
  container selects the first item when the reducer receives that order as its
  optional fourth argument; `moveItem` steps previous/next with wrap-around.
  `Escape` steps item → container → home diagram.
- `DEFAULT_CANVAS_PREFERENCES`, `parseCanvasPreferences`,
  `patchCanvasPreferences` — the local view-preference schema: auto-zoom,
  auto-arrange, follow beat, motion, contrast, palette, text scale, and the two
  first-run seen flags. Missing, invalid, or unknown stored values fall back per
  field without throwing, and a patch keeps the current value when its
  replacement is invalid.

## Boundaries

- No React, DOM, filesystem, or API imports.
- Preferences are a pure schema. Browser storage lives in `apps/web`.
- No relation analysis. Phase 18 adds a selector in `packages/analyzer`; the
  canvas receives bounded payloads.
- Positions are deterministic for the same scene and viewport size.
- Selection movement uses the deterministic layout at 1440×900 until Phase 19
  introduces measured card positions for manual moves.

## Tests

`pnpm exec vitest run packages/canvas`
