# `@sothspell/harness-claude-code`

The Claude Code adapter for Sóþspell. It translates a Claude Code session into
the `HarnessAdapter` port and ships the plugin surface Claude Code loads:
manifest, skill, SessionStart hook, and scripts.

Researched against the Claude Code docs on 2026-10-17 (Claude Code v2.1.x):
plugin manifest and components, hooks reference, skills reference, CLI
reference, and the headless/Agent SDK CLI guide.

## Host translation

| Host surface                     | Adapter use                                                                                                               |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `claude -p --output-format json` | `GuideModel.generateText`; the prompt is the positional argument, the system prompt goes through `--append-system-prompt` |
| `claude -p --json-schema`        | `GuideModel.generateObject`; the CLI validates and returns `structured_output`                                            |
| Session working directory        | `projectRoot()`                                                                                                           |
| Plugin `hooks/hooks.json`        | SessionStart announces an existing tour via `additionalContext`                                                           |
| Plugin `skills/sothspell/`       | The four verbs: `open`, `status`, `generate`, `ask`                                                                       |
| `userConfig`                     | `player_url` and `model`, exported as `CLAUDE_PLUGIN_OPTION_*`                                                            |

Model resolution order: explicit runtime option → adapter option → injected
`resolveModel()` (the Phase 9 profile seam) → `SOTHSPELL_CLAUDE_MODEL`. No model
configured means the CLI's own session model.

## Plugin layout

```text
plugin/
├── .claude-plugin/plugin.json     manifest and userConfig
├── skills/sothspell/SKILL.md      the four verbs
├── hooks/hooks.json               SessionStart announcement
└── scripts/
    ├── sothspell.sh               wrapper; runs the adapter CLI with tsx
    └── cli.ts                     thin entrypoint over src/cli.ts
```

The wrapper resolves the repository root four levels up and runs
`pnpm --dir <repo> exec tsx scripts/cli.ts`. Set `SOTHSPELL_REPO` when the
plugin lives elsewhere, or `SOTHSPELL_TSX` to a tsx-compatible launcher. This
is the in-repo development path; a packaged distribution would bundle the
adapter instead.

## Owner-gated smoke

Real CLI verification is owner-gated:

```bash
pnpm sothspell serve            # terminal 1
claude --plugin-dir "$PWD/packages/harness-claude-code/plugin"
# then: /sothspell generate
```

Confirm the browser opens `<playerUrl>/t/<tourId>` and that
`git -C /Users/ajc/Projects/codegens/bunbun status --porcelain` prints nothing.

## Known assumptions to verify with the real CLI

- `claude -p --output-format json` returns `{ result, structured_output, ... }`
  on stdout, with a non-zero exit code on failure.
- `--json-schema` accepts a JSON Schema string as its argument.
- The positional prompt argument is used as the prompt; the adapter guards
  against very long prompts only by construction (context packs are bounded).
- Hook commands support `args` (exec form) with `${CLAUDE_PLUGIN_ROOT}`.
- `userConfig` values reach hook processes as `CLAUDE_PLUGIN_OPTION_<KEY>`.

## Tests

`pnpm exec vitest run packages/harness-claude-code` runs the model tests, the
harness conformance suite with a fake host, the CLI/hook tests, and the
plugin-surface checks.
