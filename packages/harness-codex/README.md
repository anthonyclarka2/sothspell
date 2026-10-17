# `@sothspell/harness-codex`

The Codex adapter for Sóþspell. It translates a Codex session into the
`HarnessAdapter` port and ships the plugin surface Codex loads: a portable
Agent Plugins manifest, skill, SessionStart hook, and scripts.

Researched against the Codex docs on 2026-10-17 (developers.openai.com/codex):
non-interactive mode (`codex exec`), hooks reference, build-skills guide, and
the plugin packaging guide (Agent Plugins `plugin.json`, `extensions.com.openai`,
plugin-bundled hooks, `PLUGIN_ROOT`).

## Host translation

| Host surface                        | Adapter use                                                                    |
| ----------------------------------- | ------------------------------------------------------------------------------ |
| `codex exec --json` (JSONL events)  | `GuideModel`; the final `item.completed` agent message is the text             |
| `codex exec --output-schema <file>` | `GuideModel.generateObject`; the schema is written under the OS temp directory |
| `--sandbox read-only`               | Authoring stays read-only, matching the product invariant                      |
| Session working directory           | `projectRoot()`                                                                |
| Plugin `hooks/hooks.json`           | SessionStart announces an existing tour via `additionalContext`                |
| Plugin `skills/sothspell/`          | The four verbs: `open`, `status`, `generate`, `ask`                            |

Model resolution order: explicit runtime option → adapter option → injected
`resolveModel()` (the Phase 9 profile seam) → `SOTHSPELL_CODEX_MODEL`. No model
configured means the CLI's own configured model.

## Plugin layout

```text
plugin/
├── plugin.json                    portable Agent Plugins manifest
│                                  with extensions.com.openai
├── skills/sothspell/SKILL.md      the four verbs
├── hooks/hooks.json               SessionStart announcement
└── scripts/
    ├── sothspell.sh               wrapper; runs the adapter CLI with tsx
    └── cli.ts                     thin entrypoint over src/cli.ts
```

Codex plugin hooks receive `PLUGIN_ROOT` (and `CLAUDE_PLUGIN_ROOT` for
compatibility); the hook command uses `$PLUGIN_ROOT/scripts/sothspell.sh`. The
wrapper resolves the repository root four levels up and runs
`pnpm --dir <repo> exec tsx scripts/cli.ts`. Set `SOTHSPELL_REPO` when the
plugin lives elsewhere, or `SOTHSPELL_TSX` to a tsx-compatible launcher.

To test locally, point a repo or personal marketplace at the `plugin/`
directory:

```jsonc
// .agents/plugins/marketplace.json (repo) or ~/.agents/plugins/marketplace.json
{
  "name": "local-repo",
  "plugins": [
    {
      "name": "sothspell",
      "source": { "source": "local", "path": "./packages/harness-codex/plugin" },
      "policy": { "installation": "AVAILABLE", "authentication": "ON_INSTALL" },
      "category": "Productivity",
    },
  ],
}
```

Codex skips plugin-bundled hooks until the user reviews and trusts them in
`/hooks`.

## Owner-gated smoke

Real CLI verification is owner-gated:

```bash
pnpm sothspell serve            # terminal 1
codex exec --json "hello"       # confirms the CLI and auth work
codex                            # then: $sothspell generate (or /skills)
```

Confirm the browser opens `<playerUrl>/t/<tourId>` and that
`git -C /Users/ajc/Projects/codegens/bunbun status --porcelain` prints nothing.

## Known assumptions to verify with the real CLI

- `codex exec` accepts `-` as the prompt and reads the prompt from stdin; a
  prompt is required when `--output-schema` or `--ephemeral` is used.
- `--json` emits JSONL on stdout with `item.completed` / `agent_message` items;
  progress goes to stderr.
- `--output-schema <file>` accepts a path to a JSON Schema file.
- `--sandbox read-only`, `--ephemeral`, and `--skip-git-repo-check` combine
  with `-`.
- Plugin hook commands run through a shell with `PLUGIN_ROOT` exported.

## Tests

`pnpm exec vitest run packages/harness-codex` runs the model tests, the harness
conformance suite with a fake host, the CLI/hook tests, and the plugin-surface
checks.
