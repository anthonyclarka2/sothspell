# Phase 1 — Foundation & Sóþspell Format

**Status: complete (2026-10-17).** Depends on: nothing. The owner confirmed the
test seams in [`ROADMAP.md`](ROADMAP.md#18-testing-strategy-and-seams) on
2026-10-17.

**Deliverable:** a pnpm workspace on TypeScript 7, the versioned Sóþspell
document schema, a deterministic compiler, a hand-authored golden Bunbun tour,
and a minimal player that proves code highlighting, diagram focus, auto-advance,
and deep links. No LLM calls in this phase.

## Goal

Prove the artifact and the player before investing in repository analysis or
model authoring. If the format cannot express a good Bunbun walkthrough, the
later phases should not be built on it.

The phase is also the toolchain gate. TypeScript 7.0 has no programmatic compiler
API, so the stack must avoid packages that need the classic TypeScript compiler
API. This is the phase where that constraint is tested in practice, not assumed.

## Why this order

- The format is the contract between the analyzer, the authoring pipeline, the
  player, and the OpenCode plugin. Changing it after Phase 3 is expensive.
- A hand-authored tour gives the authoring pipeline a target and gives the
  player a realistic fixture.
- A minimal player exposes timing, code, and diagram problems early, before the
  full cinematic UI is built.
- The Bunbun read-only guarantee is easier to enforce from the first command.

## Scope

### In scope

- pnpm workspace, TypeScript 7, Vite 8, React 19, Hono 4, Vitest 5, Playwright.
- `apps/web`, `apps/api`, `packages/core`, `packages/player`,
  `packages/diagram`, and placeholder packages for analyzer, authoring,
  narration, and harness.
- Zod 4 schemas for the Sóþspell document, exported JSON Schema, and a schema
  version policy.
- A deterministic compiler that validates a document against a source snapshot,
  resolves anchors, estimates durations, and produces render-ready data.
- A read-only source access layer sufficient for the golden tour (path
  containment, file read, line slicing, hash verification). The full analyzer is
  Phase 2.
- Shiki 4 server-side highlighting with line decorations.
- React Flow + ELK diagram rendering for architecture/dependency diagrams.
- A minimal player: stage, narration rail, play/pause, previous/next, progress
  bar, auto-advance, code link.
- The checked-in golden Bunbun tour.
- The Bunbun read-only guard.

### Out of scope

- LLM generation.
- Full symbol extraction (Phase 2).
- Narration audio (Phase 5).
- Q&A (Phase 6).
- OpenCode plugin (Phase 7).
- Accounts, hosted deployment, multi-user sync.

## Decisions

1. **The tour document is JSON, not MDX or HTML.** Everything the player renders
   is derived from typed data. Markdown is a restricted narration subset.
2. **Chapters own diagrams; beats own focus.** A diagram persists across beats,
   which is what makes focus changes feel cinematic instead of like a new slide
   every time.
3. **Anchors are symbol-first.** A line range alone is a hint. The compiler
   resolves `path + symbol` first, then verifies a content hash.
4. **The golden tour is checked in.** It is the regression fixture, the demo,
   and the authoring target. It is pinned to Bunbun commit `9fef24d` and stores
   small attributed excerpts so it can render without the checkout.
5. **The first player is intentionally small.** It proves the essentials; Phase
   4 adds chapter navigation, scrubbing, theater mode, and the polished code
   browser.
6. **TypeScript 7 only.** No TS 6 compiler API, no `ts-morph`, no
   `vite-tsconfig-paths`, no Svelte/Vue/Angular toolchains that embed TS 6.
7. **No writes to the target repository.** The server opens files read-only;
   state lives under `SOTHSPELL_HOME`.

## Waves

### Wave 0 — Workspace and toolchain

1. Create the pnpm workspace:
   - root `package.json` with `packageManager: "pnpm@12.14.0"` and
     `engines.node: ">=26"`;
   - `pnpm-workspace.yaml` with `apps/*` and `packages/*`;
   - a workspace catalog for pinned dependency versions;
   - `tsconfig.base.json` with TS 7-safe settings;
   - per-package `tsconfig.json` files and project references;
   - `oxlint` + Prettier configuration;
   - `vitest.workspace.ts` or per-package configs.
2. Create the app/package skeletons with public `exports` maps:
   `apps/web`, `apps/api`, `packages/core`, `packages/player`,
   `packages/diagram`, `packages/analyzer` (stub), `packages/authoring` (stub),
   `packages/narration` (stub), `packages/harness` (stub).
3. Add scripts:
   ```json
   {
     "dev": "pnpm --parallel --filter @sothspell/api --filter @sothspell/web dev",
     "build": "pnpm -r build",
     "typecheck": "tsc -b --pretty false",
     "lint": "oxlint",
     "format": "prettier --write .",
     "test": "vitest run",
     "test:browser": "playwright test",
     "test:a11y": "playwright test --project=a11y",
     "sothspell": "pnpm --filter @sothspell/cli exec sothspell"
   }
   ```
4. Add the toolchain guard:
   - `scripts/check-toolchain.mjs` runs `tsc --version` and requires `7.`;
   - it greps application dependencies for `ts-morph`, `vite-tsconfig-paths`,
     and other known classic-compiler-API packages;
   - it fails with a clear message.
5. Verify:
   - `pnpm install` creates a lockfile;
   - `pnpm typecheck` exits 0 on the empty workspace;
   - `pnpm build` builds the web shell;
   - `pnpm dev` serves the shell.

### Wave 1 — Document schema and compiler

1. Define Zod schemas in `packages/core/src/schema/`:
   - `SothspellDocument`, `ProjectRef`, `Revision`, `Chapter`, `Beat`,
     `CodeAnchor`, `Stage`, `DiagramInstruction`, `DiagramNode`, `DiagramEdge`,
     `Narration`, `SuggestedQuestion`.
   - `AnchorRef` and `DiagramId` branded strings.
   - Semantic refinements: unique IDs, valid references, beat durations,
     diagram limits (for example, max 16 nodes and 24 edges in the first
     version), and required stage content.
2. Export JSON Schema for model prompts:
   - `pnpm --filter @sothspell/core schema:json`;
   - commit the generated schema under `packages/core/schema/`.
3. Implement `compileSothspell(document, snapshot)`:
   - parse and validate;
   - resolve anchors (path, symbol, line hint, content hash);
   - attach resolved line ranges and excerpt text;
   - estimate durations from narration word count when `durationMs` is absent;
   - validate diagram references and build a normalized `CompiledDiagram`;
   - return a `CompiledTour` with no model or DOM dependency.
4. Implement a read-only source adapter for Phase 1:
   - `resolveProjectPath(root, relativePath)`;
   - reject absolute paths, `..`, and symlink escapes;
   - read files as UTF-8 with a size cap;
   - hash file content with SHA-256;
   - slice lines for an anchor.
5. Tests:
   - valid document compiles;
   - duplicate IDs fail;
   - unknown anchor fails;
   - hash mismatch marks the anchor stale;
   - unknown diagram node fails;
   - duration estimate is stable;
   - path traversal and symlink escape fail.
6. Add a JSON Schema compatibility test: generated schema and Zod schema agree
   on required fields.

### Wave 2 — Golden Bunbun tour

1. Create `examples/bunbun-tour/`:
   - `tour.json` — the hand-authored 19-beat tour from the roadmap outline;
   - `README.md` — provenance, Bunbun commit `9fef24d`, how to regenerate;
   - `excerpts/` — small attributed excerpts for each anchor, or embedded
     `excerpt` fields in the anchors.
2. Keep excerpts short: the smallest range that supports the narration, usually
   3–25 lines. Do not copy entire files.
3. Include one architecture diagram for Chapter 1, one flow diagram for Chapter
   2, one write-path diagram for Chapter 3, and one worker/queue diagram for
   Chapter 4.
4. Add a provenance test:
   - every anchor path exists in the pinned Bunbun checkout when it is present;
   - every embedded excerpt's hash matches its declared hash;
   - the tour's project revision is `9fef24d`.
5. Add the read-only guard:
   - record `git -C /Users/ajc/Projects/codegens/bunbun status --porcelain`
     before and after the test;
   - assert both are empty;
   - if the checkout is absent, skip with a clear message rather than fail.

### Wave 3 — Minimal player

1. Build the player shell in `apps/web`:
   - route `/t/:tourId/:beatId?`;
   - a stage with a diagram panel and a code panel;
   - a narration rail with the beat title, body, and suggested questions;
   - controls: play/pause, previous, next, progress;
   - a chapter label and a beat counter.
2. Implement `packages/player` as a framework-free playback engine:
   - `createPlayback(compiled, options)`;
   - states: `idle`, `playing`, `paused`, `completed`, `error`;
   - events: `beat.started`, `beat.progress`, `beat.completed`,
     `tour.completed`, `error`;
   - a `Clock` interface so tests can advance time deterministically;
   - auto-advance in read mode using the compiled duration.
3. Render code with Shiki 4:
   - server-side `codeToHtml` with a dual theme;
   - a transformer that adds `data-line` and highlight classes;
   - focus range from the resolved anchor;
   - line numbers, a copy-link button, and a “from this beat” marker.
4. Render diagrams with React Flow + ELK:
   - `packages/diagram` validates and lays out the instruction;
   - nodes and edges use theme tokens;
   - focused nodes/edges are highlighted, others dimmed;
   - clicking a node with an anchor opens the code page.
5. Add a simple code page:
   - `/p/:projectId/source/*` with a `?anchor=` focus;
   - reads from the snapshot or embedded excerpt;
   - shows the beat link back to `/t/:tourId/:beatId`.
6. Add a “Resume / Start over” prompt when a run exists in IndexedDB. Phase 4
   expands this; Phase 1 only needs the persistence boundary and a basic run.
7. Tests:
   - playback transitions with a fake clock;
   - pause freezes progress; resume continues from the same beat;
   - auto-advance reaches completion;
   - code link renders the focused lines;
   - diagram node click returns the expected anchor;
   - Playwright smoke: open the golden tour, play, pause, next, open code,
     return.

### Wave 4 — API and dev loop

1. Hono API in `apps/api`:
   - `GET /api/health`;
   - `GET /api/tours/:tourId` returns the compiled tour;
   - `GET /api/projects/:projectId/source/*` returns file text and highlight
     metadata for the code page;
   - static web serving in production;
   - dev proxy or Vite middleware for the web app.
2. Use `@hono/zod-validator` for route params and query strings.
3. Add a temporary in-memory tour registry that loads
   `examples/bunbun-tour/tour.json`; Phase 2 replaces it with the snapshot store.
4. Add `pnpm dev` documentation and a `docs/development.md` quick start.
5. Verify the production build serves the same routes as dev.

### Wave 5 — Verification and closure

- `pnpm typecheck` exits 0.
- `pnpm lint` exits 0.
- `pnpm test` is green.
- `pnpm build` succeeds.
- `pnpm dev` serves the golden tour; the player plays, pauses, advances, opens
  code, and returns.
- Playwright smoke passes.
- Every anchor in the golden tour resolves.
- Bunbun remains unchanged (`git status --porcelain` empty).
- The toolchain guard reports TypeScript 7 and no classic compiler API packages.

## Test seams

Confirm these before the first test is written:

1. `compileSothspell(document, snapshot) → CompiledTour` (core).
2. `resolveProjectPath(root, path)` and `readSourceFile(...)` (source access).
3. `createPlayback(compiled, options) → Playback` (player).
4. `layoutDiagram(instruction) → PositionedDiagram` (diagram).
5. `GET /api/tours/:tourId` and `GET /api/projects/:projectId/source/*` (API).
6. The Playwright user journey: open → play → pause → next → open code → return.

What the seams cover and miss:

- Compiler: catches invalid data and broken anchors; misses pedagogical quality.
- Source access: catches path escapes and hashes; misses semantic correctness.
- Player: catches timing/state behavior; misses visual polish.
- Diagram layout: catches invalid graphs and unstable layout; misses readability.
- API: catches route and serialization behavior; misses full UI integration.
- Playwright: catches the real user path; slower and browser-dependent.

## Exit criteria (measurable)

1. The workspace builds and typechecks on TypeScript 7.0.2 with pnpm 12.14.0.
2. The core schema is versioned and has a generated JSON Schema.
3. The compiler resolves every anchor in the golden tour; 0 unresolved anchors.
4. The golden tour has 19 beats across 6 chapters and renders end to end.
5. Every beat has at least one code anchor; every chapter has at least one
   diagram.
6. The player can play, pause, advance, and open a code page from a beat and a
   diagram node.
7. A run persists to IndexedDB and resumes at the same beat.
8. `git -C /Users/ajc/Projects/codegens/bunbun status --porcelain` is empty after
   analysis, compilation, and playback.
9. The toolchain guard fails if TypeScript drops below 7 or a classic compiler
   API package is added.
10. `pnpm test` and the Playwright smoke are green; `pnpm build` succeeds.
11. Initial web bundle is within budget (target: under 500 kB gzipped for the
    player route, code-split where practical). Record the actual number.

## Risks and mitigations

- **Schema overfitting to Bunbun.** Include one synthetic fixture with a
  different shape (a CLI and a small library) and compile both.
- **Shiki bundle size.** Highlight on the server and ship HTML, not grammars.
- **React Flow + ELK complexity.** Keep Phase 1 to architecture/dependency
  diagrams; sequence diagrams are Phase 4.
- **TS 7 tooling gaps.** The toolchain guard and `oxc-parser` decision are
  load-bearing. If a required tool demands the TS 6 API, find a replacement
  rather than adding a second compiler.
- **Checked-in excerpts drift.** Pin hashes and the Bunbun commit; a stale
  checkout is a visible test skip, not a silent pass.
- **Golden tour quality.** The hand-authored tour is a target, not a claim that
  the model can already produce it. Phase 3 measures the gap.

## Working style

- Sequential. Wave 0 must land before any package work.
- Use `tdd` for every public seam; use `codebase-design` for module boundaries.
- Read a file before editing it; keep changes scoped.
- Commit each wave with a descriptive message.
- Update `CONTEXT.md` if a new domain term appears; update this phase plan when a
  decision changes.

## Shipped (closure, 2026-10-17)

- **Workspace and toolchain** — pnpm 12.14.0 workspace on Node 26 and TypeScript
  7.0.2; React 19.3.1, Vite 8.3.4, Hono 4.13.13, Zod 4.6.7, Shiki 4.5.0,
  React Flow 12.12.0, ELK 0.12.0, Vitest 5.0.5, Playwright 1.64.1, axe 4.14.0.
  `scripts/check-toolchain.mjs` fails if TypeScript drops below 7 or a classic
  compiler-API package (`ts-morph`, `typescript-estree`,
  `vite-tsconfig-paths`) appears.
- **Schema and compiler** — `packages/core` has the versioned Zod schema,
  semantic validation (unique IDs, stage references, diagram references),
  a generated draft-2020-12 JSON Schema at
  `packages/core/schema/sothspell.schema.json`, read-only source access with
  traversal and symlink containment, anchor hashing, Shiki highlighting with
  high-contrast dual themes, and deterministic ELK diagram layout.
- **Golden Bunbun tour** — `examples/bunbun-tour/tour.json` has 6 chapters,
  19 beats, 20 anchors, and 8 diagrams, pinned to Bunbun `9fef24d`.
  `tour.source.json` is the editable source; `pnpm tour:build` regenerates the
  artifact read-only and refuses a different Bunbun revision. The 19th beat
  (AppModule as the wiring seam) was added during implementation; the roadmap
  outline was updated to match.
- **API and player** — Hono serves the compiled tour and code anchors; the React
  player has chapter navigation, auto-advance, pause/resume, previous/next,
  progress, code excerpts, diagram focus and node-to-code links, deep links,
  and IndexedDB resume. Shiki markup is server-compiled; the browser renders
  HTML, not grammars. A code page shows the anchored excerpt, hash prefix, and a
  return link to the beat.
- **Accessibility** — axe-core runs on the home, player, and code pages with a
  0 critical / 0 serious threshold; the high-contrast Shiki themes, underlined
  in-text links, and focusable controls were the fixes the gate required.
- **Deviation from the plan** — the `sothspell` CLI and the live snapshot reader
  are deferred to Phase 2; Phase 1 serves the embedded golden excerpts through
  the API, which keeps the read-only promise and removes a filesystem surface
  from the player. The player serves production assets through Vite in
  development and the API's static fallback in a production build.

### Closure verification (fresh output, 2026-10-17)

- `pnpm typecheck` → 0 errors.
- `pnpm lint` → 0 errors, 0 warnings.
- `pnpm test` → 7 files / 26 tests passed.
- `pnpm build` → web build succeeded; the main bundle is 504.92 kB minified /
  161.25 kB gzip (budget: under 500 kB gzip).
- `pnpm test:browser` → 6 passed.
- `pnpm test:a11y` → 3 passed; 0 critical / 0 serious violations.
- `pnpm check:toolchain` → TypeScript 7.0.2, no classic compiler API packages.
- `pnpm tour:build` → idempotent; 6 chapters, 19 beats, 20 anchors.
- `pnpm schema:json` → idempotent; 11,431-byte schema.
- `git -C /Users/ajc/Projects/codegens/bunbun status --porcelain` → empty.
- Manual `pnpm dev` pass: home page, player, play/pause, next, code link,
  diagram node link, and reload-resume all verified in Chrome at 1440×1100.
