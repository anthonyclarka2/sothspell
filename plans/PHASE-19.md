# Phase 19 — Accessible Interaction

**Status: planned.** Planning baseline: 2026-10-21. Depends on: Phases 17 and 18.

## Goal

Make the canvas fully operable without a pointer and understandable without
sight. Add the keyboard model, screen-reader outline, view preferences,
auto-zoom and auto-arrange explanations, high-contrast and colour-blind modes,
200% text support, and the compact layout below 768 px.

This phase closes the accessibility gate for the canvas era.

## Scope

### In

- A container-level keyboard model:
  - one canvas tab stop with roving focus;
  - arrows and `H`/`J`/`K`/`L` move selection between containers;
  - `Enter` enters a container, then arrows move through its objects, lines,
    symbol links, and actions;
  - `Enter` activates the focused item;
  - `Escape` steps out: item → container → home diagram;
  - `Tab` leaves the canvas; `Shift+Tab` returns to the active container;
  - spatial nearest-neighbour movement with a stable DOM-order fallback.
- Shortcut sheet (`?`) with focus trap and focus return. Shortcuts: `F`
  fullscreen, `0` fit all, `1` reset zoom, `+`/`-` zoom, `Shift+A`
  auto-arrange, `Shift+H` home, `?` help.
- Screen-reader outline:
  - built on the Phase 17 minimal outline and the Phase 18 relation extension;
  - ordered home diagram, objects, code containers, and relationships;
  - relation counts and kinds in each container's description;
  - the same open, incoming, outgoing, definition, and code-page actions;
  - a visible outline panel and a compact-mode outline.
- Live announcements for selection, container opened, relation loaded, viewport
  fit, fullscreen, auto-zoom, auto-arrange, and preference changes. Zoom ticks are
  throttled and not announced continuously.
- View preferences stored locally:
  - auto-zoom, auto-arrange, follow beat;
  - reduced motion (`system`, `reduce`, `full`);
  - contrast (`system`, `more`);
  - palette (`default`, `colour-blind`);
  - text scale (`100`, `125`, `150`, `200`);
  - first-run seen flags;
  - saved layouts per tour, with reset.
- First-run messages for auto-zoom and auto-arrange with Undo, "Disable this for
  me", and a confirmation after disabling. Messages do not take focus, pause
  while hovered or focused, and remain available from the shortcut sheet.
- High-contrast, forced-colours, colour-blind, and 200% text support.
- Compact vertical layout below 768 px with the same containers and actions.
- Touch targets, pinch zoom, and drag alternatives.
- Manual VoiceOver checklist with recorded results. NVDA is owner-gated on a
  Windows VM or remote machine.

### Out

- Export and performance hardening; Phase 20.
- New relation analysis; Phase 18.
- A full preferences page. Canvas preferences stay in the in-view display menu.
- Account sync for view preferences.
- A freeform editor, multi-select, notes, search, and minimap.
- Automated screen-reader equivalence claims. The checklist is manual.

## Decisions

1. **The canvas owns selection, not React Flow.** React Flow's default arrow keys
   move nodes. Disable that behaviour, keep its pan/zoom and rendering, and drive
   selection through a pure reducer in `packages/canvas`.
2. **Spatial movement uses geometry.** Arrow/HJKL chooses the nearest container
   in that direction, with no wrap, then falls back to DOM order for ties. This
   matches the visual board and keeps keyboard order predictable.
3. **One tab stop.** Tab enters the board at the active container; it does not
   walk 40 nodes. Inside a container, items use roving focus.
4. **The outline is a first-class path.** It is not a hidden fallback. It uses
   the same scene and actions, and it is the default presentation in compact
   mode.
5. **No `role="application"`.** The board uses semantic groups, buttons, and
   lists. An application role would override screen-reader navigation and make
   the outline harder to reach.
6. **Preferences are local and immediate.** "Disable this for me" writes the
   preference in place and confirms with a status message; it does not navigate
   to a settings page.
7. **First-run messages are persistent enough.** A 12-second auto-hide is allowed
   only while the message is not hovered or focused. The same Undo and preference
   actions remain available from the shortcut sheet, so the message is never the
   only path.
8. **Colour is never the only signal.** Relation kinds use line style and labels;
   status uses text and icons; focus uses a 2 px outline plus a background
   change.
9. **Text scale is a canvas preference, not page zoom.** It scales canvas text
   and card dimensions and re-runs layout. Browser zoom and 200% text both pass.
10. **Compact is a different presentation, not a degraded one.** Every action is
    present, and relationship text replaces the spatial link.
11. **Canvas focus owns only the keys it uses.** The player currently listens on
    `window` for Space, arrows, `T`, and Escape. When focus is inside the canvas,
    the canvas handles arrows/HJKL, Enter, Escape, and its own shortcuts, and
    stops those before the player sees them. Space on a button or link activates
    it natively and stops propagation; Space on the board background toggles
    playback through the player. `T` passes through to the player's theater
    toggle. Add a regression test for every shared key and document the result in
    the shortcut sheet.
12. **Fullscreen Escape exits first.** Escape inside native fullscreen exits
    fullscreen and preserves the current selection. Outside fullscreen, Escape
    steps item → container → home diagram.

## Waves

### Wave 1 — Keyboard reducer and focus model

- `packages/canvas` adds `moveSelection(scene, selection, direction)` and
  `enterContainer`, `moveInside`, `activateItem`, and `escape`.
- Geometry: compare card centers within a direction cone; prefer the nearest
  edge, then the smallest perpendicular distance. No wrap.
- Focus follows selection with `element.focus({ preventScroll: true })` and a
  measured pan only when the card is outside the safe viewport.
- The board is a single tab stop. Containers have `tabindex="-1"` except the
  active one, which has `tabindex="0"`. The compiled Shiki HTML carries
  `tabindex="0"` on its `<pre>`; the canvas strips or overrides it so a code
  container does not add a second tab stop. The code page keeps its own
  focusable viewport.
- Inside a container: first/last item, arrow navigation, Enter activation, and
  Escape to the container. Symbol links, line links, Incoming, Outgoing, Open
  code page, and Collapse are in the item order.
- Shortcut sheet is a modal dialog with focus trap, Escape close, and focus
  return. It lists every shortcut and the first-run tips.
- Tests: reducer unit cases for every direction, tie, edge, empty container,
  disabled action, and step-out; browser keyboard journey; focus return after the
  sheet; shared-key regression for Space on a button, Space on the board, arrows,
  `T`, and Escape; no key handling while typing in the ask panel or locale
  selector.

### Wave 2 — Screen-reader outline and announcements

- `CanvasOutline` renders:
  - a heading for the tour, chapter, and beat;
  - the home diagram as a group with its objects as buttons;
  - satellite diagrams;
  - each code container as a group with symbol, path, lines, relation counts,
    and actions;
  - selected state with `aria-current="true"`.
- Each container has an `aria-describedby` summary: "2 incoming calls, 1
  outgoing reference, static analysis".
- A persistent polite live region announces selection, opened containers,
  relations, fit, fullscreen, and preference changes. Errors use `role="alert"`.
- The board has `role="region"`, an accessible name from the tour and beat, and
  `aria-roledescription="tour canvas"`, plus a hidden instruction sentence.
  Containers use `role="group"`; objects use native buttons.
- Tests: outline order, accessible names, relation counts, action parity with the
  board, live messages for open/incoming/fit, no focus theft, and axe with
  `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, and `wcag22aa` tags.
- Manual checklist: VoiceOver on Safari and Chrome. NVDA on Chrome and Firefox is
  recorded only when a Windows VM or remote machine is available; otherwise the
  gap is recorded as owner-gated. Record browser, OS, date, and result in
  `docs/canvas.md`.

### Wave 3 — Preferences, auto-zoom, and auto-arrange

- `packages/canvas` preference schema with defaults and migration.
- `apps/web` local store over `localStorage`, one key
  `sothspell:canvas-preferences:v1`.
- Display menu: motion, contrast, palette, text scale, auto-zoom, auto-arrange,
  follow beat, saved layout reset.
- Auto-zoom: after a new container opens, frame the source and the container
  with 48 px padding. 220 ms transform, instant under reduced motion. Undo
  restores the previous viewport and selection.
- Auto-arrange: deterministic placement after a new container opens when the
  preference is on; Undo restores positions. Manual auto-arrange always runs.
- First-run messages:
  - "Zoomed to show the new code. Undo. Disable auto-zoom."
  - "Arranged the board. Undo. Disable auto-arrange."
  - After disabling: "Auto-zoom is off for this browser. Turn it back on in
    Display." The message is a status, not a focus target.
  - "Undo last canvas action" remains available in the shortcut sheet after the
    message disappears.
- Saved layouts: positions per tour and chapter, keyed by a versioned scene hash;
  reset when the tour revision changes or the user resets.
- Tests: preference defaults, persistence, invalid stored value, disable path,
  undo restores, reduced motion is instant, layout restores, revision reset.
- Seam: preference store and the auto-zoom/auto-arrange commands.

### Wave 4 — Contrast, colour, and text scale

- Add semantic canvas tokens for background, card, line, evidence, flow, focus,
  dimmed, and selected states.
- Default palette uses the existing design tokens and cobalt accent.
- High-contrast mode: 7:1 body text where possible, stronger borders, thicker
  evidence links, de-emphasized links and borders instead of dimmed text, and a
  solid focus ring.
- `@media (prefers-contrast: more)` applies the same high-contrast tokens when
  the user has not chosen an explicit mode.
- `@media (forced-colors: active)`: use `CanvasText`, `Canvas`, `Highlight`, and
  `LinkText`; keep card borders, line styles, and focus outlines; do not hide
  controls or rely on background images.
- Colour-blind palette: Okabe–Ito accents for relation and node categories,
  paired with line style and labels.
- Text scale: root canvas font size and card width use relative units; line
  handles re-measure after scale changes; no clipping at 200%.
- Tests: computed contrast for text, borders, focus, and lines; forced-colours
  screenshot; high-contrast screenshot; colour-blind palette screenshot; 200%
  text and a 360 CSS px reflow at 400%-equivalent zoom; axe in every mode with
  WCAG 2.2 A/AA tags. Playwright emulates the narrow viewport, not browser zoom;
  the manual checklist covers real browser zoom.
- Seam: CSS tokens and the display menu; no per-component colour logic.

### Wave 5 — Compact layout, touch, and closure

- `<768 px`: `CanvasCompact` renders the outline as the primary view:
  beat heading, home diagram card, objects, code containers, relation text, and
  actions. The spatial board is not rendered.
- `768–1024 px`: canvas with a collapsible outline drawer and compact controls.
- Touch: one-finger pan, two-finger pinch, 44 px touch targets on coarse
  pointers, and a visible alternative for every drag action.
- Reflow: no horizontal page scroll at 375 px; code lines scroll inside their
  container, not the page.
- Visual snapshots at 1440, 1024, 768, and 375, in light, dark, forced colours,
  and high contrast.
- Manual checklist: keyboard-only, VoiceOver, NVDA when available, 200% text,
  reduced motion, touch.
- Update `docs/accessibility.md` and `docs/canvas.md` with the keyboard map,
  modes, and manual results.

## Test seams

- Selection reducer and preference schema in `packages/canvas`.
- Auto-zoom/auto-arrange command with a fake viewport.
- `CanvasOutline` as a component over a fixture scene.
- Canvas route with Playwright for keyboard, focus, live regions, and modes.
- CSS mode tests through `page.emulateMedia` and `test.use`.
- Manual screen-reader checklist; not an automated pass.

## Bunbun acceptance

1. Enter the canvas on `beat_write_02` with Tab only.
2. Move to the `CommentsService` object with arrows and HJKL.
3. Press Enter, move to its symbol link, press Enter, and open the definition.
4. Open Incoming and Outgoing from the container with the keyboard.
5. Press Escape three times and return to the home diagram.
6. Open the outline, read the containers and relation counts, and activate an
   action.
7. Turn on high contrast, colour-blind palette, and 200% text; no content is
   clipped and no action disappears.
8. Resize to 375 px; the compact view preserves every action.
9. Run axe at 0 critical / 0 serious in every mode.
10. Confirm the Bunbun tree is unchanged.

## Exit criteria

- The keyboard journey completes with one tab stop and no focus trap.
- Focus is visible at 3:1 and never obscured by the controls.
- The outline exposes every board action and relation.
- Live regions announce every state change without flooding.
- Auto-zoom and auto-arrange are undoable, disableable in place, and confirmed.
- Preferences persist across reload and reset safely when invalid.
- Forced colours, high contrast, colour-blind palette, 200% text, and 375 px all
  pass axe and manual checks.
- Manual VoiceOver results are recorded; NVDA is recorded as run or
  owner-gated.
- Existing player and embed accessibility suites stay green.
- Bunbun remains read-only.

## Risks

- **Spatial keyboard navigation feels arbitrary.** Test with a board where cards
  are diagonal and overlapping. Use a direction cone and deterministic ties.
- **Focus and pan fight each other.** Pan only when the focused card is outside
  the safe viewport; never pan on every key repeat.
- **Live-region spam.** Announce selection and actions, not zoom ticks or every
  pointer hover. Throttle viewport announcements.
- **Preference complexity.** Keep one schema and one migration path. Invalid
  values fall back to defaults rather than breaking the canvas.
- **Forced colours.** Author colours are replaced. Test the actual borders,
  line styles, and focus ring, not just the default theme.
- **Manual testing drift.** Record browser, OS, and date; repeat the checklist
  before promoting canvas to default.

## Working style

- Use `tdd` for the selection reducer, preference store, and auto-zoom command.
- Use `codebase-design` for the outline interface: one scene in, one semantic
  tree out, with no canvas-only actions.
- Use `design-taste-frontend` for the display menu and compact layout. The
  compact view is a reading layout, not a shrunken board.
- Use `domain-modeling` for the preference and relation vocabulary.
- Verify with the real Chrome accessibility tree and a real screen reader, not
  only axe.
- Record manual results and screenshots in `docs/canvas.md`.

## Shipped (closure, 2026-10-21)

- **Preferences** — versioned localStorage for auto-zoom, auto-arrange, follow
  beat, motion, contrast, palette, text scale, first-run flags, and saved
  viewports. Invalid values fall back per field; reset is in the display menu.
- **Auto-zoom and auto-arrange** — source-plus-container framing, deterministic
  arrangement, 220 ms transform (instant under reduced motion), first-run
  notices with Undo and in-place disable, and persistent shortcut-sheet actions.
- **Display menu** — appearance controls for motion, contrast, palette, text
  size, auto-zoom, auto-arrange, follow beat, and resets. Root attributes:
  `data-motion`, `data-contrast`, `data-palette`, `data-text-scale`.
- **Keyboard** — arrow/HJKL spatial movement, Enter to enter/activate, Escape
  item → container → home, Shift+H home, Shift+A arrange, `0` fit, `1` reset,
  `F` fullscreen, `?` shortcuts. Handled keys stop before the player; Space and
  `T` keep their player meaning on the board.
- **Compact canvas** — below 768 px the same scene becomes a vertical list with
  objects, code, relation toggles/status, and the full action set.
- **Modes** — high contrast, `prefers-contrast: more`, forced colours, an
  Okabe–Ito colour-blind palette with line styles and labels, 200% text with
  re-measured line handles, and a visible focus ring.
- **Tests** — 17 new preference/focus unit tests, 15 new canvas accessibility
  browser tests, display/compact/preferences axe states.

### Closure verification (fresh, 2026-10-21)

- `pnpm test`: 123 files / 1025 tests passed.
- `pnpm typecheck`, `pnpm lint`, and `pnpm build` clean.
- `SOTHSPELL_WEB_PORT=5277 SOTHSPELL_API_PORT=4316 pnpm test:browser`:
  105 passed, including keyboard/HJKL, Space and `T` handoff, auto-zoom/arrange
  undo and disable, preference persistence, compact at 375 px, 200% text,
  forced colours, `prefers-contrast`, high contrast, and colour-blind palette.
- Axe: 0 critical / 0 serious in every new state.
- Web bundle after the accessibility layer: 809.79 kB / 238.08 kB gzip.
- Bunbun tree clean.

### Follow-ups

- Manual VoiceOver and NVDA checks have not been run. VoiceOver is the required
  Phase 20 manual check; NVDA remains owner-gated on Windows.
- Container dragging and saved manual layouts are not enabled; saved viewports
  are restored per scene, but the board still uses the deterministic layout.
- Touch-target and real-device pinch checks remain manual Phase 20 checks.
