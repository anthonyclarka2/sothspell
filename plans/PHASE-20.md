# Phase 20 — Export, Performance, Hardening

**Status: planned.** Planning baseline: 2026-10-21. Depends on: Phases 17, 18,
and 19.

## Goal

Finish the canvas era: export the board as PNG, JPG, or a print-ready PDF; meet
the 60 fps budget on the reference scene; close the coverage and Playwright
matrix; and ship the docs, AGENTS, CONTEXT, issues, and release notes.

This phase decides whether canvas stays opt-in or is promoted to the default
player layout.

## Scope

### In

- Export model in `packages/canvas`: current view, whole board, and print
  layout.
- PNG and JPG capture with `modern-screenshot`, loaded on demand.
- Print-to-PDF through `window.print()` with a print-specific `CanvasPrintView`
  that renders a normal document flow and keeps text selectable.
- Export menu with format, scope, and a short explanation of what ships.
- Performance instrumentation, a deterministic reference scene, and a measured
  budget.
- React Flow optimization pass: memoization, visible-element culling, stable
  data, CSS containment, and code-container collapse.
- Coverage gate for `packages/canvas`, analyzer relation code, and API relation
  routes; Playwright interaction coverage for canvas modules.
- Full Playwright matrix across widths, colour modes, motion, keyboard, and
  export.
- Visual snapshots for the fixture scene and the compact layout.
- Docs: `docs/canvas.md`, plus updates to player, accessibility, tour format,
  analysis, release notes, README, AGENTS, and CONTEXT.
- Closing the issue set and recording the final gate.
- A promotion decision: keep opt-in or make canvas the default.

### Out

- A hosted share service, CDN, or PDF generation server.
- A rasterised PDF library.
- Canvas in the embed player.
- Search, minimap, notes, multi-select, and command palette unless they fit
  after the required work.
- Account-synced canvas layouts.
- A general-purpose whiteboard editor.

## Decisions

1. **PNG/JPG are captures, PDF is print.** PNG and JPG use `modern-screenshot`.
   PDF uses the browser print pipeline, so text remains selectable and the
   document follows the browser's pagination. No screenshot-to-PDF.
2. **Two scopes.** Export the current viewport or the whole board. Whole board
   mounts every card, disables visible-element culling, fits all cards, waits for
   fonts, captures the viewport element, and restores the previous viewport and
   culling state.
3. **Print is a separate render path.** The print sheet is not the spatial board
   restyled with CSS. `CanvasPrintView` renders from `buildExportModel`:
   headings, home diagram, every tour-anchor code container in reading order with
   full anchor HTML, relation containers with their bounded excerpt and relation
   label, relation summaries, and the tour revision. Collapsed lines are not in
   the DOM, so print cannot reveal them with CSS; the print view renders the full
   anchor for tour evidence. Code wraps rather than clips. Page breaks avoid
   cards.
4. **No controls or transient UI in exports.** Hide selection outlines, toasts,
   controls, the outline drawer, and the cursor. Keep the board background and
   card borders.
5. **Dynamic export code.** `modern-screenshot` is imported only when an image
   export starts. The canvas chunk budget excludes it.
6. **Measure before optimizing.** Record the baseline on the reference scene,
   then apply the React Flow checklist, then record the result. Do not claim
   60 fps without numbers.
7. **CI is a guard, the reference machine is the budget.** CI uses a p95 of
   20 ms and a 100 ms long-task ceiling. The owner records the real p95 and fps.
8. **Coverage is honest.** Unit gates apply to pure modules. Playwright covers
   every interaction. A browser JS coverage collector is a follow-up; the plan
   does not claim one.
9. **Promotion is evidence-based.** Canvas becomes the default only if the
   performance, accessibility, and export gates pass and the owner accepts the
   change. The embed stays on the Stage either way.

## Waves

### Wave 1 — Export model and image capture

- `packages/canvas` export model:
  - `buildExportModel(scene, { scope: 'view' | 'board', format })`;
  - file name, title, revision, scene bounds, included containers, and hidden
    UI;
  - print model: reading order, container summaries, relation text.
- Image export:
  - dynamic import `modern-screenshot`;
  - for the whole board, mount all cards and disable `onlyRenderVisibleElements`
    before measuring;
  - wait for `document.fonts.ready` and two animation frames;
  - add `data-canvas-export="image"` to hide transient UI;
  - capture at device scale 2, cap the largest dimension at 8192 px;
  - restore the viewport and the data attribute in `finally`;
  - download via an object URL, revoke after click.
- Menu: PNG, JPG, PDF. Scope: current view or whole board for images; print
  layout for PDF.
- Error state: capture failure shows an inline message with a retry action and
  does not leave the board in export mode.
- Tests: export model for both scopes; PNG/JPG download events; dimensions;
  controls absent; background present; an off-screen card present in whole-board
  export; viewport and culling restored; failure restores the board; large board
  cap.
- Seam: export model pure; capture adapter with a fake download and a fake
  screenshot function.

### Wave 2 — Print view and PDF

- Add `CanvasPrintView`, mounted only for print or the export preview. It reads
  the export model and renders a normal document flow, not React Flow nodes. It
  renders full anchor HTML for tour evidence and the bounded excerpt with a
  relation label for relation containers.
- `@media print` stylesheet:
  - `@page` margins, portrait by default;
  - title block with tour, beat, chapter, revision, and date;
  - home diagram first, then code containers in reading order;
  - relation summaries as text;
  - `break-inside: avoid` on cards; `break-after: avoid` on headings;
  - code wraps rather than clips; tour evidence renders its full anchor, and a
    relation container renders its bounded excerpt with a relation label;
  - controls, outline, and toasts hidden;
  - `print-color-adjust: exact` only for borders and focus-free state.
- PDF action: set `data-canvas-print`, wait for layout, call `window.print()`,
  restore on `afterprint`.
- The print layout includes a short legend and a note that the PDF is generated
  by the browser's print dialog.
- Tests: `page.emulateMedia({ media: 'print' })` for structure and screenshots;
  no controls; no clipped code; a >24-line tour anchor expands fully; a long
  relation container keeps its bounded excerpt and label; an off-screen card
  appears; heading and revision; print styles at 375 and 1440 widths.
- Manual PDF check: save from Chrome, confirm selectable text and page breaks.
- Seam: print stylesheet and the print action; PDF is a manual check.

### Wave 3 — Performance measurement and optimization

- Reference scene in a fixture: 2 diagrams, 32 objects, 8 containers, 40 links.
- Instrumentation:
  - a Playwright spec starts a rAF sampler before a 3-second pan/zoom script;
  - `PerformanceObserver` records long tasks;
  - report p50, p95, max frame interval, long-task count, and heap if available.
- Baseline run, then optimize:
  - memoize custom nodes and edges;
  - stable node/edge arrays and callbacks;
  - `onlyRenderVisibleElements` for the reference scene;
  - no whole-node-array reads inside node components;
  - keep viewport state out of React;
  - CSS containment on cards;
  - simplify shadows and transitions on large boards;
  - collapse code beyond 24 lines;
  - lazy-load the layout engine.
- Measure again; record the numbers in `docs/canvas.md`.
- Add `pnpm test:canvas:perf` and a CI job with the generous threshold. Add
  Playwright to the existing GitHub Actions workflow: install the browser, run
  `pnpm test:browser` and `pnpm test:a11y`, and use bundled Chromium in CI while
  keeping the local Chrome channel. Make the channel environment-driven
  (`PLAYWRIGHT_CHANNEL`, empty in CI) instead of hardcoded in
  `playwright.config.ts`.
- Bundle check: build the web app, record the canvas chunk and export chunk
  sizes, and fail if they exceed 60 KiB and 40 KiB gzip.
- Tests: performance spec fails on a regression over the CI threshold; bundle
  budget check.
- Seam: a deterministic fixture scene and a scripted viewport interaction.

### Wave 4 — Coverage, Playwright matrix, and visual snapshots

- Add `@vitest/coverage-v8` and a `test:coverage` script.
- Thresholds:
  - `packages/canvas` ≥90% lines and functions, ≥85% branches;
  - analyzer relation code ≥90% lines;
  - API relation routes ≥90% lines.
- Browser JS coverage is a follow-up. This era relies on unit coverage gates
  and the Playwright journeys below.
- Playwright matrix (Chrome) across:
  - 1440×900, 1024×768, 768×900, 375×812;
  - light, dark, forced colours, increased contrast, reduced motion;
  - 200% text and a 360 CSS px reflow at 400%-equivalent zoom;
  - pointer and keyboard journeys;
  - all export formats;
  - no network requests during canvas interaction except the relation call.
- Visual snapshots: default board, selected container, relation expansion,
  compact layout, high contrast, forced colours. Disable animations and wait for
  fonts; use a small pixel threshold. Generate and run baselines only in the
  dedicated Linux Chromium job; do not mix macOS Chrome and Ubuntu Chromium
  baselines. Local snapshot updates use the same Playwright image.
- Flake control: no arbitrary sleeps; wait on accessible state; keep one worker
  as the existing config does.
- Tests: coverage thresholds; matrix; snapshots; no-network assertion.

### Wave 5 — Docs, issues, promotion decision, and final gate

- Write `docs/canvas.md`:
  - entering the canvas, controls, shortcuts, relation model;
  - preferences and reset;
  - export and print;
  - accessibility modes and manual results;
  - performance numbers, bundle sizes, and known limits.
- Update `docs/player.md` for the Stage/Canvas switch.
- Update `docs/accessibility.md` for the canvas keyboard map and modes.
- Update `docs/tour-format.md` for schema 1.2.0 and `symbolId`.
- Update `docs/analysis.md` for call edges and confidence.
- Update `docs/release-notes.md`, `README.md`, `AGENTS.md`, and `CONTEXT.md`.
- Close the issue files with the shipped commit and verification.
- Promotion decision:
  - keep canvas opt-in if any budget or manual gate is weak;
  - promote only with owner approval and a separate commit that changes the
    default and updates the embed note.
- Final gate:
  - `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`;
  - `pnpm test:browser`, `pnpm test:a11y`, `pnpm test:canvas:perf`;
  - `pnpm test:coverage`;
  - `pnpm check:toolchain`, `pnpm check:secrets`;
  - Bunbun acceptance and `git -C .../bunbun status --porcelain` empty.
- Record the final numbers and the promotion decision in the phase closure.

## Test seams

- Export model as a pure function over a scene.
- Capture adapter with a fake screenshot function and a fake download.
- Print styles through the real page and `emulateMedia`.
- Performance fixture and sampler as a Playwright spec.
- Coverage thresholds through the real Vitest config.
- Visual snapshots through the real route.
- Final gate through the existing commands.

## Bunbun acceptance

1. Open the golden tour in Canvas at 1440×900.
2. Open two containers and one relation expansion.
3. Export the current view as PNG and JPG; verify dimensions and no controls.
4. Export the whole board as PNG; verify all cards are present.
5. Open the print layout as PDF; confirm selectable text, revision, and no
   clipped code.
6. Run the keyboard and outline journeys.
7. Run the performance sample and record p95 and long tasks.
8. Run axe at 0 critical / 0 serious with WCAG 2.2 A/AA tags in light, dark,
   forced colours, increased contrast, reduced motion, and 200% text.
9. Confirm the Bunbun tree is unchanged.

## Exit criteria

- PNG and JPG downloads match the visible board and restore the viewport.
- Print-to-PDF produces a readable, selectable-text handout with no clipped code.
- The reference scene meets the budget or the phase records the miss and keeps
  canvas opt-in.
- Canvas and export chunks are within budget.
- Coverage gates pass; Playwright journeys cover every canvas interaction.
- The Playwright matrix and visual snapshots pass. Firefox and WebKit remain a
  documented follow-up, not a claim.
- Manual screen-reader, keyboard, fullscreen, and PDF checks are recorded.
- Docs, AGENTS, CONTEXT, README, and release notes are current.
- All issues are closed with the shipped commit and verification.
- `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, `pnpm test:browser`,
  `pnpm test:a11y`, `pnpm test:canvas:perf`, `pnpm test:coverage`,
  `pnpm check:toolchain`, and `pnpm check:secrets` pass.
- Bunbun remains read-only.

## Risks

- **Capture fidelity.** Fonts, shadows, and transforms can differ. Wait for
  fonts, hide transient UI, and keep a screenshot test. Accept a small visual
  difference rather than a blank capture.
- **Large boards.** A 8192 px cap can downscale a very large board. State the
  cap in the export dialog and offer the print layout as the readable option.
- **Print pagination.** Browser print engines differ. Test Chrome, use
  `break-inside: avoid`, and keep code line length bounded.
- **Performance noise.** CI frames vary. Keep the gate generous, record the real
  numbers, and do not promote on a single run.
- **Coverage theatre.** A high line percentage does not prove accessibility or
  interaction. Pair coverage with Playwright journeys and manual checks.
- **Scope.** Search, minimap, notes, and multi-select remain optional. Adding
  them before the gates pass would dilute the hardening work.
- **Promotion pressure.** Opt-in is a valid outcome. The phase can close with
  canvas opt-in and a documented list of what blocks promotion.

## Working style

- Use `tdd` for the export model, coverage config, and performance sampler.
- Use `codebase-design` for the export interface: one scene and one scope in,
  one artifact description out.
- Use `design-taste-frontend` for the export menu and print sheet. The print
  sheet is a document, not a dark canvas.
- Use `review-prose` for `docs/canvas.md` and the release notes.
- Use `using-git` for the final commits and issue closures.
- Run the final gate from a clean worktree after the last merge.
- Record every number; do not summarize a miss as a pass.
