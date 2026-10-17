# @sothspell/embed

The embeddable tour player: a self-contained ES module plus a custom element
(`<sothspell-tour>`), an iframe fallback, and the export pipeline behind
`sothspell export --embed`.

The embed plays a compiled tour with **no Sóþspell server, no API client, no
SQLite, no Node built-ins, no provider code, and no network calls**. It reuses
`@sothspell/player` for playback state and `@sothspell/narration` for browser
speech; code highlighting and diagram positions are computed at export time, so
neither Shiki nor a diagram engine ships in the bundle.

## Build

```bash
pnpm build:embed          # vite library build -> packages/embed/dist
```

`dist/player.js` (ES module) and `dist/player.css` (host-page defaults only)
are the shipped files. The build fails on a forbidden module or an over-budget
artifact:

| File         | Budget  | Current                   |
| ------------ | ------- | ------------------------- |
| `player.js`  | 420 KiB | 372.4 KiB (90.1 KiB gzip) |
| `player.css` | 20 KiB  | 0.5 KiB (0.3 KiB gzip)    |

The shadow-DOM stylesheet is inlined into `player.js`; `player.css` only
reserves layout for an un-upgraded element and sizes the iframe page.

## Layout

- `src/controller.ts` — playback, progress, locale, clock; the deep module
  behind both hosts.
- `src/element.ts` — `<sothspell-tour>`: shadow root, React view, DOM events.
- `src/iframe.ts` — host-side `createIframeEmbed` and the iframe-page bridge.
- `src/protocol.ts` — the `sothspell-embed/1` `postMessage` channel and guards.
- `src/progress.ts` — `localStorage` progress with an opt-out.
- `src/export/` — the pure export pipeline (tour + writer -> bundle + manifest).
- `e2e/` — Playwright specs against `examples/embed-docs`.

## Tests

```bash
pnpm exec vitest run packages/embed   # unit: controller, protocol, export
pnpm test:browser:embed               # browser: element, iframe, axe
```
