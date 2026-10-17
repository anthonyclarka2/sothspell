# Phase 16 — Embeddable Player

**Status: in progress (2026-10-17).** Depends on: the v1 player and tour format, Phase 15
(approved tours). Can run in parallel with later phases.

## Goal

Let a documentation site embed a tour. An export command produces a
self-contained bundle plus tour data; the bundle plays in a docs page with no
Sóþspell server, no provider keys, and no repository access.

## Scope

### In

- A `packages/embed` package: a standalone player build with a small host API.
- `sothspell export --embed --out <dir>` producing:
  - `player.js` (or an ES module) and `player.css`;
  - `tour.json` with compiled anchors and embedded excerpts;
  - `assets/` for diagram fonts/icons already in the player;
  - `README.md` with the exact embed snippet and what ships.
- A custom element (`<sothspell-tour>`) and an iframe fallback.
- Host API: `load(tourUrl)`, `play`, `pause`, `seek`, `next`, `previous`,
  `locale`, and `progress` events; `postMessage` for the iframe.
- Local progress in the embed (IndexedDB/localStorage) with an opt-out.
- A docs fixture that embeds the golden Bunbun tour and is covered by
  Playwright and axe.
- `docs/embed.md`: export, hosting, CSP, sizing, events, and privacy.
- Export guardrails: only excerpts and narration ship; the full repository never
  does.

### Out

- A hosted CDN or package registry publishing step.
- Narration audio generation during export (the embed uses browser speech by
  default; pre-rendered audio is an option documented but not required).
- Server-side embedding, SSR, or React Server Components.
- A CMS plugin for a specific docs platform (Docusaurus, MkDocs, VitePress
  snippets are examples in the docs, not maintained plugins).

## Decisions

1. **One bundle, no server.** The embed build must not import the API client,
   SQLite, or provider code. The build is a separate Vite entry with a size
   budget.
2. **The tour is data, not code.** `tour.json` is compiled and validated;
   excerpts are embedded because the source may not be available.
3. **Custom element first, iframe fallback.** The custom element gives the best
   integration; the iframe is the compatibility path and the isolation option.
4. **Progress is local by default.** The embed stores progress in the host
   origin's storage; an opt-out disables it. No account sync in the embed.
5. **Narration is browser speech by default.** Cloud narration in an embed
   would expose provider calls and keys; document it as out of scope.
6. **The export lists what ships.** The README and an `export-manifest.json`
   list every file, the tour revision, and the excerpt hashes so a reviewer can
   audit the bundle.
7. **Stale anchors degrade visibly.** If a host supplies a live source root, the
   embed can re-verify; otherwise the export's revision is shown in the player
   footer.

## Waves

### Wave 1 — Embed player package

- `packages/embed` with a Vite library build, a custom element wrapper, and the
  host API.
- Reuse `packages/player` and the existing components; no duplicated playback
  logic.
- Tests: element registration, API methods, event payloads, progress opt-out,
  teardown (no leaked listeners or timers).
- Bundle size budget recorded.

### Wave 2 — Export pipeline

- `sothspell export --embed --out <dir>`: compile the tour, embed excerpts,
  copy the player assets, write the manifest and README.
- Export validation: tour schema, anchor hashes, no secrets, no absolute paths,
  no full-file payloads beyond excerpts.
- Tests: export a fixture tour, verify the manifest, reject a tour with a
  missing anchor, reject an oversized excerpt set.

### Wave 3 — Docs fixture and host integration

- `examples/embed-docs/`: a static docs page with the golden Bunbun tour
  embedded via the custom element and the iframe.
- Playwright: the embed plays, pauses, seeks, emits progress, and passes axe at
  0 critical/serious at desktop and mobile widths.
- CSP example: no inline scripts, no external origins beyond the docs host.

### Wave 4 — Docs, privacy, and hardening

- `docs/embed.md` and an updated `docs/release-notes.md`.
- Privacy: what the embed stores and sends (nothing by default), and how to
  disable progress.
- Performance: measure LCP/CLS of the docs fixture and record the numbers.
- A stable embed API version and a compatibility note for tour schema versions.

## Test seams

- `packages/embed` public API with a fake host document.
- Export pipeline as a pure function over a tour and a fake asset writer.
- Docs fixture end to end in Playwright.
- Player regression suite unchanged.

## Bunbun acceptance

1. Export the golden Bunbun tour as an embed bundle.
2. Serve the docs fixture statically (no Sóþspell server).
3. Play, pause, seek, and change locale if a translation exists.
4. Confirm the bundle contains only excerpts and narration, not the full
   repository.
5. Confirm Bunbun is unchanged.

## Exit criteria

- `sothspell export --embed` produces a self-contained bundle with a manifest.
- The embed plays without the Sóþspell server and without provider keys.
- The custom element and iframe both work in the docs fixture.
- Progress is local by default and can be disabled.
- The embed passes axe at 0 critical/serious and meets the bundle budget.
- `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, browser tests, and
  axe pass.
- Bunbun remains read-only.

## Risks

- **Bundle bloat.** React, Shiki, and diagram code add weight. Use a separate
  entry, lazy-load diagram engines, and enforce a budget.
- **Tour size.** Excerpts can be large. Cap total excerpt bytes per export and
  summarize oversized anchors.
- **Host CSS collisions.** The custom element must use shadow DOM or scoped
  styles; the iframe is the fallback.
- **Version skew.** An old embed bundle with a new tour schema must fail
  visibly, not silently. Check the schema version at load.
- **Privacy expectations.** A docs site may not want storage. Default to local
  progress but document and support the opt-out prominently.

## Working style

- Use `tdd` for the host API and export validation.
- Use the `design-taste-frontend` guardrails for the embed chrome; keep it
  minimal and documentation-friendly.
- Keep the embed free of Node-only imports; verify with a browser build.
- Record the manifest and size budget in `docs/embed.md` and the phase closure.
