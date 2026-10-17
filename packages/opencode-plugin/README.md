# `@sothspell/opencode-plugin`

OpenCode V2 adapter for Sóþspell. It analyzes the current project read-only,
authors a sóþspell with the OpenCode host model, opens the browser player, and
answers questions at the current beat.

The plugin targets `@opencode/plugin` 2.0.32 and the V2 API only. It writes
snapshots, tours, and runs under `SOTHSPELL_HOME` (default `~/.sothspell`), never
into the project root.

## Install

Add the package to the project configuration:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": [
    {
      "package": "@sothspell/opencode-plugin",
      "options": {},
    },
  ],
}
```

The peer dependency `@opencode/plugin` must be available from the host. There is
no second model key: generation uses `ctx.generate.text` and falls back to
`ctx.session.generate` when the host build requires a session.

## Options

| Option       | Default                 | Meaning                                                |
| ------------ | ----------------------- | ------------------------------------------------------ |
| `playerUrl`  | `http://127.0.0.1:5173` | Browser player and local API base URL.                 |
| `autoOpen`   | `true`                  | Open the browser after `/sothspell` prepares a tour.   |
| `model`      | host default            | Optional `provider/model` or `provider/model#variant`. |
| `maxMinutes` | `12`                    | Target runtime passed to the authoring pipeline.       |
| `serverPort` | `4319`                  | Reserved for the packaged local server (Phase 8).      |

Invalid options fail plugin setup with a message naming the field.

## Commands

- `/sothspell` — open the existing tour, or generate one first.
- `/sothspell status` — show the tour, run progress, and player URL.
- `/sothspell generate` — regenerate the tour even when one exists.
- `/sothspell ask <question>` — ask the guide at the current beat and print
  citations.

## Tools

- `sothspell_status`
- `sothspell_open`
- `sothspell_generate`
- `sothspell_ask`

Tool descriptions tell the agent that generation is a local, read-only analysis
and should be offered when the user asks for a walkthrough, not on every prompt.

## RPC

`@sothspell/opencode-plugin/rpc` exports `SothspellRpc`, an `Rpc.define` contract
with `status`, `open`, `generate`, `progress`, `ask`, and `cancel`, plus the
events `generation.progress` and `run.updated`. External clients can call it
through an OpenCode client:

```ts
import { OpenCode } from '@opencode/client';
import { SothspellRpc } from '@sothspell/opencode-plugin/rpc';

const client = OpenCode.make({ baseUrl: 'http://127.0.0.1:4096' });
const rpc = client.rpc(SothspellRpc);
console.log(await rpc.status({}));
```

## Known limitations

- The terminal does not render diagrams, code highlighting, or narration audio;
  the browser player is the theater.
- `ask` requires the local player API and a generated or checked-in tour.
- The current player API serves the checked-in golden tour by alias. Serving a
  freshly generated tour by its ID is part of the Phase 8 local-server work.
- Run progress is read with the client ID from `SOTHSPELL_CLIENT_ID`, defaulting
  to `opencode-plugin`. Sharing the browser's client ID needs the Phase 8 server
  or a player setting.
- `serverPort` is accepted but the packaged-server launch lands with Phase 8.
- A generation in flight is cancelled when the plugin unloads. A failed
  regeneration keeps the previous tour.
