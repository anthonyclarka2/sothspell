# Harnesses

Sóþspell runs inside agent CLIs through harness adapters. One contract and one
shared runtime keep the behavior identical across hosts; each adapter only
translates the host's surface.

## Contract

`@sothspell/harness` exports:

- `HarnessAdapter` — the host port: `id`, `capabilities`, `projectRoot`,
  `createModel`, and optional `launch`, `notify`, and `emit`.
- `HarnessRuntime` — the shared behavior: `status`, `generate`, `open`,
  `progress`, `ask`, `cancel`, `capabilities`, `events`, and `dispose`.
- `createHarnessRuntime(adapter, options)` — wires the analyzer, authoring
  pipeline, `SOTHSPELL_HOME` storage, local API run reads, player launch, and
  ask pipeline.
- A conformance suite (`harnessConformanceCases`) any adapter runs against a
  fake host: capability matrix, generation lifecycle, cancellation, progress
  merge, error mapping, and cleanup.
- Shared helpers: the text guide model with a bounded repair loop, command
  parsing/formatting, launch, and session-start hook output.

Tours, runs, caches, and quality reports live under `SOTHSPELL_HOME`; adapters
never write into the project and never reimplement authoring or playback.

## Adapters

### OpenCode (V2)

`@sothspell/opencode-plugin` consumes the shared runtime; its plugin file is now
translation only. Commands, tools, and typed RPC are unchanged, and its 46 tests
stay green. The plugin keeps its Vite-dev player default (`5173`).

### Claude Code

`@sothspell/harness-claude-code` ships a plugin manifest with user
configuration, a `sothspell` skill, a session-start hook, and a CLI over the
shared verbs. Model calls use `claude -p --output-format json` with
`--json-schema`; the model resolver is injectable (`SOTHSPELL_CLAUDE_MODEL`
fallback).

### Codex

`@sothspell/harness-codex` mirrors the surface with a portable plugin manifest,
skill, hook, and scripts. Model calls use
`codex exec --json --ephemeral --sandbox read-only --skip-git-repo-check
--output-schema <file> -`; the model resolver is injectable
(`SOTHSPELL_CODEX_MODEL` fallback).

## Player launch

Adapters open the local player at `SOTHSPELL_PLAYER_URL` or
`http://127.0.0.1:4319` (`sothspell serve`) and deep-link to the generated tour.
The OpenCode plugin keeps its own default. No adapter starts a second server.

## Progress

The runtime uses `SOTHSPELL_CLIENT_ID` when set and otherwise a stable
per-install id, so a harness run can be shared with the browser client.

## Verified behavior

- The harness contract, shared runtime, and conformance suite are covered by
  unit tests (18 files / 161 tests focused; 50 files / 324 tests in the full
  suite).
- The OpenCode plugin's existing tests pass unchanged after the refactor.
- Claude Code and Codex adapters pass the conformance suite against fake hosts.

## Owner-gated

A real Claude Code CLI session, a real Codex CLI session, and a real OpenCode
V2 TUI session should be run before publishing. Validate the Claude Code plugin
with `claude plugin validate` and confirm the Codex manifest/hook surfaces in
the installed CLI.
