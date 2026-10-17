# Phase 7 — OpenCode V2 Plugin

**Status: in progress (2026-10-17).** Depends on: Phase 3 (authoring), Phase 4
(player), Phase 6 (runs and answers). The Phase 8 local-server packaging may start
during Phase 7 and is part of the plugin's launch path.

**Deliverable:** an OpenCode V2 plugin that generates and opens a Sóþspell for the
current project, answers questions through the same guide, and shares progress
with the web player. It uses the user's configured OpenCode model, writes nothing
to the project, and runs on `@opencode/plugin` 2.0.32.

## Goal

Bring the truth story to the harness where the developer already works. The
plugin should feel native: a command, a tool the agent can call, a status line,
and a browser player when the user wants the cinematic view.

This is the first non-web harness adapter. The web app and the plugin together
justify the harness seam.

## Why this order

- The artifact, authoring pipeline, player, and runs exist.
- The plugin can reuse the packaged local server from Phase 8; packaging can be
  pulled forward if needed.
- The OpenCode V2 plugin API is current and has the required capabilities:
  commands, tools, RPC, storage, VCS, and model generation.

## Scope

### In scope

- `@sothspell/opencode-plugin` package.
- `Plugin.define` lifecycle and options.
- `/sothspell` command to generate/open a tour for the current project.
- `/sothspell status` command.
- Agent tools: generate, open, progress, ask.
- Typed RPC contract for external clients and the TUI.
- OpenCode `GuideModel` adapter using the configured model.
- Project root and revision from `ctx.location` and `ctx.vcs`.
- Player launch through the packaged local server.
- Shared `SOTHSPELL_HOME` with the web app.
- Plugin tests with the OpenCode SDK embedded host.
- Bunbun read-only plugin acceptance.

### Out of scope

- A full TUI movie player (diagrams and speech need a browser).
- V1 plugin compatibility.
- Other harness adapters.
- Publishing to the OpenCode plugin registry (release task).
- Editing or executing project code.

## Decisions

1. **Target V2.** Use `@opencode/plugin` 2.0.32 and the V2 SDK. Do not target the
   older `@opencode-ai/plugin` V1 API.
2. **Use the host model.** The plugin calls `ctx.generate.text` (or
   `ctx.session.generate` where a session is required) so the user's OpenCode
   model authors the tour. No second API key is required.
3. **The browser is the theater.** The plugin launches the local web player. The
   TUI provides commands, status, and text answers, not diagrams or audio.
4. **No project writes.** Tour artifacts, snapshots, audio, and runs live in
   `SOTHSPELL_HOME`. The plugin never writes `.sothspell/` into the target repo.
5. **RPC is the integration seam.** The web app and external clients can call the
   plugin's RPC for status/open/progress. The plugin can call the same RPC
   internally.
6. **One player server per user.** If a server is already running on the
   configured port, reuse it; otherwise start it and open the URL.
7. **Graceful degradation.** If the browser cannot open, print the URL and a
   short instruction. If generation fails, keep the previous tour and show the
   error.

## Waves

### Wave 0 — Package and plugin shell

1. Create `packages/opencode-plugin`:
   ```json
   {
     "name": "@sothspell/opencode-plugin",
     "type": "module",
     "exports": {
       ".": "./dist/index.js",
       "./rpc": "./dist/rpc.js"
     },
     "peerDependencies": {
       "@opencode/plugin": "^2.0.32"
     }
   }
   ```
2. Implement:
   ```ts
   import { Plugin } from '@opencode/plugin';

   export default Plugin.define({
     id: 'sothspell',
     async setup(ctx) {
       return async () => {
         // cleanup: close RPC, stop the server if this plugin started it
       };
     },
   });
   ```
3. Read options from `ctx.options`:
   - `serverPort` (default 4319);
   - `autoOpen` (default true);
   - `model` (optional override);
   - `maxMinutes` (default 12).
4. Test with `@opencode/sdk` embedded host:
   - plugin loads;
   - setup/cleanup runs;
   - no network listener is opened during tests.
5. Add a `README.md` with installation and config.

### Wave 1 — RPC contract

1. Define `SothspellRpc` with `Rpc.define` in `src/rpc.ts`:
   - `status`;
   - `open`;
   - `generate`;
   - `progress`;
   - `ask`;
   - `cancel`.
2. Inputs/outputs use Zod schemas:
   - project path/ID;
   - tour ID;
   - run ID;
   - question;
   - generation options;
   - status object (running, progress, error, URL).
3. Events:
   - `tour.updated`;
   - `generation.progress`;
   - `run.updated`.
4. Register with `ctx.rpc.register(SothspellRpc, handlers)`.
5. Test:
   - methods return declared shapes;
   - declared errors;
   - events;
   - external client through the embedded host.

### Wave 2 — GuideModel adapter and project context

1. `OpenCodeGuideModel`:
   - `generateObject` via `ctx.generate.text` with a JSON-only prompt, Zod parse,
     and a bounded repair loop;
   - `generateText` for answers;
   - model selection from `ctx.model` / options;
   - cancellation via `context.signal`.
2. Is the structured-output path reliable? The plugin can use `ctx.session.generate`
   with a JSON instruction if `ctx.generate.text` lacks schema support. The
   adapter hides the choice; tests use a fake host.
3. Project context:
   - `ctx.location.directory` — project root;
   - `ctx.location.project` — project metadata;
   - `ctx.vcs.get()` — branch/commit;
   - `ctx.vcs.status()` — dirty state;
   - `ctx.vcs.diff()` — optional; not used for authoring in the first release.
4. Safety:
   - resolve the root and apply the same allowlist/symlink checks as Phase 2;
   - never write to the root;
   - redact secrets before sending context to the model.
5. Tests:
   - fake model returns a valid tour;
   - invalid JSON triggers repair;
   - cancellation;
   - dirty repo does not change the artifact location.

### Wave 3 — Commands and tools

1. Commands:
   - `/sothspell` — generate a tour for the current project if none exists, then
     open the player; if one exists, open it;
   - `/sothspell status` — show the current tour, run progress, and URL;
   - `/sothspell ask <question>` — ask at the current beat and print the cited
     answer.
2. Tools:
   - `sothspell_generate`: input `{ path?, depth?, focus?, maxMinutes? }`;
     output `{ tourId, url, quality }`;
   - `sothspell_open`: output `{ url }`;
   - `sothspell_progress`: output `{ tourId, beatId, completed, url }`;
   - `sothspell_ask`: input `{ question, beatId? }`; output cited answer.
3. Tool descriptions explain when to use them. The agent should not call
   generation on every prompt; it should offer it when the user asks for a
   walkthrough.
4. Permissions:
   - generation is a local, read-only action;
   - opening a browser is allowed by default;
   - no shell command is exposed.
5. Tests:
   - command registration;
   - tool schema;
   - tool execution with a fake authoring service;
   - error mapping.

### Wave 4 — Player launch and shared state

1. Resolve the packaged CLI/server:
   - in development, use the workspace `@sothspell/cli`;
   - in the published plugin, depend on the CLI package or resolve a bundled
     entry;
   - start `sothspell serve --project <root> --port <port> --no-open` if no
     healthy server is running;
   - reuse an existing server from `$SOTHSPELL_HOME/server.json`.
2. Health check:
   - `GET /api/health`;
   - version compatibility check;
   - if the running server is incompatible, start a new port and report it.
3. Open the browser:
   - macOS `open`, Linux `xdg-open`, Windows `start`;
   - if it fails, print the URL.
4. State:
   - `SOTHSPELL_HOME` shared with the web app;
   - run progress visible through RPC;
   - the plugin can read the current beat and completed count.
5. TUI output:
   - a compact status block: tour title, chapter, beat, progress, URL;
   - no attempt to render diagrams in the terminal.
6. Tests:
   - server reuse;
   - version mismatch;
   - port collision;
   - browser-open failure fallback;
   - cleanup does not stop a server it did not start.

### Wave 5 — OpenCode acceptance and closure

1. Install the plugin in a temporary project (not Bunbun) with a local
   `opencode.json`:
   ```jsonc
   {
     "plugins": [{ "package": "@sothspell/opencode-plugin", "options": {} }],
   }
   ```
2. Start OpenCode V2; verify:
   - plugin loads without errors;
   - `/sothspell` is listed;
   - tools are visible to the agent;
   - RPC responds through `opencode api` or a client.
3. Run the Bunbun demo:
   - open OpenCode in `/Users/ajc/Projects/codegens/bunbun`;
   - run `/sothspell`;
   - generate or open the golden tour;
   - verify the player URL opens and progress is recorded;
   - assert `git status --porcelain` in Bunbun is empty.
4. Ask a question through `/sothspell ask` and verify citations.
5. Test cleanup: exit OpenCode; the server stops if the plugin started it.
6. Update `docs/opencode-plugin.md`, the README install section, and
   `AGENTS.md` commands.

## Test seams

Confirm before the first test:

1. `Plugin.define` setup and cleanup.
2. `SothspellRpc` method contracts and events.
3. `OpenCodeGuideModel.generateObject` / `generateText`.
4. Command and tool registration.
5. Local server launch/reuse (`ensureServer`).
6. Embedded-host acceptance with `@opencode/sdk`.

What they cover and miss:

- Plugin lifecycle: catches load/cleanup; misses host-version quirks.
- RPC: catches schema and handler behavior; misses cross-process transport.
- GuideModel: catches JSON/repair; misses model quality.
- Commands/tools: catches registration and schemas; misses TUI presentation.
- Server launch: catches reuse/collision; misses OS-specific browser behavior.
- Embedded host: catches most integration; a manual V2 run is still required.

## Exit criteria (measurable)

1. `@sothspell/opencode-plugin` installs and loads in OpenCode V2 with
   `@opencode/plugin` 2.0.32.
2. `/sothspell`, `/sothspell status`, and `/sothspell ask` are available.
3. The generation, open, progress, and ask tools are visible and validate their
   inputs.
4. The RPC methods return declared shapes and emit progress events.
5. `/sothspell` on Bunbun opens a playable tour without writing to the Bunbun
   tree; `git status --porcelain` is empty.
6. The plugin uses the OpenCode model with no second API key in the default path.
7. Closing OpenCode stops a server the plugin started and leaves an existing
   server running.
8. Embedded-host tests and a manual V2 smoke pass.
9. `pnpm typecheck`, `pnpm lint`, and `pnpm test` are green.
10. The plugin README documents install, options, commands, tools, and known
    limitations (no TUI diagrams or audio).

## Risks and mitigations

- **V2 API churn.** Pin the OpenCode package version; keep the adapter thin; use
  the embedded host tests to catch breakage early.
- **Plugin packaging.** The published plugin must resolve the CLI/server. Prefer
  a direct dependency on `@sothspell/cli` over a path assumption; test a packed
  tarball install.
- **Port collisions.** Health-check and reuse; choose a new port if needed.
- **Browser launch on headless machines.** Print the URL; do not fail the
  command.
- **Model output shape.** The OpenCode host may not expose structured output;
  use JSON-only prompts plus validation and repair.
- **Project writes.** Store everything outside the root; test with Bunbun's git
  status.

## Working style

- Build against the embedded SDK first; then run the real V2 host.
- Use the `opencode` skill and V2 docs for every API question; do not guess field
  shapes.
- Use `tdd` for RPC and tool contracts.
- Keep the plugin thin: it is an adapter over the same core, authoring, and
  player packages.
- Record the exact OpenCode version and plugin API version in the closure note.
