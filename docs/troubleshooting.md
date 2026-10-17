# Troubleshooting

## `pnpm sothspell doctor` fails

- **Node/TypeScript**: use Node 26+ and the pinned pnpm; do not add a TypeScript
  6 compiler-API dependency.
- **SOTHSPELL_HOME**: ensure the directory is writable.
- **SQLite**: `better-sqlite3` must match the Node ABI. Reinstall dependencies
  with `pnpm install --frozen-lockfile`.
- **Port**: another process owns 4319; stop it or pass `--port`.

## The golden tour does not load

Run:

```bash
pnpm --filter @sothspell/api dev
curl http://127.0.0.1:4319/api/health
```

Check that `examples/bunbun-tour/tour.json` exists and compiles with
`pnpm test`.

## Code page shows a stale badge

The live file no longer matches the anchor hash. The tour is pinned to Bunbun
`9fef24d`; check out that commit or regenerate the golden tour deliberately with
`pnpm tour:build` after updating the pin.

## No cloud narration

- `ELEVENLABS_API_KEY` and `ELEVENLABS_VOICE_ID` must be set on the server.
- A missing key returns 503; the player falls back to browser speech.
- A cached clip remains playable without a key.

## Questions return 503

Set `SOTHSPELL_MODEL` (for example `openai/gpt-5.2`) and the matching provider
key. Questions are disabled rather than silently using a fake model.

## Bunbun was modified

No Sóþspell command should write into `/Users/ajc/Projects/codegens/bunbun`.
Check `git -C /Users/ajc/Projects/codegens/bunbun status --porcelain`. Artifacts
belong under `SOTHSPELL_HOME`; the golden tour is generated into this repository,
not the Bunbun checkout.

## Tests need Chrome

The browser tier uses `channel: 'chrome'`. Install Google Chrome or change the
Playwright project channel.
