/**
 * `@sothspell/harness-codex` — the Codex adapter. It translates the host into
 * the `HarnessAdapter` port and ships the plugin surface (portable manifest,
 * skill, hooks, and scripts) checked in under `plugin/`.
 */

export {
  createCodexAdapter,
  createCodexRuntime,
  type CodexAdapterOptions,
  type CodexRuntimeOptions,
} from './adapter.js';

export {
  createCodexGuideModel,
  lastAgentMessage,
  parseCodexEvents,
  type CodexEvent,
  type CodexGuideModelOptions,
} from './model.js';

export {
  createCodexProcessHost,
  type CodexHost,
  type CodexHostRunInput,
  type CodexHostRunResult,
  type CodexProcessHostOptions,
} from './host.js';

export { runCodexCli, runCodexHook, type CodexCliOptions } from './cli.js';
