import {
  createHarnessRuntime,
  defineCapabilities,
  launchPlayer,
  type HarnessAdapter,
  type HarnessEvent,
  type HarnessRuntime,
  type HarnessRuntimeOptions,
} from '@sothspell/harness';
import { createClaudeCodeProcessHost, type ClaudeCodeHost } from './host.js';
import { createClaudeCodeGuideModel } from './model.js';

/**
 * The Claude Code adapter: the host session's working directory, the `claude`
 * CLI as the model connection, the shared platform opener, and a message sink
 * for launch failures. Everything else comes from the shared runtime.
 */

export interface ClaudeCodeAdapterOptions {
  /** The project the session is working in; defaults to `process.cwd()`. */
  cwd?: string;
  /** Process seam for tests; defaults to spawning the real CLI. */
  host?: ClaudeCodeHost;
  /** CLI executable name; defaults to `claude`. */
  command?: string;
  /** Default host model when the runtime does not supply one. */
  model?: string;
  /**
   * Phase 9 seam: a profile-aware resolver injected by the host integration.
   * It is consulted before the environment fallback.
   */
  resolveModel?: () => string | undefined;
  platform?: NodeJS.Platform;
  openUrl?: (url: string) => Promise<void>;
  notify?: (message: string) => Promise<void>;
  emit?: (event: HarnessEvent) => void;
  /** Extra argv for the CLI, for example `['--bare']` for scripted runs. */
  extraArgs?: string[];
  maxRepairAttempts?: number;
}

/** Explicit option, then injected resolver, then the host-specific env fallback. */
function resolveClaudeModel(
  options: ClaudeCodeAdapterOptions,
  runtimeModel: string | undefined,
): string | undefined {
  return (
    runtimeModel ??
    options.model ??
    options.resolveModel?.() ??
    process.env.SOTHSPELL_CLAUDE_MODEL ??
    undefined
  );
}

export function createClaudeCodeAdapter(
  options: ClaudeCodeAdapterOptions = {},
): HarnessAdapter {
  const cwd = options.cwd ?? process.cwd();
  const host = options.host ?? createClaudeCodeProcessHost({ command: options.command });
  return {
    id: 'claude-code',
    capabilities: defineCapabilities({
      // The CLI validates `--json-schema` responses itself.
      structuredOutput: true,
      textGeneration: true,
      notify: options.notify !== undefined,
      browserLaunch: true,
      cancel: true,
      backgroundGeneration: true,
    }),
    projectRoot: () => cwd,
    createModel: ({ id, model, signal }) =>
      createClaudeCodeGuideModel({
        host,
        id,
        model: resolveClaudeModel(options, model),
        cwd,
        signal,
        ...(options.extraArgs === undefined ? {} : { extraArgs: options.extraArgs }),
        ...(options.maxRepairAttempts === undefined
          ? {}
          : { maxRepairAttempts: options.maxRepairAttempts }),
      }),
    launch: (url) =>
      launchPlayer(url, {
        ...(options.platform === undefined ? {} : { platform: options.platform }),
        ...(options.openUrl === undefined ? {} : { openUrl: options.openUrl }),
      }),
    ...(options.notify === undefined ? {} : { notify: options.notify }),
    ...(options.emit === undefined ? {} : { emit: options.emit }),
  };
}

export interface ClaudeCodeRuntimeOptions extends ClaudeCodeAdapterOptions {
  playerUrl?: string;
  home?: string;
  clientId?: string;
  fetch?: typeof fetch;
  onProgress?: HarnessRuntimeOptions['onProgress'];
  emitRunUpdates?: boolean;
  dependencies?: HarnessRuntimeOptions['dependencies'];
  maxMinutes?: number;
  startHint?: string;
}

/**
 * The Claude Code runtime. The plugin's skill and hooks call this; the returned
 * object is the shared `HarnessRuntime`, so `sothspell serve` remains the only
 * local server and the run store stays shared with the browser.
 */
export function createClaudeCodeRuntime(
  options: ClaudeCodeRuntimeOptions = {},
): HarnessRuntime {
  const adapter = createClaudeCodeAdapter(options);
  return createHarnessRuntime(adapter, {
    ...(options.playerUrl === undefined ? {} : { playerUrl: options.playerUrl }),
    ...(options.home === undefined ? {} : { home: options.home }),
    ...(options.clientId === undefined ? {} : { clientId: options.clientId }),
    ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
    ...(options.onProgress === undefined ? {} : { onProgress: options.onProgress }),
    ...(options.emitRunUpdates === undefined
      ? {}
      : { emitRunUpdates: options.emitRunUpdates }),
    ...(options.dependencies === undefined ? {} : { dependencies: options.dependencies }),
    ...(options.maxMinutes === undefined ? {} : { maxMinutes: options.maxMinutes }),
    startHint: options.startHint ?? 'start the player with `pnpm sothspell serve`',
  });
}
