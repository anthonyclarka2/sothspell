# Phase 22 — Canvas by Default

**Status: complete (2026-11-02; automated gates; manual VoiceOver/NVDA
owner-gated).** Planning baseline: 2026-11-02. Depends on: Phases 17–20 and the
Phase 21 interaction patch (container move, resize, close, selection, and
fullscreen re-fit).

## Goal

Make the canvas the default playback view in the web player without losing the
player chrome that the Stage supplies. The chapter list, view switch, narration,
transport, Ask panel, and resume state must remain available and correctly laid
out in Canvas, at every supported width, including fullscreen.

The Stage remains the fallback layout and the embed layout. The promotion is a
view decision, not a new tour format and not a change to the canvas scene model.

## Scope

### In

- Default view resolution in the player route: Canvas unless the URL asks for
  Stage.
- `?view=stage` and `?view=canvas` as explicit, validated view choices.
- View preservation through beat navigation, reloads, the code page, Ask-panel
  citations, and code-page outline navigation.
- Chapter navigation in Canvas at all widths:
  - persistent chapter rail at 1081 px and wider;
  - chapter drawer below 1081 px, including 375 px.
- Fullscreen that keeps the player chrome: view switch, chapter navigation,
  narration, transport, and Ask panel.
- Layout rules that keep the canvas, narration, and transport from overlapping
  at 375, 768, 1024, and 1440 px.
- Playwright coverage for the default view, Stage fallback, chapter drawer, and
  fullscreen chrome.
- Docs, AGENTS, CONTEXT, README, release notes, roadmap, and phase status.

### Out

- Changes to `packages/canvas` scene, layout, selection, preferences, or export
  model.
- Canvas in the embed player. The embed stays on the Stage.
- A stored browser preference for the default view. The URL is the state.
- A feature flag. The owner accepted promotion in this phase.
- Code splitting or a new canvas performance budget.
- New canvas features: minimap, notes, multi-select, command palette, shareable
  canvas URLs.
- Manual VoiceOver/NVDA, Firefox/WebKit, and real-device touch. These remain
  owner-gated follow-ups and are recorded, not claimed.

## Decisions

1. **Canvas is the default on the web player.** A bare
   `/t/:tourId/:beatId` opens Canvas. `?view=stage` opens the Stage.
   `?view=canvas` remains valid for old links. Unknown values fall back to
   Canvas.
2. **The URL is the view state.** Clicking the switch writes `?view=stage` or
   `?view=canvas`. No localStorage preference is added. A user who chose Stage
   stays on Stage across beats, reloads, and code-page round trips.
3. **The switch stays.** Canvas is pressed by default; Stage is one action away.
   The switch remains in the player viewbar in both modes.
4. **Chapter navigation is never removed.** At 1081 px and wider the existing
   `.chapter-rail` stays a persistent column. Below 1081 px the rail is replaced
   by a disclosure drawer opened from the viewbar. The drawer contains the same
   chapter and beat list, the active-beat marker, completed markers, and the
   same seek action. It unmounts its panel when closed and automatically closes
   when the viewport widens to 1081 px or when theater mode starts, so duplicate
   landmarks and hidden focus traps never occur.
5. **Fullscreen keeps the player chrome.** Fullscreen targets `.player-page`,
   not `.canvas-root`. The viewbar, chapter rail or drawer, narration,
   transport, and Ask panel remain inside the fullscreen surface. The canvas
   re-fits both when entering and when exiting fullscreen. `PlayerPage` owns the
   fullscreen keyboard shortcuts (`F` and `Escape`) at the page level so they
   continue to work when focus is in the player chrome or in the compact layout
   below 768 px. Switching to Stage while in fullscreen exits fullscreen first so
   the viewer is never stranded without a fullscreen control.
6. **Theater is still the immersive mode, with an explicit `Escape` hierarchy.**
   Entering fullscreen clears theater synchronously before requesting fullscreen
   so the chrome is present on the first fullscreen measurement. Pressing `t` in
   fullscreen may still hide the rail/drawer and narration aside. `Escape`
   follows a strict precedence chain:
   1. open modal or popover (`CanvasShortcuts`, `CanvasDisplayMenu`,
      `CanvasExportMenu`, `ChapterDrawer`, `AskPanel`, `CanvasOutline`);
   2. canvas roving focus (`item` → `container` → `diagram`);
   3. exit fullscreen (`fullscreenActive`);
   4. exit theater mode (`theater`).
7. **The Stage fallback is one constant.** `DEFAULT_PLAYER_VIEW` lives in a
   small pure module. Reverting the default is a one-line change; the Stage
   route, switch, and tests continue to work.
8. **Promotion proceeds before manual screen-reader sign-off.** The owner
   accepted this trade-off. Automated axe, keyboard, compact, 200% text,
   forced-colours, high-contrast, and colour-blind gates still run. VoiceOver,
   NVDA, Firefox/WebKit, and real-device touch stay open follow-ups.
9. **The embed is unchanged.** `packages/embed` keeps its current Stage layout
   and this phase adds no canvas dependency there.
10. **No new runtime dependency.** The work uses the existing React Flow,
    fullscreen adapter, locale messages, and Playwright stack.

## Waves and tracks

Waves 1 → 2 → 3 → 4 are sequential because they share `apps/web/src/routes/PlayerPage.tsx`
and `apps/web/src/styles.css`. Every wave must leave `pnpm typecheck`,
`pnpm lint`, `pnpm test`, `pnpm test:browser`, and `pnpm test:a11y` green.

### Wave 1 — Default view and link propagation (main)

Branch: `phase-22-a-default-view` in the primary checkout.

- Add `apps/web/src/lib/player-view.ts`:
  - `type PlayerView = 'canvas' | 'stage'`;
  - `DEFAULT_PLAYER_VIEW = 'canvas'`;
  - `parsePlayerView(value): PlayerView | undefined`;
  - `resolvePlayerView(search): PlayerView`.
- Update `apps/web/src/router.tsx`:
  - player search validates `view: parsePlayerView(search.view)`;
  - code-page search validates `view: parsePlayerView(search.view)` alongside
    `anchor`, `beat`, and `tourId`.
- Update `apps/web/src/routes/PlayerPage.tsx`:
  - default resolves to Canvas via `resolvePlayerView(search)`;
  - both switch buttons write an explicit view (`?view=stage` or `?view=canvas`);
  - beat changes and reloads preserve `search.view`;
  - `openAnchor` carries the resolved view to the code page;
  - pass `view` to `AskPanel` (`StageView` needs no `view` prop because it only
    mounts when the active view is `'stage'`).
- Update `apps/web/src/routes/CodePage.tsx`:
  - validate `view` via `parsePlayerView(search.view)`;
  - the back link carries `search={{ view: search.view }}` (and is also rendered
    on the error state when `search.beat` and `search.tourId` are present);
  - the anchor outline `navigate()` call carries `view: search.view`.
- Carry `view: 'stage'` in `CodePane`.
- Carry `view: 'canvas'` in `CanvasCodeContainer`, `CanvasCompact`, and
  `CanvasOutline`, and only render the code-page link when the container cites a
  tour beat anchor (`!container.id.startsWith('relation:')`) so relation-only
  symbol containers do not link to a 404 source route.
- Update existing Playwright specs affected by the default-view flip so Wave 1
  stays green:
  - `apps/web/e2e/tour.spec.ts`: keep Stage-specific diagram-node coverage
    behind `?view=stage`, and check both default Canvas and `?view=stage` in the
    mobile/tablet overflow test;
  - `apps/web/e2e/a11y.spec.ts`: keep both `/t/tour_bunbun_golden/beat_purpose_01`
    (default Canvas) and `/t/tour_bunbun_golden/beat_purpose_01?view=stage`;
  - `apps/web/e2e/canvas.spec.ts`: update the stage-switch URL assertion from
    `not view=canvas` to `view=stage`.
- Add `apps/web/src/lib/player-view.test.ts`.
- Add `apps/web/e2e/player-view.spec.ts`.

### Wave 2 — Chapter navigation parity (subagent A, after Wave 1)

Worktree: `.worktrees/phase-22-b-chapter-nav`  
Branch: `phase-22-b-chapter-nav`  
Base: the Wave 1 commit.

- `apps/web/src/components/ChapterRail.tsx`:
  - add `variant?: 'rail' | 'drawer'`;
  - drawer variant adds `chapter-rail--drawer`;
  - keep the existing heading, chapter labels, beat buttons, `aria-current`,
    completed markers, and current-chapter metadata.
- `apps/web/src/components/ChapterDrawer.tsx` (new):
  - trigger in `.player-viewbar` with `aria-expanded={open}` and
    `aria-controls={open ? panelId : undefined}` (no dangling ID when closed);
  - only mount the panel when `open === true` so `.chapter-rail` selectors and
    `<aside>` landmarks never duplicate while closed;
  - automatically close (`setOpen(false)`) when `useMediaQuery('(min-width: 1081px)')`
    matches or when `theater` becomes `true`, preventing duplicate landmarks and
    focus loss on hidden elements;
  - position the panel inside the `.player-viewbar` subtree (never portalled to
    `body` so it stays inside the fullscreen element) using either CSS
    `position: absolute; top: calc(100% + 6px); inset-inline-start: 0;` on a
    `position: relative` wrapper or `position: fixed` updated on `open`,
    `resize`, and capture-phase `scroll` with LTR/RTL horizontal clamping
    (`dir="rtl"` safe at 375 px);
  - Escape (`preventDefault` + `stopPropagation`) and outside `pointerdown`
    close it without triggering fullscreen or theater exit;
  - focus moves to the active beat button (`[aria-current="true"]`, falling back
    to the first beat button) on open and returns to the trigger on close;
  - selecting a beat seeks and closes the panel.
- `apps/web/src/routes/PlayerPage.tsx`:
  - wire `ChapterDrawer` into the viewbar (passing `theater` so it closes on
    theater entry);
  - keep the persistent `ChapterRail` as the wide-screen path.
- `apps/web/src/styles.css`:
  - change the 1080 px rule from hiding `.chapter-rail` to hiding
    `.chapter-rail:not(.chapter-rail--drawer)`;
  - hide `.chapter-drawer` at 1081 px and wider;
  - hide `.player-page--theater .chapter-drawer` alongside
    `.player-page--theater .chapter-rail`;
  - drawer panel width, max-height, scroll, z-index, RTL alignment, and 375 px
    reflow.
- `apps/web/src/i18n/messages.ts`:
  - drawer labels in English, Spanish, and Arabic.
- `apps/web/e2e/chapter-nav.spec.ts` (new).

Subagent A must not touch `CanvasView.tsx`, fullscreen CSS, or the default-view
module.

### Wave 3 — Fullscreen player chrome (subagent B, after Wave 2 merges)

Worktree: `.worktrees/phase-22-c-fullscreen`  
Branch: `phase-22-c-fullscreen`  
Base: the Wave 2 merge commit.

- `apps/web/src/routes/PlayerPage.tsx`:
  - own `pageRef` and `useFullscreen(pageRef)`;
  - add `player-page--fullscreen` while active;
  - clear `theater` synchronously inside `toggleFullscreen` before requesting
    fullscreen (and in a `fullscreen.active` effect as fallback);
  - exit fullscreen if the viewer switches to `Stage` (`selectView('stage')`)
    while fullscreen is active;
  - handle `f`/`F` and `Escape` (when `fullscreen.active` is true and no inner
    overlay/drawer/roving focus consumed the event) in `PlayerPage`'s `window`
    `keydown` listener, and narrow the `tag === 'BUTTON' || tag === 'A'` guard
    to `Space` only so `F`, `T`, and `Escape` work when focus is on player
    chrome buttons or in the compact canvas;
  - pass `fullscreenSupported`, `fullscreenActive`, and `onToggleFullscreen` to
    `CanvasView`.
- `apps/web/src/components/canvas/CanvasView.tsx`:
  - remove the internal `useFullscreen` and its import;
  - accept the three fullscreen props;
  - in `onKeyDown`, order `Escape` so `outlineOpen` and roving focus
    (`focus.level === 'item' || focus.level === 'container'`) step out before
    `fullscreenActive` exits fullscreen;
  - re-fit the board (`flow.fitView`) both on fullscreen entry and on fullscreen
    exit (`wasFullscreen.current && !fullscreenActive`);
  - keep the existing fullscreen hint, pulse, and announcement;
  - keep `rootRef` for focus and DOM selection only.
- `apps/web/src/styles.css`:
  - `.player-page:fullscreen` and `.player-page--fullscreen` size to `100dvh`;
  - layout fills the remaining height;
  - canvas `min-height: 0` in fullscreen, and `.canvas-root--compact` gets
    `overflow-y: auto; min-height: 0;` in fullscreen so compact cards remain
    scrollable at 375 px;
  - narration capped (`max-height: 160px`) and scrollable in fullscreen; when
    `.player-page:has(.ask-panel)` is active in fullscreen or short viewports,
    cap `.narration` (`max-height: 110px`), cap `.ask-panel`
    (`max-height: 28dvh`), and hide `.canvas-relation-legend` when height is
    constrained so canvas overlays never collide at 1024×768;
  - transport static in fullscreen;
  - `.resume-banner` styled as a compact single-row bar in fullscreen (never
    `display: none` while `hasResumed === false`, so run persistence can still
    be resumed or reset);
  - 1024, 768, and 375 px fullscreen reflow.
- `apps/web/e2e/canvas.spec.ts` and `apps/web/e2e/canvas-interactions.spec.ts`:
  - fullscreen mocks use `async function (this: Element) { active = this; ... }`
    so `document.fullscreenElement` records the actual element requested, and
    assert `.player-page` is the fullscreen element;
  - remove the manual `.canvas-root` fixed-fullscreen style override in
    `canvas-interactions.spec.ts`.
- `apps/web/e2e/canvas-fullscreen.spec.ts` (new).

Subagent B must not touch `ChapterRail.tsx` or `ChapterDrawer.tsx`. If the
drawer needs a fullscreen-specific fix, B reports it; A already closed.

### Wave 4 — Suite verification, docs, and final gate (main)

- Verify all Playwright specs with Canvas as default:
  - `apps/web/e2e/translation.spec.ts`, `account.spec.ts`, `review.spec.ts`, and
    `new-tour.spec.ts`: verify they pass with Canvas as the default;
  - `canvas-*.spec.ts`: keep explicit `?view=canvas` URLs where the test is
    canvas-specific.
- Update docs:
  - `docs/canvas.md`: default view, Stage fallback, drawer, fullscreen chrome;
  - `docs/player.md`: Stage is the fallback and the embed layout;
  - `docs/accessibility.md`: drawer and fullscreen keyboard paths and `Escape`
    precedence;
  - `docs/release-notes.md`, `README.md`, `docs/README.md`;
  - `AGENTS.md`: remove the "canvas is opt-in" rule and record the new default;
  - `CONTEXT.md`: update `Canvas view` to default, add the `Stage view` fallback
    term, and update Invariant 21 so it no longer calls Canvas opt-in;
  - `plans/ROADMAP.md`: update the intro paragraph, Owner decision 1, Feature 2,
    the Phase 17 status row, Section 2 (`Canvas view`), and Section 5 (`Bundle`)
    to record promotion in Phase 22;
  - `plans/PHASE-20.md`: record that the deferred promotion landed here;
  - `plans/INDEX.md`: add Phase 22.
- Record the bundle and performance numbers. Run `CI=1 pnpm test:canvas:perf`
  (with `CI=1` so the p95 and long-task thresholds are enforced) and
  `pnpm check:bundle`; do not claim the 60 KiB canvas budget passed.
- Record the manual accessibility follow-ups in `docs/canvas.md`.
- Run the final gate and Bunbun read-only check.

## Interface contract

### Player view

```ts
export type PlayerView = 'canvas' | 'stage';
export const DEFAULT_PLAYER_VIEW = 'canvas';

export function parsePlayerView(value: unknown): PlayerView | undefined;
export function resolvePlayerView(search: { view?: unknown }): PlayerView;
```

Resolution:

| URL                     | View   |
| ----------------------- | ------ |
| no `view`               | Canvas |
| `?view=canvas`          | Canvas |
| `?view=stage`           | Stage  |
| `?view=<anything else>` | Canvas |

The switch writes an explicit value (`?view=stage` or `?view=canvas`). The code
page validates `view: parsePlayerView(search.view)` and forwards `view: search.view`
on both the back link and anchor-outline navigation, so an explicit `'stage'` or
`'canvas'` survives round trips while a bare code-page URL returns to the
default view.

### Canvas fullscreen

```ts
export interface CanvasViewProps {
  tour: CompiledTour;
  chapter: CompiledChapter;
  beat: CompiledBeat;
  fullscreenSupported: boolean;
  fullscreenActive: boolean;
  onToggleFullscreen: () => void;
}
```

`PlayerPage` owns the fullscreen target (`.player-page`), the `F`/`Escape`
page-level fullscreen shortcuts, and clearing `theater` on entry. `CanvasView`
owns the canvas-specific reaction (hint, pulse, announcement, and entry/exit
`fitView`).

### Chapter drawer

`ChapterDrawer` receives the same chapter data and `onSeekBeat` callback as
`ChapterRail`, plus `theater: boolean`. It owns the disclosure state, positioning,
breakpoint/theater auto-close, active-beat initial focus, focus return, and
close behaviour. When open, it renders `ChapterRail` with `variant="drawer"`.

## Test seams

- **Pure view resolution.** `resolvePlayerView` and `parsePlayerView` through
  the new module. Catches default and unknown-value regressions without a
  browser. Does not prove URLs survive navigation.
- **Player route through Playwright.** Bare route, explicit Stage, explicit
  Canvas, reload, next/previous beat, and code-page round trips. Catches view
  loss at the route seam. Does not prove visual layout.
- **Chapter drawer through Playwright.** Widths 1440, 1024, 768, and 375 (in LTR
  and RTL); open, active-beat initial focus, select, Escape, outside click,
  resize across 1081 px, theater mode, focus return, active and completed
  markers. Catches the accessibility-tree and focus path. Does not prove manual
  screen reader output.
- **Fullscreen through Playwright with a fake Fullscreen API.** Use
  `function (this: Element) { active = this; ... }` to assert the requested
  element is `.player-page`, chrome remains visible, canvas re-fits on entry and
  exit, `Escape` steps out of overlays/items before exiting fullscreen, and
  `F`/`Esc` exit even when focus is on player chrome buttons or in compact view.
  Catches the API target and layout regression. Does not prove real browser
  fullscreen on every engine.
- **Axe through the existing a11y spec.** Default Canvas, explicit Stage, drawer
  open, fullscreen, compact layout, and 200% text. Catches critical and serious
  violations, not manual usability.
- **Existing player and canvas suites.** Catch Chrome, narration, Ask, resume,
  code-page, export, relation, and compact regressions.

Unit tests live at the pure module. UI behaviour is tested through Playwright,
matching the existing `apps/web` test stack; there is no component-unit harness
in this repository.

## Bunbun acceptance

1. Open `/t/tour_bunbun_golden/beat_purpose_01` with no query at 1440×900.
   Canvas is visible; the chapter rail, view switch, narration, and transport
   are present.
2. At 1024×768, open the chapter drawer, select `beat_write_02`, and confirm the
   canvas changes beat and the drawer closes.
3. At 375×900, confirm the compact canvas, drawer, narration, and transport do
   not overflow horizontally.
4. Switch to Stage, open a code page, and return. The player returns to Stage
   with the same beat.
5. Switch to Canvas, open a code container's code page, and return. The player
   returns to Canvas with the same beat.
6. Enter fullscreen from Canvas. Confirm the view switch, chapter navigation,
   narration, and transport remain visible, the board re-fits on entry and exit,
   and `F`/`Esc` return even after interacting with player chrome.
7. Run axe at 0 critical / 0 serious for the default Canvas, explicit Stage,
   drawer open, and fullscreen states.
8. Confirm the Bunbun tree is unchanged:
   `git -C /Users/ajc/Projects/codegens/bunbun status --porcelain` prints
   nothing.

## Exit criteria

- A bare player URL opens Canvas; `?view=stage` opens Stage; `?view=canvas`
  remains valid; unknown values default to Canvas.
- The switch writes an explicit view; reloads and beat navigation preserve it.
- Stage and Canvas both survive a code-page round trip.
- The chapter rail is present at 1440 px; the drawer is present and keyboard
  operable at 1024, 768, and 375 px (including RTL), and closes when widening
  to 1081 px or entering theater mode.
- Fullscreen keeps the view switch, chapter navigation, narration, and
  transport visible at 1440, 1024, 768, and 375 px, with the drawer path below
  1081 px and a scrollable compact canvas at 375 px.
- Theater, print, export, and compact canvas keep their existing behaviour.
- The embed player still opens Stage.
- Axe stays at 0 critical / 0 serious for every new state.
- Docs, AGENTS, CONTEXT (including Invariant 21), README, roadmap, phase status,
  and the plans index are current and no longer call Canvas opt-in.
- Manual VoiceOver/NVDA, Firefox/WebKit, and real-device touch are recorded as
  owner-gated follow-ups, not claimed as passed.
- `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`,
  `pnpm test:browser`, `pnpm test:a11y`, `CI=1 pnpm test:canvas:perf`,
  `pnpm test:coverage`, `pnpm check:version`, `pnpm check:toolchain`,
  `pnpm check:bundle`, and `pnpm check:secrets` pass.
- Bunbun remains read-only.

## Risks

- **Fullscreen target change.** Mocking `.canvas-root` or ignoring `this` in
  `Element.prototype.requestFullscreen` hides the change. Update every mock
  (`canvas.spec.ts`, `canvas-interactions.spec.ts`, and `canvas-fullscreen.spec.ts`)
  to set `active = this` and assert `.player-page` explicitly. Test the real
  browser path once by hand.
- **Fullscreen keyboard reach and `Escape` hierarchy.** Once player chrome sits
  inside fullscreen, focus can move outside `.canvas-root`, or the viewer can
  use the compact layout (`< 768 px`). `PlayerPage` must own the fullscreen `F`
  and `Escape` fallback keys, and `Escape` must close open overlays/drawers and
  step out of canvas items before exiting fullscreen.
- **Drawer inside fullscreen, scroll, and RTL.** A portal to `document.body`
  would vanish in fullscreen because it sits outside the fullscreen element.
  Keep the panel inside `.player-viewbar`, unmount it when closed, close it on
  `(min-width: 1081px)` or theater mode, and keep positioning anchored on page
  scroll and in RTL (`dir="rtl"`).
- **Narrow-height and compact fullscreen layout.** At 1024×768 with `AskPanel`
  open, or at 375 px in compact mode, an uncapped flex column crushes or clips
  the canvas. Fullscreen must cap `.narration` and `.ask-panel`, make
  `.canvas-root--compact` vertically scrollable, and keep `.resume-banner`
  compact rather than `display: none` so `hasResumed` can still be resolved.
- **View propagation gaps.** Every player-to-code path must carry the view:
  anchor links, container links, compact links, outline links, Ask citations,
  and the code-page outline. Relation-only containers without a tour beat anchor
  must not render a dead code-page link. The Stage round-trip test is the guard.
- **Test migration.** Several specs silently assume Stage. Update them in Wave 1
  when the default flips so no intermediate wave breaks `pnpm test:browser` or
  `pnpm test:a11y`.
- **Default bundle and performance.** Canvas is already statically imported, so
  promotion makes the existing web bundle the default cost. Run
  `CI=1 pnpm test:canvas:perf` so the budget assertions execute, and record the
  current bundle and p95; code splitting and the 60 KiB canvas budget stay out
  of scope.
- **Theater and fullscreen.** Entering fullscreen clears theater synchronously;
  pressing `t` in fullscreen may still hide chrome. Document that as intentional
  immersion, not a bug.
- **Manual accessibility.** Automated gates do not prove screen-reader
  equivalence. Record the owner-gated follow-ups and do not claim VoiceOver or
  NVDA passed.

## Rollback

Change `DEFAULT_PLAYER_VIEW` in `apps/web/src/lib/player-view.ts` from
`'canvas'` to `'stage'`. The explicit `?view=canvas` path, the switch, the
drawer, and the fullscreen chrome remain usable. No tour, embed, or schema
migration is needed.

## Working style

- Use `tdd` for `player-view.ts`, view tests, and each Playwright journey before
  the matching implementation.
- Use `codebase-design` for the view module and the `ChapterDrawer` interface:
  small caller surface, one owner for state, focus, and positioning.
- Use `design-taste-frontend` for the drawer, viewbar, and fullscreen chrome.
  Match the existing off-white/ink surfaces, cobalt accent, and restrained
  motion. No gradients, neon, or parchment.
- Use `caveman` for working notes and commit summaries; keep persisted prose
  plain.
- Use `writing-for-agents` when editing `AGENTS.md` or other agent instructions.
- Subagents read `AGENTS.md`, `CONTEXT.md`, and this phase before starting;
  install with `pnpm install --frozen-lockfile`; run their focused tests, then
  `pnpm typecheck`, `pnpm lint`, and `pnpm test`; commit with the trailer
  required by the current `AGENTS.md`; report branch, commit, files, test output,
  and integration assumptions.
- Main merges sequentially with `git merge --no-ff`, resolves shared-file drift
  in favour of the agreed contract, deletes each worktree only after the merge
  is verified, and runs the final gate from the merged tree.
- Record every number. Do not summarize a miss as a pass.

## Shipped (closure, 2026-11-02)

- **Default view** — `apps/web/src/lib/player-view.ts` resolves a bare beat to
  Canvas, accepts `?view=stage` and `?view=canvas`, and falls back to Canvas for
  unknown values. The router validates the choice on the player and code routes.
- **View preservation** — anchors, Stage code links, canvas container/compact/
  outline links, Ask citations, code-page back links, and code-page outline
  navigation carry the resolved view. Relation-only containers do not render a
  code-page link.
- **Chapter navigation** — `ChapterRail` gained a drawer variant and
  `ChapterDrawer` adds the trigger, panel, active-beat focus, Escape and outside
  close, breakpoint/theater auto-close, focus return, RTL clamping, and
  English/Spanish/Arabic labels. The persistent rail stays at 1081 px and wider.
- **Fullscreen chrome** — `PlayerPage` owns the `.player-page` fullscreen target,
  clears theater, exits fullscreen on a Stage switch, and owns the `F`/`Escape`
  fallback. `CanvasView` accepts the fullscreen props, re-fits on entry and exit,
  and orders Escape behind the overlays and roving focus. `AskPanel` consumes
  Escape before the page handler.
- **Layout** — fullscreen sizes the player to `100dvh`, keeps the canvas
  scrollable in compact mode, caps narration and Ask at short heights, hides the
  relation legend when constrained, and keeps the resume banner usable. Windowed
  narrow layouts keep canvas, narration, and transport in flow.
- **Tests** — 6 player-view journeys, 10 chapter-navigation journeys, and 12
  fullscreen journeys. The a11y suite covers default Canvas, explicit Stage,
  compact, 200% text, and the existing canvas states.

### Closure verification (fresh, 2026-11-02)

- `pnpm test` → 129 files / 1069 tests.
- `pnpm typecheck` and `pnpm exec oxlint apps packages scripts` clean.
- `pnpm test:browser` → 149 passed.
- `pnpm test:a11y` → 37 passed; 0 critical / 0 serious.
- `CI=1 pnpm test:canvas:perf` → 173 frames, p50 16.7 ms, p95 16.8 ms, max
  33.4 ms, 0 long tasks, heap ≈74.4 MB.
- `pnpm test:coverage` → 95.7% lines overall; canvas 96.16%, analyzer relations
  97.91%, API relations 94.44%.
- `pnpm build` clean; `pnpm check:bundle` → 848.30 KiB raw / 247.87 KiB gzip
  total, no canvas-specific chunk.
- `pnpm check:version`, `pnpm check:toolchain`, and `pnpm check:secrets` clean.
- Bunbun read-only check passed.

### Owner-gated / follow-ups

- VoiceOver on macOS and NVDA on Windows were not run. The owner accepted
  promotion before that manual pass; it remains the next accessibility gate.
- Real-device touch, Firefox, and WebKit remain outside the browser matrix.
- A real Save-as-PDF check remains manual.
- The canvas is still part of the main app bundle; code splitting and the 60 KiB
  canvas sub-budget remain follow-ups.
