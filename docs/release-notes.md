# Release Notes

## 0.2.0 — 2026-10-17 (next stage)

The second stage adds configuration, reach, collaboration, languages, review,
and distribution.

### Included

- **Preferences UI** — connection profiles for authoring and narration with a
  write-only secret store, provider testing, env fallback, and profile-aware
  pipelines.
- **Web authoring flow** — `/new` opens a local git repository or a public
  GitHub URL, inspects it read-only, and authors a tour with the fixture or
  active profile model through a progress job.
- **Example repository** — `examples/tiny-notes/`, a small layered TypeScript
  project, plus `pnpm example:tiny-notes` to materialize it as a standalone git
  repository for the local demo.
- **Harness plugins** — the `HarnessAdapter` contract and shared runtime, the
  OpenCode plugin refactor, and Claude Code and Codex adapters with fake-host
  conformance tests.
- **GitHub import** — public URL parsing, a shallow read-only clone sandbox with
  limits and cleanup, an import API/UI, and `sothspell import`.
- **Accounts and sync** — GitHub OAuth with PKCE, server-side sessions, device
  flow, cross-device run sync with documented merge rules, claim, export, and
  delete.
- **Language analyzers** — a `LanguageAnalyzer` port and Python, Go, Rust, and
  Java adapters over WASM tree-sitter grammars, manifest readers, language
  briefs, and Shiki highlighting for the new languages.
- **Translation and locales** — schema 1.1.0 with migrations, a protected-span
  translation pipeline, locale-aware narration and voices, a localized UI with
  an RTL pass, and `sothspell translate`.
- **Human review UI** — a review state machine, per-beat comments, beat edits,
  regeneration with diff/revert, anchor gating, decisions, export, and the
  `sothspell review` CLI.
- **Embeddable player** — `packages/embed`, a custom element and iframe host
  API, local progress with opt-out, `sothspell export --embed`, and a docs
  fixture.
- **Docs** — settings, harnesses, import, accounts, analysis language matrix,
  embed, review, and translation guides.

### Verification

- `pnpm test` → 98 files / 810 tests.
- `CI=1 pnpm test:browser` → 57 passed (all surfaces and axe states).
- `pnpm test:browser:embed` → 20 passed.
- `pnpm build`, `pnpm typecheck`, `pnpm lint`, `pnpm check:toolchain`, and
  `pnpm sothspell doctor` clean; Bunbun remains read-only.

### Known limitations

- Real provider round trips (authoring, translation, ElevenLabs), real Claude
  Code/Codex/OpenCode sessions, and real GitHub OAuth need credentials or host
  installs; fakes and fixture paths cover the logic.
- Reviews are local-reviewer scoped until an account signs in.
- The embed shows the tour's own locale unless the host supplies an overlay.
- The v1 limitations still apply: single-user local-first default, no accounts
  requirement, and no hosted mode.

## 0.1.0 — 2026-10-17

First local-first Sóþspell release.

### Included

- Read-only repository analyzer with deterministic snapshots, `oxc-parser`
  symbol extraction, import/reference graphs, Prisma models, project brief, and
  per-file cache.
- LLM authoring pipeline with OpenAI/Anthropic AI SDK adapters, a deterministic
  fixture model, bounded context packs, curriculum/chapter generation,
  validation, repair, caching, and quality reports.
- Versioned Sóþspell format, compiler, Shiki highlighting, ELK diagrams, and
  generated JSON Schema.
- Golden Bunbun tour pinned to `9fef24d`: 6 chapters, 19 beats, 20 anchors.
- Cinematic player: auto-advance, pause/resume, scrubber, speed, theater mode,
  completed beats, keyboard map, virtualized full-file code browser, stale
  badges, diagram/sequence views, and IndexedDB + SQLite progress.
- Narration: browser speech and opt-in ElevenLabs cloud narration with aligned
  timings, content-addressed audio, range serving, and fallback.
- In-tour questions with cited answers and a drilldown generator.
- OpenCode V2 plugin track (see the phase closure record for its exact status).
- CLI: `analyze`, `author`, `serve`, and `doctor`.
- Accessibility gate: 0 critical/serious on home, player, code browser, and
  listen/ask states.

### Known limitations

- Real-model and live ElevenLabs acceptance runs are owner-gated on provider
  credentials; fixture/browser paths are verified.
- The drilldown generator is not yet wired to a player launch route.
- Answers are session-local; per-run answer persistence and cost governors are
  follow-ups.
- The first release is single-user, local-first, and loopback-only by default.
- Run export/import and accounts are future work.
