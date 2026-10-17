# OpenCode V2 Plugin

`@sothspell/opencode-plugin` brings Sóþspell into OpenCode V2. It analyzes the
current project read-only, authors a tour with the host model, opens the browser
player, and answers questions at the current beat.

## Install

Add the plugin to the project configuration:

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

The host must provide `@opencode/plugin` 2.0.32. The plugin has no second model
key: generation uses `ctx.generate.text`, with a session fallback.

## Options

| Option       | Default                 | Meaning                                                                             |
| ------------ | ----------------------- | ----------------------------------------------------------------------------------- |
| `playerUrl`  | `http://127.0.0.1:5173` | Browser player/API base. Point it at `sothspell serve` (4319) for the release path. |
| `autoOpen`   | `true`                  | Open the browser after generating/opening a tour.                                   |
| `model`      | host default            | Optional `provider/model` or `provider/model#variant`.                              |
| `maxMinutes` | `12`                    | Target tour runtime.                                                                |
| `serverPort` | `4319`                  | Reserved for packaged server launch.                                                |

Invalid options fail setup with a message naming the field.

## Commands

- `/sothspell` — open the latest tour, or generate one.
- `/sothspell status` — show the tour, run progress, and player URL.
- `/sothspell generate` — regenerate even when a tour exists.
- `/sothspell ask <question>` — ask at the current beat and print citations.

## Tools

- `sothspell_status`
- `sothspell_open`
- `sothspell_generate`
- `sothspell_ask`

Tools are local, read-only over the project, and generate only when the user
asks for a walkthrough.

## RPC

`@sothspell/opencode-plugin/rpc` exports `SothspellRpc` with `status`, `open`,
`generate`, `progress`, `ask`, and `cancel`, plus `generation.progress` and
`run.updated` events. External clients can call it through an OpenCode client.

## Runtime

The plugin writes snapshots, tours, quality reports, and authoring caches under
`SOTHSPELL_HOME` (default `~/.sothspell`), never into the project. The generated
tour is served by the local API when it is under
`$SOTHSPELL_HOME/projects/<slug>/tours/<tourId>/tour.json`.

## Verified behavior

- Plugin loads in the embedded OpenCode SDK host.
- The probe plugin sees the `sothspell` command and four tools.
- `rpc.status` answers and cleanup runs on close.
- 46 plugin tests cover the runtime, RPC, tools, commands, model adapter, and
  host smoke.

## Known limitations

- The terminal cannot render diagrams, code highlighting, or narration audio;
  the browser is the theater.
- The plugin's player URL defaults to the Vite dev player (5173). For the
  packaged path, set `playerUrl` to the `sothspell serve` base (4319).
- Generated tours are served by the local API; the browser's golden home page
  still lists the checked-in tour, so the plugin opens the generated tour by
  deep link.
- Run progress uses `SOTHSPELL_CLIENT_ID` (default `opencode-plugin`) rather than
  the browser's local client id; shared progress is a follow-up.
- A real V2 TUI listing of transform-registered commands should be checked
  manually; the embedded host exposes them through the plugin context.
