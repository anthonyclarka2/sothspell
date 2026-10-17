# Embed docs fixture

A static docs page that embeds the golden Bunbun tour with both integration
styles. It exists to prove, in a real browser, that an exported bundle plays
without the Sóþspell server.

## Running

```bash
pnpm build:embed
pnpm sothspell export examples/bunbun-tour/tour.json --embed \
  --out examples/embed-docs/dist/sothspell
node examples/embed-docs/serve.mjs
# open http://127.0.0.1:4320/
```

`pnpm test:browser:embed` does all three steps and runs the Playwright specs
against the result. `examples/embed-docs/dist/` is generated output (already
covered by the repository's `dist/` ignore rule) and is not committed.

## Files

- `index.html` — the docs page: custom element plus iframe fallback.
- `opt-out.html` — the same tour with `progress="off"`.
- `docs.css` — opinionated host CSS that the shadow root ignores.
- `docs.js` — creates the iframe through `createIframeEmbed`.
- `serve.mjs` — a dependency-free static server on port 4320.
