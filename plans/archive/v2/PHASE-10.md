# Phase 10 — Harness Plugins

**Status: complete (2026-10-17).** Depends on: Phase 7 (OpenCode plugin,
archived) and the shared harness runtime. Phase 9 profile resolution is injected
via the adapter model resolver; profile wiring lands with Phase 9 integration.

## Goal

Make Sóþspell available in the agent CLIs people already use. One
`HarnessAdapter` contract and one shared runtime serve OpenCode, Claude Code,
Codex, and future hosts, so each adapter stays thin and the behavior stays the
same.

## Scope

### In

- A concrete `HarnessAdapter` contract in `packages/harness`.
- A shared harness runtime extracted from the OpenCode plugin: status, generate,
  open, progress, ask, cancel.
- A Claude Code adapter package with commands, skills, and hooks as the host
  allows.
- A Codex adapter package with the equivalent surface.
- Shared player launch via `sothspell serve`, including generated-tour deep
  links.
- A harness conformance suite any adapter can run against a fake host.
- Docs per adapter and a harness authoring guide.

### Out

- A marketplace or distribution service.
- Hosted harness execution.
- GUI plugins for editors (VS Code, JetBrains) — future track.
- More than one adapter per wave; Claude Code then Codex.

## Decisions

1. **The contract is a port, not a framework.** `HarnessAdapter` describes the
   host capabilities Sóþspell needs; the shared runtime contains the logic.
   Adapters translate host APIs into the port.
2. **`packages/harness` gains no host dependencies.** Host-specific code lives
   in adapter packages (`packages/harness-claude-code`,
   `packages/harness-codex`). The OpenCode plugin becomes
   `packages/harness-opencode` or keeps its name and consumes the runtime.
3. **One runtime, one state model.** Tours, runs, and caches stay under
   `SOTHSPELL_HOME`; adapters do not invent storage.
4. **Player launch is shared.** `sothspell serve` is the single local server;
   adapters open a deep link to the generated tour and never embed a second
   server.
5. **Progress uses a shared client identity.** The runtime uses
   `SOTHSPELL_CLIENT_ID` when set and otherwise a stable per-install id, so the
   browser and harnesses can share a run.
6. **Claude Code first, then Codex.** Each adapter is verified against its real
   CLI (owner-gated) plus the conformance suite with a fake host.
7. **Fail loudly, degrade gracefully.** Missing host capabilities (for example,
   no structured generation) produce a named capability error; the adapter can
   fall back to plain text plus the repair loop.

## Waves

### Wave 1 — Contract and shared runtime

- `HarnessAdapter` types: `status`, `generate`, `open`, `progress`, `ask`,
  `cancel`, `capabilities`, `events`.
- `createHarnessRuntime(adapter, options)` with the OpenCode runtime logic moved
  behind the port.
- Conformance tests: capability matrix, generation lifecycle, cancellation,
  progress merge, error mapping, cleanup.
- Refactor the OpenCode plugin to consume the runtime; all existing plugin tests
  stay green.

### Wave 2 — Claude Code adapter

- Package `@sothspell/harness-claude-code` with the host's command/skill/hook
  surface.
- Commands: open, status, generate, ask. The adapter maps host model calls and
  session output to the runtime.
- Tests: conformance suite with a fake Claude Code host; command parsing; skill
  content.
- Owner-gated: a real Claude Code session generates and opens a Bunbun tour.

### Wave 3 — Codex adapter

- Package `@sothspell/harness-codex` with the Codex CLI configuration and
  command surface.
- Tests: conformance suite with a fake Codex host; configuration schema.
- Owner-gated: a real Codex session generates and opens a Bunbun tour.

### Wave 4 — Shared launch, docs, and the next CLIs

- Player launch through `sothspell serve` with deep links, port selection, and
  an already-running check.
- `docs/harnesses.md` and one guide per adapter.
- A backlog for the next adapters (for example, Gemini CLI, Aider) with the
  conformance suite as the entry bar.

## Test seams

- `packages/harness` contract and runtime with a fake adapter.
- Each adapter package against a fake host implementing the host API.
- The OpenCode plugin's existing tests, kept as a regression suite.
- CLI-level smoke through `sothspell serve` and the generated-tour API.

## Bunbun acceptance

1. Start `sothspell serve`.
2. From Claude Code, run the Sóþspell command and generate a Bunbun tour.
3. Confirm the browser opens the generated tour and the run is recorded.
4. Repeat from Codex.
5. Confirm the Bunbun tree is unchanged.

## Exit criteria

- `HarnessAdapter` is documented and has a conformance suite.
- Claude Code and Codex adapters pass the suite and load in their hosts.
- The shared runtime is the only implementation of generate/open/progress/ask;
  adapters contain translation only.
- The OpenCode plugin still passes its tests after the refactor.
- Docs exist for the contract and both adapters.
- Bunbun remains read-only.

## Risks

- **Host API churn.** Claude Code and Codex surfaces move quickly. Keep the port
  small, pin versions, and put churn behind adapters.
- **Model access differences.** Some hosts expose text-only generation. The
  repair loop and a named capability error are the fallback.
- **Launch friction.** Users may not have `sothspell serve` running. The adapter
  should detect a closed port and print the exact command, or start the server
  when the host allows child processes.
- **Duplicated docs drift.** One shared harness guide plus short per-adapter
  pages keeps the surface manageable.

## Working style

- Use the `opencode` skill for the OpenCode refactor and host API questions.
- Use `tdd` and `codebase-design` for the contract; write the conformance suite
  before the second adapter.
- Verify with the real CLI when credentials and the host are available; record
  the exact host versions.
- Keep every adapter free of provider keys and project writes.

## Shipped (closure, 2026-10-17)

- **`packages/harness`** — `HarnessAdapter` port, `createHarnessRuntime` shared
  runtime, conformance suite with a fake harness backend and fake player fetch,
  shared text guide model with a bounded repair loop, command parsing/formatting,
  launch helpers, and session-start hook output.
- **OpenCode plugin refactor** — the plugin runtime shrank from 553 to 175 lines
  and now consumes the shared runtime; all 46 existing tests pass unchanged.
- **Claude Code adapter** — plugin manifest with user configuration, a
  `sothspell` skill, a session-start hook, a CLI over the shared verbs, and a
  model resolver over `claude -p --output-format json --json-schema`.
- **Codex adapter** — the mirrored surface with a portable plugin manifest,
  skill, hook, and scripts, and a model resolver over
  `codex exec --json --ephemeral --sandbox read-only --skip-git-repo-check
--output-schema`.
- **Docs** — `docs/harnesses.md` plus per-adapter package READMEs.

### Closure verification (fresh output, 2026-10-17)

- Focused: `pnpm exec vitest run packages/harness packages/harness-claude-code
packages/harness-codex packages/opencode-plugin` → 18 files / 161 tests.
- Full gate after merge: `pnpm typecheck` clean, `pnpm lint` clean,
  `pnpm test` → 50 files / 324 tests, `pnpm build` clean,
  `pnpm check:toolchain` OK.
- No new external dependency; workspace links only.
- Bunbun remains read-only.

### Owner-gated / follow-ups

- Real Claude Code, Codex, and OpenCode V2 TUI sessions were not run; validate
  the plugin manifests and host JSON shapes before publishing.
- Profile-aware model resolution is injected; the active-profile wiring is part
  of Phase 9 integration.
- The remaining adapter backlog (for example Gemini CLI, Aider) enters through
  the conformance suite.
