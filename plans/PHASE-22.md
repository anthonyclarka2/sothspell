# Phase 22 — Canvas by Default

**Status: planned (2026-11-02).** Planning baseline: 2026-11-02. Depends on:
Phases 17–20 and the Phase 21 interaction patch (container move, resize, close,
selection, and fullscreen re-fit).

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
   same seek action.
5. **Fullscreen keeps the player chrome.** Fullscreen targets `.player-page`,
   not `.canvas-root`. The viewbar, chapter rail or drawer, narration,
   transport, and Ask panel remain inside the fullscreen surface. The canvas
   still re-fits when the viewport changes.
6. **Theater is still the immersive mode.** Entering fullscreen clears theater
   so the chrome is present by default. Pressing `t` in fullscreen may still
   hide the rail and narration aside; that is an explicit choice.
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

### Wave 1 — Default view and link propagation (main)

Branch: `phase-22-a-default-view` in the primary checkout.

- Add `apps/web/src/lib/player-view.ts`:
  - `type PlayerView = 'canvas' | 'stage'`;
  - `DEFAULT_PLAYER_VIEW = 'canvas'`;
  - `parsePlayerView(value): PlayerView | undefined`;
  - `resolvePlayerView(search): PlayerView`.
- Update `apps/web/src/router.tsx`:
  - player search accepts `canvas` and `stage`;
  - code-page search accepts `view` alongside `anchor`, `beat`, and `tourId`.
- Update `apps/web/src/routes/PlayerPage.tsx`:
  - default resolves to Canvas;
  - both switch buttons write an explicit view;
  - beat changes and reloads preserve the current view;
  - `openAnchor` carries the current view to the code page;
  - pass the view to `StageView` and `AskPanel`.
- Update `apps/web/src/routes/CodePage.tsx`:
  - validate `view`;
  - the back link carries the current view;
  - the anchor outline carries the current view.
- Carry `view: 'stage'` through `CodePane` and `StageView`.
- Carry `view: 'canvas'` through `CanvasCodeContainer`, `CanvasCompact`, and
  `CanvasOutline`.
- Add `apps/web/src/lib/player-view.test.ts`.
- Add `apps/web/e2e/player-view.spec.ts`.

### Wave 2 — Chapter navigation parity (subagent A, parallel with main docs)

Worktree: `.worktrees/phase-22-b-chapter-nav`  
Branch: `phase-22-b-chapter-nav`  
Base: the Wave 1 commit.

- `apps/web/src/components/ChapterRail.tsx`:
  - add `variant?: 'rail' | 'drawer'`;
  - drawer variant adds `chapter-rail--drawer`;
  - keep the existing heading, chapter labels, beat buttons, `aria-current`,
    completed markers, and current-chapter metadata.
- `apps/web/src/components/ChapterDrawer.tsx` (new):
  - trigger in `.player-viewbar` with `aria-expanded` and `aria-controls`;
  - fixed-position panel inside the player tree, never portalled to `body`, so
    it remains inside the fullscreen element;
  - panel repositions from the trigger rect on open and on resize;
  - Escape and outside pointerdown close it;
  - focus moves into the panel on open and returns to the trigger on close;
  - selecting a beat seeks and closes the panel.
- `apps/web/src/routes/PlayerPage.tsx`:
  - wire `ChapterDrawer` into the viewbar;
  - keep the persistent `ChapterRail` as the wide-screen path.
- `apps/web/src/styles.css`:
  - change the 1080 px rule from hiding `.chapter-rail` to hiding
    `.chapter-rail:not(.chapter-rail--drawer)`;
  - hide the drawer at 1081 px and wider;
  - keep theater hiding chapter navigation;
  - drawer panel width, max-height, scroll, z-index, and 375 px reflow.
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
  - clear theater when fullscreen starts;
  - pass `fullscreenSupported`, `fullscreenActive`, and `onToggleFullscreen` to
    `CanvasView`.
- `apps/web/src/components/canvas/CanvasView.tsx`:
  - remove the internal `useFullscreen` and its import;
  - accept the three fullscreen props;
  - keep the existing fullscreen hint, pulse, announcement, and fit effect;
  - keep `rootRef` for focus and DOM selection only.
- `apps/web/src/styles.css`:
  - `.player-page:fullscreen` and `.player-page--fullscreen` size to `100dvh`;
  - layout fills the remaining height;
  - canvas `min-height: 0` in fullscreen;
  - narration capped and scrollable;
  - transport static;
  - resume banner hidden in fullscreen;
  - 1024, 768, and 375 px fullscreen reflow.
- `apps/web/e2e/canvas.spec.ts`:
  - fullscreen mock targets `.player-page`;
  - stage-switch URL assertions move from `not view=canvas` to `view=stage`.
- `apps/web/e2e/canvas-fullscreen.spec.ts` (new).

Subagent B must not touch `ChapterRail.tsx` or `ChapterDrawer.tsx`. If the
drawer needs a fullscreen-specific fix, B reports it; A already closed.

### Wave 4 — Test migration, docs, and final gate (main)

- Update existing Playwright specs that assume the Stage is the default:
  - `apps/web/e2e/a11y.spec.ts`: keep one Stage URL and one Canvas URL;
  - `apps/web/e2e/tour.spec.ts`: keep Stage-specific diagram-node coverage
    behind `?view=stage`;
  - `apps/web/e2e/translation.spec.ts`, `account.spec.ts`, and
    `new-tour.spec.ts`: verify they still pass with Canvas as the default;
  - `canvas-*.spec.ts`: keep explicit `?view=canvas` URLs where the test is
    canvas-specific.
- Update docs:
  - `docs/canvas.md`: default view, Stage fallback, drawer, fullscreen chrome;
  - `docs/player.md`: Stage is the fallback and the embed layout;
  - `docs/accessibility.md`: drawer and fullscreen keyboard paths;
  - `docs/release-notes.md`, `README.md`, `docs/README.md`;
  - `AGENTS.md`: remove the "canvas is opt-in" rule and record the new default;
  - `CONTEXT.md`: Canvas view is the default; add the Stage view fallback term;
  - `plans/ROADMAP.md`: owner decision 1 is superseded by Phase 22;
  - `plans/PHASE-20.md`: record that the deferred promotion landed here;
  - `plans/INDEX.md`: add Phase 22.
- Record the bundle and performance numbers. Run `pnpm test:canvas:perf` and
  `pnpm check:bundle`; do not claim the 60 KiB canvas budget passed.
- Record the manual accessibility follow-ups in `docs/canvas.md`.
- Run the final gate and Bunbun read-only check.

## Interface contract

### Player view

```ts
export type PlayerView = 'canvas' | 'stage';
export const DEFAULT_PLAYER_VIEW: PlayerView = 'canvas';

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

The switch writes an explicit value. The code page accepts and returns it.

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

`PlayerPage` owns the fullscreen target and state. `CanvasView` owns only the
canvas-specific reaction to that state.

### Chapter drawer

`ChapterDrawer` receives the same chapter data and `onSeekBeat` callback as
`ChapterRail`. It owns only the disclosure state, positioning, focus return,
and close behaviour. It renders `ChapterRail` with `variant="drawer"`.

## Test seams

- **Pure view resolution.** `resolvePlayerView` and `parsePlayerView` through
  the new module. Catches default and unknown-value regressions without a
  browser. Does not prove URLs survive navigation.
- **Player route through Playwright.** Bare route, explicit Stage, explicit
  Canvas, reload, next/previous beat, and code-page round trips. Catches view
  loss at the route seam. Does not prove visual layout.
- **Chapter drawer through Playwright.** Widths 1440, 1024, 768, and 375; open,
  select, Escape, outside click, focus return, active and completed markers.
  Catches the accessibility-tree and focus path. Does not prove manual screen
  reader output.
- **Fullscreen through Playwright with a fake Fullscreen API.** Assert the
  requested element is `.player-page`, chrome remains visible, canvas re-fits,
  and `F`/`Esc` exit. Catches the API target and layout regression. Does not
  prove real browser fullscreen on every engine.
- **Axe through the existing a11y spec.** Default Canvas, drawer open, fullscreen,
  compact layout, and 200% text. Catches critical and serious violations, not
  manual usability.
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
   narration, and transport remain visible, the board re-fits, and `F`/`Esc`
   return.
7. Run axe at 0 critical / 0 serious for the default Canvas, drawer open, and
   fullscreen states.
8. Confirm the Bunbun tree is unchanged:
   `git -C /Users/ajc/Projects/codegens/bunbun status --porcelain` prints
   nothing.

## Exit criteria

- A bare player URL opens Canvas; `?view=stage` opens Stage; `?view=canvas`
  remains valid; unknown values default to Canvas.
- The switch writes an explicit view; reloads and beat navigation preserve it.
- Stage and Canvas both survive a code-page round trip.
- The chapter rail is present at 1440 px; the drawer is present and keyboard
  operable at 1024, 768, and 375 px.
- Fullscreen keeps the view switch, chapter navigation, narration, and
  transport visible at 1440 and 1024 px, with the drawer path at 1024 px.
- Theater, print, export, and compact canvas keep their existing behaviour.
- The embed player still opens Stage.
- Axe stays at 0 critical / 0 serious for every new state.
- Docs, AGENTS, CONTEXT, README, roadmap, phase status, and the plans index are
  current and no longer call Canvas opt-in.
- Manual VoiceOver/NVDA, Firefox/WebKit, and real-device touch are recorded as
  owner-gated follow-ups, not claimed as passed.
- `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`,
  `pnpm test:browser`, `pnpm test:a11y`, `pnpm test:canvas:perf`,
  `pnpm test:coverage`, `pnpm check:version`, `pnpm check:toolchain`,
  `pnpm check:bundle`, and `pnpm check:secrets` pass.
- Bunbun remains read-only.

## Risks

- **Fullscreen target change.** Mocking `.canvas-root` hides the change. Update
  every mock and assert `.player-page` explicitly. Test the real browser path
  once by hand.
- **Fixed drawer inside fullscreen.** A portal to `document.body` would vanish
  in fullscreen because it sits outside the fullscreen element. Keep the panel
  inside the player subtree and use fixed positioning from the trigger rect.
- **Narrow-height layout.** At 1024×768 the player already scrolls. Fullscreen
  must switch to a fixed grid and cap narration, or the canvas collapses.
- **View propagation gaps.** Every player-to-code path must carry the view:
  anchor links, container links, compact links, outline links, Ask citations,
  and the code-page outline. The Stage round-trip test is the guard.
- **Test migration.** Several specs silently assume Stage. Audit every
  `/t/` navigation and keep explicit Stage coverage where the assertion is
  Stage-specific.
- **Default bundle and performance.** Canvas is already statically imported, so
  promotion makes the existing web bundle the default cost. Record the current
  bundle and p95; code splitting and the 60 KiB canvas budget stay out of scope.
- **Theater and fullscreen.** Entering fullscreen clears theater; pressing `t`
  in fullscreen may still hide chrome. Document that as intentional immersion,
  not a bug.
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
