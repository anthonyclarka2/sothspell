# @sothspell/canvas

Pure scene model for the canvas playback view.

## Interface

- `buildCanvasScene(tour, beat, options)` — one compiled tour and beat in, one
  deterministic `CanvasScene` out.
- `layoutCanvas(scene, viewport)` — card positions and bounds; synchronous.
- `viewportFor(bounds, viewport, padding)` — pan/zoom that frames the layout.
- `createCanvasSelection`, `reduceCanvasSelection`, `escapeCanvasSelection`,
  `homeCanvasSelection` — selection transitions without React.

## Boundaries

- No React, DOM, filesystem, or API imports.
- No relation analysis. Phase 18 adds a selector in `packages/analyzer`; the
  canvas receives bounded payloads.
- Positions are deterministic for the same scene and viewport size.

## Tests

`pnpm exec vitest run packages/canvas`
