# Phase 4 — Cinematic Player & Code Browser

**Status: planned.** Depends on: Phase 1 (minimal player), Phase 3 (real tours).

**Deliverable:** the full web experience: a movie-like player with auto-advance,
chapter navigation, scrubbing, pause/resume, text mode, a polished read-only code
browser, interactive diagrams, and local progress that survives reloads and
server restarts.

## Goal

Make a Sóþspell feel like a film that happens to be made of code. The user
should be able to watch without touching anything, pause at any moment, open the
code, click a diagram node, and return to the exact frame.

This phase is about the experience, not the model. It consumes the compiled tour
from Phase 3 and the analyzer snapshot from Phase 2.

## Why this order

- The authoring pipeline needs a player that can reveal whether the beats are
  well paced and whether the anchors are visually clear.
- The code browser and diagram interaction are the main differentiators; they
  deserve dedicated design and test time.
- Progress persistence must be stable before Q&A adds another state dimension.

## Scope

### In scope

- The full player UI and interaction model.
- Chapter navigation, beat timeline, scrubber, speed control, theater mode.
- Auto-advance in read mode; pause/resume; explicit-interaction pause rules.
- Code pages with Shiki highlighting, symbol breadcrumbs, line focus, stale
  badges, and back-to-beat links.
- Diagram interaction: focus, click-to-code, node details, sequence diagrams.
- Local progress in IndexedDB plus server persistence through an anonymous
  session.
- Resume/start-over, completed-beat tracking, export/import.
- Responsive layout and keyboard navigation.
- Playwright acceptance and visual checks.

### Out of scope

- Audio narration (Phase 5).
- Q&A and drilldown (Phase 6).
- Accounts and cross-device sync.
- Editing source code.
- A full file-tree IDE; the code browser is evidence-first.

## Decisions

1. **The stage is the product.** The player is not a chat window with a code
   block. The diagram and code share a stage, and the narration rail supports
   them.
2. **One primary action.** At any moment the primary control is Play or Pause.
   Everything else is secondary.
3. **Explicit interaction pauses.** Clicking a code link, a diagram node, or the
   ask box pauses playback. Hovering does not. Resume returns to the saved
   offset.
4. **Text mode is first-class.** It uses the same beats and diagrams, with a
   reading-speed timer. It is not a fallback page.
5. **Progress is local-first.** IndexedDB is written immediately; the server is a
   durability mirror. A server failure never blocks playback.
6. **The code browser is read-only.** No editor, no execution, no diff view in
   this phase. A stale badge is enough to prevent false confidence.
7. **Diagrams are deterministic.** Layout comes from the compiler, not the
   browser. The player animates focus, not graph structure.
8. **No dark-pattern autoplay.** Audio is not started without a user gesture.
   Text auto-advance can be paused globally in settings.

## Waves

### Wave 0 — Player information architecture

1. Route structure:
   - `/t/:tourId` — resume or start;
   - `/t/:tourId/:beatId` — deep link;
   - `/t/:tourId/:beatId/source/*` — player with code pane;
   - `/p/:projectId/source/*` — standalone code page;
   - `/runs` — progress list, export/import, delete.
2. Layout:
   - top bar: project, tour title, chapter, progress, settings;
   - left rail: chapters and beats, collapsible;
   - stage: diagram and code, switchable split;
   - narration rail: beat title, text, suggested questions, citations;
   - transport: play/pause, previous/next, scrubber, time, speed, captions
     (captions arrive in Phase 5).
3. Mobile:
   - stage first, narration sheet, sticky transport;
   - code opens as a full-screen view with a clear return control.
4. Empty/loading/error states for project, tour, source, and run.
5. Design read: clean modern devtool, off-white/ink, cobalt accent, Geist Sans
   and Geist Mono. No gradients, no neon, no decorative motion.

### Wave 1 — Playback engine and timing

1. Expand `packages/player`:
   - states: `idle`, `loading`, `playing`, `paused`, `seeking`, `asking`,
     `completed`, `error`;
   - commands: `play`, `pause`, `toggle`, `next`, `previous`, `seekBeat`,
     `seekOffset`, `setMode`, `setSpeed`, `complete`;
   - events: `beat.started`, `beat.offset`, `beat.completed`,
     `chapter.started`, `tour.completed`, `run.saved`, `error`;
   - a `Clock` port for deterministic timing; narration hooks arrive in Phase 5.
2. Auto-advance:
   - read mode uses `durationMs` adjusted by speed;
   - at beat end, advance to the next beat;
   - at chapter end, emit `chapter.completed` and continue;
   - at tour end, stop and show the summary.
3. Pause/resume:
   - freeze the offset;
   - explicit interaction pause records the reason;
   - resume returns to the same offset, not the beat start.
4. Seeking:
   - scrubber maps global progress to beat + offset;
   - chapter jump resets the offset to 0;
   - seeking while paused stays paused.
5. Tests with a fake clock:
   - auto-advance ordering;
   - pause/resume exact offset;
   - speed changes;
   - seek forward/backward;
   - chapter boundary events;
   - completion idempotence.

### Wave 2 — Code browser

1. Server-rendered code page:
   - file path, language, line count, symbol breadcrumb;
   - Shiki 4 HTML with a dual theme;
   - anchor highlight, focused line range, and non-color-only marker;
   - annotation panel from the beat;
   - copy link, copy code, open raw text;
   - stale badge and “source changed since this tour” explanation.
2. Symbol navigation:
   - anchors resolve to a symbol; the page scrolls to it and highlights the
     method or class;
   - a small symbol outline for the file, with anchors marked;
   - breadcrumb links to the project and the beat.
3. Virtualization:
   - files over 800 lines render through `@tanstack/react-virtual`;
   - line numbers and highlight overlays stay aligned;
   - keyboard scrolling works.
4. Deep links:
   - `/p/:projectId/source/<path>?anchor=<id>&beat=<id>`;
   - the page shows “From beat …” and returns to `/t/:tourId/:beatId?t=…`.
5. Accessibility:
   - code as an ordered list with line numbers in `aria-hidden` or a described
     label;
   - focus range announced by a summary;
   - highlight is not the only signal;
   - copy success announced.
6. Tests:
   - anchor focus renders the expected lines;
   - stale hash shows the badge;
   - deep link round trip;
   - virtualization keeps the focused line mounted;
   - keyboard-only navigation.

### Wave 3 — Diagram experience

1. Render architecture, dependency, flow, and tree diagrams with React Flow.
2. Add a sequence diagram renderer:
   - actors across the top;
   - ordered messages with arrows;
   - focus on a message range;
   - clicking an actor or message opens its anchor.
3. Interaction:
   - hover/focus highlights connected edges;
   - click opens a details popover with label, type, and code link;
   - keyboard focus order follows the graph;
   - pan/zoom with explicit controls, not scroll hijacking.
4. Focus transitions:
   - animate opacity and outline, not layout;
   - respect `prefers-reduced-motion`;
   - keep a stable layout across beats.
5. Readability:
   - node labels wrap at a fixed width;
   - edge labels are optional and short;
   - a “text view” lists nodes and edges for screen readers;
   - if a graph exceeds the readability budget, the compiler splits it or the
     validator rejects it.
6. Tests:
   - node click emits the anchor;
   - focus changes update aria state;
   - sequence order is correct;
   - text alternative matches the graph.

### Wave 4 — Progress and runs

1. `Run` model:
   ```ts
   interface Run {
     id: string;
     tourId: string;
     tourVersion: string;
     currentBeatId: string;
     offsetMs: number;
     completedBeatIds: string[];
     mode: 'read' | 'listen';
     speed: number;
     createdAt: string;
     updatedAt: string;
   }
   ```
2. IndexedDB store:
   - write on every beat start, pause, seek, and completion;
   - debounce high-frequency offset writes;
   - recover from a corrupt record by starting a new run.
3. Server store:
   - SQLite table `runs` keyed by signed anonymous session;
   - `GET /api/runs/:tourId`, `PUT /api/runs/:tourId`;
   - last-write-wins by `updatedAt` for the single-user case;
   - no account required.
4. Resume:
   - if a run exists and is not complete, show “Resume at …” with the beat
     title and timestamp;
   - “Start over” creates a new run after confirmation;
   - completed tours show a summary and chapter replay.
5. Export/import:
   - JSON file with schema version, tour ID, tour version, and run;
   - import validates the tour and version; a mismatch offers a fresh start.
6. Tests:
   - reload restores the exact beat and offset;
   - server down still plays and saves locally;
   - import round trip;
   - deleting a run removes local and server records.

### Wave 5 — Polish and acceptance

1. Keyboard shortcuts:
   - Space: play/pause;
   - Left/Right: previous/next beat;
   - Shift+Left/Right: seek 5 seconds;
   - `?`: shortcut help;
   - Esc: close dialogs/code pane;
   - avoid capturing keys while typing in the ask box.
2. Theater mode:
   - hide the chapter rail and narration chrome;
   - keep captions and transport;
   - exit with Esc.
3. Performance:
   - lazy-load the code page and React Flow;
   - preload the next beat's diagram/code;
   - keep the initial player route within budget.
4. Playwright acceptance:
   - open golden tour → play → pause → resume → next → open code → return;
   - click a diagram node → code page → back to the same beat;
   - reload → resume at the same offset;
   - keyboard-only run through the main controls;
   - mobile viewport smoke.
5. Visual pass:
   - light and dark mode;
   - long beat text, short beat text, empty suggestions;
   - 404/stale/error states.
6. Record bundle size and LCP.

## Test seams

Confirm before the first test:

1. `createPlayback(compiled, options) → Playback` (expanded).
2. `RunStore` (`load`, `save`, `delete`, `export`, `import`).
3. `GET/PUT /api/runs/:tourId`.
4. Code page rendering and anchor focus.
5. Diagram focus/click behavior.
6. Playwright journey.

What they cover and miss:

- Playback: catches timing and state transitions; misses visual transitions.
- Run store: catches persistence and merge; misses browser quota edge cases.
- API: catches route behavior; misses offline behavior.
- Code page: catches anchor/highlight behavior; misses large-file performance
  unless the virtualization test is real.
- Diagram: catches interaction semantics; misses aesthetic readability.
- Playwright: catches the real journey; slower and needs a server.

## Exit criteria (measurable)

1. The golden Bunbun tour plays end to end in read mode, including all six
   chapters and 19 beats, without manual intervention.
2. Pause/resume returns to within 150 ms of the saved offset.
3. Reloading the page resumes the same beat and offset.
4. Every beat can open its code page; every code page can return to the beat.
5. Every diagram node with an anchor opens the correct code page.
6. The code browser renders a 1,000-line file with virtualization and keeps the
   focused line mounted.
7. Keyboard-only: play, pause, next, previous, open code, return, and open
   shortcuts without a mouse.
8. Light and dark modes both pass the visual pass; no layout overflow at 375 px,
   768 px, or 1440 px.
9. Playwright acceptance is green; no unhandled console errors.
10. Initial player route bundle is under 500 kB gzipped (record actual).
11. `pnpm typecheck`, `pnpm lint`, and `pnpm test` are green.

## Risks and mitigations

- **Timing drift.** Use the player's clock as the source of truth; test with a
  fake clock and real browser timers.
- **Code viewer performance.** Virtualize and server-render highlighting; do not
  ship grammars to the client.
- **Diagram hairballs.** Enforce node/edge limits in the compiler; add a text
  alternative.
- **Progress conflicts.** Single-user last-write-wins; include `updatedAt` and a
  client ID; test reload/restart.
- **Mobile code pane.** Full-screen code with a persistent return control; do
  not squeeze code into a narrow split.
- **Over-animation.** Motion only for focus/transition, never perpetual; respect
  reduced motion.

## Working style

- Design first, then implement in vertical slices: one beat, one code page, one
  diagram, one run.
- Use `design-taste-frontend` for the visual pass; use `tdd` for player and run
  state; use `codebase-design` for the player/store seams.
- Verify in a real browser, not only happy-dom.
- Commit each wave; record bundle size and LCP in the phase closure note.
