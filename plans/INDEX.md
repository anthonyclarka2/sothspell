# Plans Index

Current era: canvas playback (Phases 17–20) plus the Phase 22 promotion. **Complete
(automated gates; manual accessibility and PDF sign-off owner-gated).** Phase 21
followed as an interaction patch: container resize/move/close, object selection,
fullscreen re-fit, and Shiki line-gap removal. Phase 22 made Canvas the web
player default and kept the Stage as the fallback.

## Documents

| Document                                   | Purpose                                                                                                                    |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| [`CANVAS-FEATURES.md`](CANVAS-FEATURES.md) | Original deliverables and hard constraints                                                                                 |
| [`ROADMAP.md`](ROADMAP.md)                 | Era decisions, architecture, interaction grammar, budgets, research, risks                                                 |
| [`PHASE-17.md`](PHASE-17.md)               | **Complete:** foundation, renderer, evidence links, multiple diagrams, controls, fullscreen, outline                       |
| [`PHASE-18.md`](PHASE-18.md)               | **Complete:** relationships, schema 1.2.0, symbol targets, call edges, relation API, incoming/outgoing, definitions        |
| [`PHASE-19.md`](PHASE-19.md)               | **Complete (automated):** keyboard, outline, preferences, contrast, large text, compact view; manual VoiceOver in Phase 20 |
| [`PHASE-20.md`](PHASE-20.md)               | **Complete (automated):** export, performance, coverage, docs, final gate; manual SR/PDF owner-gated                       |
| [`PHASE-22.md`](PHASE-22.md)               | **Complete:** Canvas default, Stage fallback, chapter drawer, fullscreen player chrome                                     |
| [`../issues/`](../issues/)                 | 19 numbered implementation issues in the Bunbun text format                                                                |

## Feature to phase

| Feature                           | Phase | Main code                                                 |
| --------------------------------- | ----- | --------------------------------------------------------- |
| Canvas scene and layout           | 17    | `packages/canvas`                                         |
| Canvas default route              | 17    | `apps/web` player                                         |
| Evidence links                    | 17    | `packages/canvas`, `apps/web` canvas                      |
| Multiple diagrams                 | 17    | `apps/web` canvas                                         |
| Controls and fullscreen           | 17    | `apps/web` canvas                                         |
| Minimal outline                   | 17    | `apps/web` canvas                                         |
| Schema 1.2.0 and symbol targets   | 18    | `packages/core`, `packages/diagram`, `packages/authoring` |
| TS/JS call edges                  | 18    | `packages/analyzer`                                       |
| Relation API                      | 18    | `apps/api`                                                |
| Incoming/outgoing and definitions | 18    | `apps/web` canvas                                         |
| Shared-symbol bridge              | 18    | `apps/web` canvas                                         |
| Keyboard model                    | 19    | `packages/canvas`, `apps/web` canvas                      |
| Screen-reader outline             | 19    | `apps/web` canvas                                         |
| Preferences and coach marks       | 19    | `apps/web` canvas                                         |
| Contrast, palette, text scale     | 19    | `apps/web` canvas                                         |
| Compact layout                    | 19    | `apps/web` canvas                                         |
| PNG/JPG/PDF export                | 20    | `packages/canvas`, `apps/web` canvas                      |
| Performance and coverage          | 20    | tests, `docs/canvas.md`                                   |
| Default Canvas and Stage fallback | 22    | `apps/web` player, `apps/web/src/lib/player-view.ts`      |
| Chapter drawer and fullscreen     | 22    | `apps/web` player, `apps/web/src/styles.css`              |

## Worktrees

All worktrees were removed after their branches merged sequentially. The merge
commits are the history: `1f37b98`/`3bccf88`/`be02945` (Phase 17), `04b53f5`/
`068e569`/`e378e86`/`2c08b75` (Phase 18), `e7081b7`/`b5166e8` (Phase 19),
`59801b5`/`0355980` (Phase 20), `21fff20` (canvas interaction patch), and
`f41bf6c`/`8717409` (Phase 22 chapter drawer and fullscreen chrome).
