# Release Notes

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
