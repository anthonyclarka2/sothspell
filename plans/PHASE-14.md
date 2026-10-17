# Phase 14 — Multi-language Narration and Translation

**Status: complete (2026-10-17).** Depends on: Phase 9 (voice profiles), Phase 10
(harness surfaces), and the v1 narration package; shipped last, after Phases 9–13 and 15–16.

## Goal

Make a tour usable in more than one language: translate narration and labels
into another locale, narrate it with a locale-appropriate voice, and localize
the player UI — while code anchors, identifiers, and citations stay exact.

## Scope

### In

- Tour schema: a `locale` for the authored tour and optional `translations`
  keyed by locale.
- A translation pipeline in `packages/authoring`: translate narration, beat and
  chapter titles, suggested questions, diagram titles, and node/edge labels.
  Never translate paths, symbol names, code, or anchor ids.
- A translation cache keyed by source text, target locale, and model version.
- UI localization: message catalogs for the player, home, settings, import, and
  review surfaces; a locale switcher; `lang` attributes; RTL layout support.
- Narration per locale: voice selection by locale, browser voices where
  available, ElevenLabs multilingual models otherwise, cached by locale.
- A `sothspell translate <tour> --locale <code>` CLI command and an API route.
- Accessibility for translated content: translated captions, `lang` on
  narration text, axe in the second locale, RTL keyboard and focus checks.
- Bunbun: translate the golden tour into one non-English locale and play it.

### Out

- Machine translation of code comments inside the code browser (source stays
  as-is).
- Translating user questions or model answers live (answers follow the question
  language; a future pass can localize them).
- More than one translated locale per wave; add locales as the pipeline proves
  out.
- Voice cloning or custom voice training.

## Decisions

1. **The tour is the translation unit.** One source tour plus one translation
   per locale. Anchors and ids are shared; only human-facing strings differ.
2. **Source language is recorded, never assumed.** A tour declares `locale`
   (`en` by default). A translation declares `sourceLocale` and `locale`.
3. **The translation model is the active authoring profile.** No separate
   translation provider in this phase; the profile's model does the work with a
   translation prompt.
4. **Protected spans are marked, not guessed.** Identifiers, paths, and code
   excerpts are replaced with placeholders before translation and restored
   after, so the model cannot rename a symbol.
5. **Validation before acceptance.** A translation must preserve anchor ids,
   beat ids, node ids, and line ranges; a mismatch fails the translation.
6. **Narration caches include locale and voice.** The existing content hash
   gains locale; a voice change or locale change misses the cache.
7. **UI catalogs are typed.** A `messages` module with a `Locale` type and
   compile-time key checks; missing keys fall back to the source locale.
8. **RTL is a layout mode, not a theme.** Logical CSS properties, mirrored
   icons where meaningful, and a keyboard test in the RTL locale.

## Waves

### Wave 1 — Schema and catalogs

- Add `locale` and `translations` to the Sóþspell schema with a migration from
  `1.0.0` to the next version.
- Compiler and player read the active translation without changing anchors.
- UI message catalogs for the existing pages, with `en` as the source and one
  second locale (owner picks; recommend `es` for breadth or `ja` for RTL-adjacent
  coverage — RTL is a third locale, for example `ar`, in Wave 4).
- Tests: schema migration, compiler equivalence, catalog completeness.

### Wave 2 — Translation pipeline

- `translateTour({ tour, targetLocale, model, glossary? })` with protected-span
  handling, chunking by beat, retry/repair, and cache.
- Validation: ids, counts, line ranges, and anchor hashes unchanged; no empty
  strings; length bounds.
- Tests: fake model round trip, protected identifiers preserved, invalid output
  rejected, cache hit, resume after a failed beat.

### Wave 3 — Narration and player localization

- Voice resolution by locale: browser voice list filtering, ElevenLabs
  multilingual model, active narration profile.
- Player: locale switcher, translated captions, `lang` attributes, translated
  UI, sentence timings per locale.
- Tests: locale switch keeps position, narration restarts in the new locale,
  cache keys include locale, browser fallback.

### Wave 4 — RTL, CLI, and docs

- RTL layout pass with logical properties; keyboard and focus checks; axe in
  the RTL locale.
- `sothspell translate <tour.json> --locale <code> [--out <file>]` and
  `POST /api/tours/:tourId/translations`.
- `docs/translation.md`: supported locales, prompt, protected spans, validation,
  voice guidance, and RTL notes.
- Bunbun acceptance in the second locale.

## Test seams

- Schema migration and compiler equivalence.
- `translateTour` with a fake model and a fixture tour.
- Narration content hash with locale.
- Web locale switcher and catalogs with a mocked API.
- Accessibility suite in the source, second, and RTL locales.

## Bunbun acceptance

1. Take the golden Bunbun tour.
2. Translate it to the second locale with the fixture model (and a real model
   when credentials exist).
3. Verify every anchor id, path, and line range is unchanged.
4. Play the translated tour with browser narration in that locale.
5. Confirm Bunbun is unchanged.

## Exit criteria

- A tour can be translated, validated, and played in a second locale.
- Code, identifiers, and citations are never translated.
- Narration uses a locale-appropriate voice and caches per locale.
- The UI is localized for the new locale with a keyboard-only path.
- RTL layout passes axe at 0 critical/serious.
- `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, browser tests, and
  axe pass.
- Bunbun remains read-only.

## Risks

- **Translation fidelity.** The model may translate identifiers or drop
  citations. Protected spans and strict validation are the mitigation.
- **Cost.** Translating a tour is another model pass. Cache aggressively and
  translate per beat.
- **Voice availability.** Some locales have weak browser voices and limited
  ElevenLabs coverage. Show the fallback clearly and keep text primary.
- **RTL regressions.** Layout, icons, and diagrams need a deliberate pass;
  diagrams keep their own coordinate system.
- **Schema churn.** A new schema version needs a migration and player support
  for both versions during the transition.

## Working style

- Use `tdd` for migration, protected spans, and validation.
- Keep translation prompts and protected-span rules in `packages/authoring`;
  the player never translates.
- Verify in a real browser for each locale, including RTL.
- Update `CONTEXT.md` with locale and translation terms when they land.

## Shipped (closure, 2026-10-17)

- **Schema 1.1.0** — tour `locale` plus per-locale `translations` with a
  migration from `1.0.0`; `parseSothspell` migrates before validating, so v1
  tours and the golden tour still compile. Regenerated JSON Schema.
- **Translation pipeline** — `translateTour` with protected spans
  (identifiers, paths, code, anchor ids), per-beat translation, retry/repair,
  cache keyed by source text + locale + model, and strict validation that ids,
  counts, order, question counts, and anchors are unchanged.
- **Narration** — locale-aware voice resolution (`./voices` subpath keeps Node
  built-ins out of the browser bundle) and a locale-aware content hash.
- **API and CLI** — translation routes, `?locale` on the tour route, and
  `sothspell translate`.
- **Player and UI** — typed message catalogs, a persistent locale switcher,
  translated captions and shells, `lang` attributes, logical CSS properties, and
  an RTL block (code stays LTR). A responsive topbar fix keeps the shell inside
  375px.
- **Integration on main** — the embed's translation overlay was aligned with the
  core `TourTranslation` schema.
- **Docs** — `docs/translation.md`.

### Closure verification (fresh output, 2026-10-17)

- Track: focused `vitest run packages/core packages/authoring packages/narration
apps/api apps/cli` 29 files / 219 tests; full `pnpm test` 61 files / 459 tests;
  `CI=1 pnpm test:browser` 29 passed including `es`/`ar` axe and RTL keyboard.
- Bunbun acceptance with the fixture model (`es`): 20 anchors byte-identical
  (id, path, lines, hash), 34 ids identical, compiles with `locale=es` and
  `availableLocales=[en,es]`; the Bunbun checkout is untouched.
- After the final merge: `pnpm typecheck` and `pnpm lint` clean, `pnpm test`
  98 files / 810 tests, `pnpm build` clean, `CI=1 pnpm test:browser` 57 passed,
  and `pnpm test:browser:embed` 20 passed.
- Bunbun remains read-only.

### Follow-ups

- A real model translation is owner-gated on provider credentials; the fixture
  model covers the pipeline.
- Live model answers are not translated; code comments and code pages stay in
  their source language.
- Adding more UI catalog locales is a reviewed change.
