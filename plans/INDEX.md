# Plans Index

Current era: canvas playback (Phases 17–20). Last planning commit:
`6eff007` on `feature/canvas`.

## Documents

| Document | Purpose |
| --- | --- |
| [`CANVAS-FEATURES.md`](CANVAS-FEATURES.md) | Original deliverables and hard constraints |
| [`ROADMAP.md`](ROADMAP.md) | Era decisions, architecture, interaction grammar, budgets, research, risks |
| [`PHASE-17.md`](PHASE-17.md) | Foundation: scene, renderer, evidence links, multiple diagrams, controls, fullscreen, outline |
| [`PHASE-18.md`](PHASE-18.md) | Relationships: schema 1.2.0, symbol targets, call edges, relation API, incoming/outgoing, definitions |
| [`PHASE-19.md`](PHASE-19.md) | Accessibility: keyboard, outline, preferences, contrast, large text, compact view |
| [`PHASE-20.md`](PHASE-20.md) | Export, performance, coverage, docs, final gate |
| [`../issues/`](../issues/) | 18 numbered implementation issues in the Bunbun text format |

## Feature to phase

| Feature | Phase | Main code |
| --- | --- | --- |
| Canvas scene and layout | 17 | `packages/canvas` |
| Opt-in canvas route | 17 | `apps/web` player |
| Evidence links | 17 | `packages/canvas`, `apps/web` canvas |
| Multiple diagrams | 17 | `apps/web` canvas |
| Controls and fullscreen | 17 | `apps/web` canvas |
| Minimal outline | 17 | `apps/web` canvas |
| Schema 1.2.0 and symbol targets | 18 | `packages/core`, `packages/diagram`, `packages/authoring` |
| TS/JS call edges | 18 | `packages/analyzer` |
| Relation API | 18 | `apps/api` |
| Incoming/outgoing and definitions | 18 | `apps/web` canvas |
| Shared-symbol bridge | 18 | `apps/web` canvas |
| Keyboard model | 19 | `packages/canvas`, `apps/web` canvas |
| Screen-reader outline | 19 | `apps/web` canvas |
| Preferences and coach marks | 19 | `apps/web` canvas |
| Contrast, palette, text scale | 19 | `apps/web` canvas |
| Compact layout | 19 | `apps/web` canvas |
| PNG/JPG/PDF export | 20 | `packages/canvas`, `apps/web` canvas |
| Performance and coverage | 20 | tests, `docs/canvas.md` |

## Worktrees

| Track | Worktree | Scope |
| --- | --- | --- |
| 17-a | `.worktrees/phase-17-a-canvas-model` | `packages/canvas/**` |
| 17-b | `.worktrees/phase-17-b-web-shell` | fullscreen adapter, StageView extraction, narrow fallback |
| 17-c | `.worktrees/phase-17-c-canvas-view` | `apps/web/src/components/canvas/**`, player canvas branch, styles |
| 17-d | `.worktrees/phase-17-d-tests` | Playwright canvas journeys, axe states, regression tests |

Update this file when a phase closes or a worktree is removed.
