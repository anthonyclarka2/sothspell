# Canvas Playback

The canvas is an opt-in playback view for a beat. It places the beat diagram,
code containers, and their links on one pannable board. The Stage remains the
default and the embed player is unchanged.

## Entering and leaving

- Open any beat with `?view=canvas`, or use the **Canvas** switch above the
  player stage.
- The switch preserves the beat, playback position, narration mode, and run
  progress.
- `?view=canvas` survives a reload and can be shared on the same machine or
  deployment.
- Below 768 px the board becomes a compact vertical reading layout, not a
  shrunken canvas.

## The board

- The beat's diagram is the **home card**.
- Beat anchors open as **code containers** to the right.
- The **diagram tray** adds or removes other diagrams from the same chapter.
- A **shared-symbol object** in two open diagrams is marked with a bridge badge;
  either object opens one shared definition container.
- An **evidence link** is a thin solid line from a diagram object to the anchor's
  start line or cited range.
- A **flow link** is a thicker, lighter line between code containers. `calls`
  is solid, `references` is dashed, and `imports` is dotted. Labels and the
  legend repeat the relation kind so colour is never the only signal.

### Code containers

Each container shows the symbol, path and lines, language, and the compiled
excerpt. Actions:

- **Incoming** opens the code that calls or imports the current symbol.
- **Outgoing** opens the code the current symbol calls.
- **Open code page** opens the full-file evidence page.
- **Show all** expands a collapsed excerpt; hidden lines stay out of the DOM
  until expanded.
- The symbol name opens its definition. Diagram objects open their definition or
  cited anchor.

Incoming and outgoing are toggles. A container opened manually stays open; an
automatically opened container is hidden only when no active toggle still owns
it. Relation expansion never cascades.

### Relations

Relations come from a bounded API request; the browser never receives a
snapshot or a source root.

```
GET /api/tours/:tourId/canvas/symbol
  ?symbolId=<id>
  &direction=definition|incoming|outgoing
  &limit=8&offset=0
```

- TypeScript/JavaScript emits symbol-level `calls` edges.
- Python, Go, Rust, and Java keep their import/reference edges; the UI labels
  them honestly.
- The API prefers calls, then references, then imports.
- Responses cap at 8 containers, 16 KiB per excerpt, and 64 KiB total.
- `identifierTargets` is returned for future inline annotation; it is not
  rendered inside code excerpts yet.
- Tours without schema 1.2.0 use a `legacy:<path>#<symbol>` target that the API
  resolves against the snapshot, so the golden Bunbun tour works unchanged.

The project source root lives only in
`$SOTHSPELL_HOME/projects/<slug>/project.json`. If the record is missing, the
relation buttons and live code page are unavailable; the embedded excerpt still
plays. The source route refuses redacted files.

## Controls and shortcuts

Bottom-left controls: zoom out, zoom percentage, zoom in, reset, fit all, home,
auto-arrange, follow beat, outline, fullscreen, shortcuts, export.

| Key       | Action                                          |
| --------- | ----------------------------------------------- |
| `F`       | Toggle fullscreen                               |
| `0`       | Fit all cards                                   |
| `1`       | Reset zoom to 100%                              |
| `+` / `-` | Zoom in / out                                   |
| `Shift+A` | Auto-arrange                                    |
| `Shift+H` | Home diagram                                    |
| `O`       | Toggle outline                                  |
| `B`       | Toggle follow beat                              |
| `?`       | Shortcut sheet                                  |
| Arrows    | Move selection between cards                    |
| `H/J/K/L` | Move selection left/down/up/right               |
| `Enter`   | Enter a container or activate the item          |
| `Escape`  | Item → container → home; exits fullscreen first |

Keys handled by the canvas stop before the player's global handlers. Space on a
button activates it; Space on the board background and `T` remain the player's
playback and theater keys.

## Preferences

Preferences are local to the browser under
`sothspell:canvas-preferences:v1`:

- auto-zoom and auto-arrange;
- follow beat;
- motion (`system`, `reduce`, `full`);
- contrast (`system`, `more`);
- palette (`default`, `colour-blind`);
- text scale (100, 125, 150, 200);
- first-run notice flags;
- saved viewports under `sothspell:canvas-layouts:v1`, invalidated by a tour
  revision change.

Auto-zoom frames a newly opened container with its source. Auto-arrange applies
the deterministic layout. The first use of either shows a notice with Undo and
"Disable this for me"; disabling writes the preference and confirms in place.
Notices do not take focus, pause while hovered or focused, and remain available
from the shortcut sheet. Undo and preference changes are also in the display
menu.

The **Appearance** menu applies `data-motion`, `data-contrast`, `data-palette`,
and `data-text-scale` to the canvas root. It can reset saved viewports and all
canvas preferences.

## Accessibility

- The board is one tab stop. Roving focus moves through objects, containers, and
  their actions.
- The outline is the text equivalent: diagrams, objects, code containers,
  relations, and actions in reading order.
- A polite live region announces selection, opened containers, relation loads,
  fit, fullscreen, notices, and preference changes. Zoom ticks are throttled.
- High contrast, `prefers-contrast: more`, and forced colours are supported.
- The colour-blind palette uses an Okabe–Ito subset with line styles and labels.
- 200% text re-measures card and line handles; 375 px uses the compact layout.
- Focus is a 2 px visible ring with 3:1 contrast; controls keep 24 px targets.
- Axe runs at 0 critical / 0 serious for the default board, relations, outline,
  shortcut sheet, display menu, compact layout, preference modes, notices,
  export menu, and print sheet.

### Manual checklist status

Automated coverage is recorded above. The following manual checks are still
owner-gated:

- VoiceOver on macOS (required before promotion from opt-in).
- NVDA on Windows (requires a Windows VM or remote machine).
- Real-device pinch/touch targets.
- Firefox and WebKit.

## Export

The export menu is in the top-right canvas chrome.

- **PNG current view** and **PNG whole board**.
- **JPG current view** and **JPG whole board**.
- **PDF print layout**.

PNG/JPG use `modern-screenshot` at device scale 2, cap the largest dimension at
8192 px, wait for fonts and two frames, hide controls, tray, outline, notices,
selection, and the cursor, then restore the board. Whole-board export fits all
cards first and restores the previous viewport.

PDF is not a screenshot. `CanvasPrintView` renders a normal document flow:
title, project revision, date, home diagram, tour-anchor containers in reading
order with full anchor HTML, relation summaries, bounded relation excerpts,
and a legend. `@media print` handles `@page`, page breaks, wrapping, and
`print-color-adjust`; `window.print()` opens the browser's Save-as-PDF flow.

Manual PDF check: open `beat_request_01`, open `main.ts`, choose PDF, save from
Chrome, and confirm selectable text, revision `9fef24d`, the full 31-line anchor,
wrapped code, no controls, and no split card.

## Performance

Recorded on the golden two-diagram board with both beat containers and incoming
and outgoing relations open:

```text
nodes=18 edges=5 diagrams=2 objects=11 containers=5
frames=176 p50=16.7ms p95=16.8ms max=33.4ms
longTasks=0 maxLongTask=0ms heap≈72.5MB
```

The standalone `pnpm test:canvas:perf` run meets the 60 fps p95 target. A full
browser run can report a higher p95 because the machine is busy; the spec only
enforces the threshold in CI (`CI=1`). The plan's separate 32-object /
8-container / 40-link synthetic scene is not built; this is the current
representative board.

Bundle after Phase 20: the web app has one JavaScript chunk at 835.28 kB /
244.36 kB gzip, plus a 23.97 kB / 9.38 kB gzip export chunk from the dynamic
`modern-screenshot` import. There is no canvas-specific chunk, so the planned
60 KiB canvas budget is not measurable until code splitting. `pnpm check:bundle`
reports the total and the unmeasured budgets instead of claiming a pass.

## Known limitations

- In-text identifier links are not rendered; use the diagram object or the
  container header to open a definition.
- Container dragging and manual saved layouts are not enabled. Saved viewports
  restore the camera, but the cards use the deterministic layout.
- No real PDF is generated in CI; the print-media structure is tested and the
  PDF flow is a manual check.
- Whole-board export respects the board's minimum zoom of 0.25.
- VoiceOver/NVDA, real-device touch, Firefox, and WebKit are not run.
- The canvas is not part of the embed player.
