/**
 * `@sothspell/harness-claude-code` — the Claude Code adapter. It translates the
 * host into the `HarnessAdapter` port and ships the plugin surface (manifest,
 * skill, hooks, and scripts) checked in under `plugin/`.
 */

export {
  createClaudeCodeAdapter,
  createClaudeCodeRuntime,
  type ClaudeCodeAdapterOptions,
  type ClaudeCodeRuntimeOptions,
} from './adapter.js';

export {
  createClaudeCodeGuideModel,
  parseClaudeCodeResult,
  type ClaudeCodeGuideModelOptions,
  type ClaudeCodeResult,
} from './model.js';

export {
  createClaudeCodeProcessHost,
  type ClaudeCodeHost,
  type ClaudeCodeHostRunInput,
  type ClaudeCodeHostRunResult,
  type ClaudeCodeProcessHostOptions,
} from './host.js';

export {
  runClaudeCodeCli,
  runClaudeCodeHook,
  claudeCodeOptionsFromEnv,
  type ClaudeCodeCliOptions,
} from './cli.js';
