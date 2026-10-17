# Embeddable Player

A tour can live inside a documentation site. `sothspell export --embed` writes a
self-contained bundle plus tour data; the bundle plays with no Sóþspell server,
no provider keys, and no repository access.

## Export

```bash
pnpm build:embed            # builds packages/embed/dist
pnpm sothspell export examples/bunbun-tour/tour.json \
  --embed --out examples/embed-docs/dist
```

The export compiles the tour, embeds anchor excerpts, copies the player assets,
and writes:

- `player.js` and `player.css`;
- `tour.json` (compiled, with embedded excerpts);
- `export-manifest.json` listing every shipped file, the tour revision, and
  excerpt hashes;
- `README.md` with the embed snippet and what ships.

Validation rejects a missing anchor, a secret-looking value, absolute paths,
and an oversized excerpt set (64 KiB per anchor, 512 KiB total).

## Bundle

- `player.js` — 372.4 KiB minified, **90.1 KiB gzip**; budget 420 KiB.
- `player.css` — host defaults only; shadow styles are inlined in JS.
- The bundle excludes Shiki, ELK, React Flow, the API client, SQLite, and any
  Node built-in.

## Host API

### Custom element

```html
<script type="module" src="/sothspell/player.js"></script>
<sothspell-tour src="/sothspell/tour.json"></sothspell-tour>
```

The element renders in a shadow root and exposes:

| Method                 | Purpose                                    |
| ---------------------- | ------------------------------------------ |
| `load(tourUrl)`        | Load a compiled tour                       |
| `play()`, `pause()`    | Playback                                   |
| `seek(fraction)`       | Seek within the tour                       |
| `next()`, `previous()` | Move beat by beat                          |
| `locale(code)`         | Switch to a translated locale when present |

Events: `sothspell:ready`, `sothspell:progress`, `sothspell:beat`,
`sothspell:ended`.

### Iframe

`<iframe src=".../embed.html?tour=...">` with a `postMessage` protocol for the
same verbs and events; use it when host CSS isolation or a strict CSP matters.

## Progress

Progress is stored locally in the host origin (IndexedDB with a localStorage
fallback) and restored on reload. Add the `progress="off"` attribute (or the
`opt-out.html` pattern) to store nothing.

## Privacy and CSP

- No network requests beyond the static bundle and `tour.json`.
- No cloud narration, accounts, or telemetry.
- No inline scripts; the docs fixture works with a strict CSP that allows only
  the bundle origin.
- The bundle contains excerpts and narration, never the full repository.

## Locales

A tour with a `translations` overlay can switch locale in the embed. The
overlay is reconciled with the Phase 14 schema; until then, only a tour's own
locale is shown.

## Docs fixture

`examples/embed-docs/` embeds the golden Bunbun tour with both the custom
element and the iframe, includes a hostile host stylesheet, and is covered by
`pnpm test:browser:embed` (20 tests: play, pause, seek, progress, teardown, no
network, opt-out, iframe relay, and axe at 0 critical/serious on desktop and
mobile).
