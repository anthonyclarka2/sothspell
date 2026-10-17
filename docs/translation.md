# Translation and Locales

A tour can be translated into another locale, narrated in that locale, and
played with a localized UI. Code, identifiers, paths, anchors, and ids never
change.

## Schema

The tour schema is now `1.1.0`:

- `locale` — the locale the tour was authored in (`en` by default).
- `translations` — an optional record keyed by target locale, each entry a
  `TourTranslation` with `locale`, `sourceLocale`, `title`, `subtitle`, and
  translated chapters, diagrams, and beats.

`1.0.0` tours still parse: `parseSothspell` migrates them by recording
`locale: 'en'`. The golden Bunbun tour stays at `1.0.0` and still compiles.

A translation carries only human-facing strings. It binds every chapter,
diagram, and beat by the source's own ids; validation rejects a translation
that changes ids, counts, order, question counts, or targets the source locale.

## Pipeline

`translateTour({ tour, targetLocale, model, glossary? })`:

1. protects identifiers, paths, code, and anchor ids with placeholders;
2. translates per beat with a translation prompt;
3. restores protected spans and validates the result;
4. caches by source text, target locale, and model version;
5. retries or repairs a failed beat without rewriting the rest of the tour.

The active authoring profile supplies the model. No separate translation
provider is required.

## API and CLI

| Method | Route                                     |
| ------ | ----------------------------------------- |
| POST   | `/api/tours/:tourId/translations`         |
| GET    | `/api/tours/:tourId/translations/:locale` |
| GET    | `/api/tours/:tourId?locale=<code>`        |

```bash
sothspell translate <tour.json> --locale <code> [--out <file>] [--model <provider/model>]
```

## Player and UI

- A locale switcher in the shell; the choice persists across pages and reloads.
- The player loads the translated tour, keeps the beat and position, and
  restarts narration in the new locale.
- UI copy is localized through typed message catalogs with a source-locale
  fallback and compile-time key checks.
- `lang` attributes are set on translated text; the layout uses logical
  properties and a `[dir='rtl']` block (code stays LTR).

## Narration

- Voice resolution is locale-aware: browser voices are filtered by locale and
  ElevenLabs uses a multilingual model.
- The narration content hash includes the locale and voice, so a locale change
  misses the cache.
- Browser speech remains the default; cloud narration stays opt-in.

## Accessibility

The axe gate covers the source locale, a second locale (`es`), and an RTL
locale (`ar`) at 0 critical/serious, including a keyboard path in RTL. A
translated narration rail, transport, chapters, and ask panel are all covered.

## Limits

- Only the tour's own locale and the bundled catalog locales are available in
  the UI; adding a catalog locale is a reviewed change.
- Live model answers follow the question's language; they are not translated.
- Code comments and code pages stay in their source language.
- A real model translation is owner-gated on provider credentials; the fixture
  model covers the pipeline.
