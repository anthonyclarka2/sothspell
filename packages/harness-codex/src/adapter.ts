import {
  createHarnessRuntime,
  defineCapabilities,
  launchPlayer,
  DEFAULT_SERVE_URL,
  type HarnessAdapter,
  type HarnessEvent,
  type HarnessRuntime,
  type HarnessRuntimeOptions,
} from '@sothspell/harness';
import { createCodexProcessHost, type CodexHost } from './host.js';
import { createCodexGuideModel } from './model.js';

/**
 * The Codex adapter: the session working directory, `codex exec` as the model
 * connection, the shared platform opener, and a message sink for launch
 * failures. Everything else comes from the shared runtime.
 */

export interface CodexAdapterOptions {
  /** The project the session is working in; defaults to `process.cwd()`. */
  cwd?: string;
  /** Process seam for tests; defaults to spawning the real CLI. */
  host?: CodexHost;
  /** CLI executable name; defaults to `codex`. */
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
  /** Extra argv for `codex exec`, for example `['--ignore-user-config']`. */
  extraArgs?: string[];
  maxRepairAttempts?: number;
  workDirectory?: string;
}

/** Explicit option, then injected resolver, then the host-specific env fallback. */
function resolveCodexModel(
  options: CodexAdapterOptions,
  runtimeModel: string | undefined,
): string | undefined {
  return (
    runtimeModel ??
    options.model ??
    options.resolveModel?.() ??
    process.env.SOTHSPELL_CODEX_MODEL ??
    undefined
  );
}

export function createCodexAdapter(options: CodexAdapterOptions = {}): HarnessAdapter {
  const cwd = options.cwd ?? process.cwd();
  const host = options.host ?? createCodexProcessHost({ command: options.command });
  return {
    id: 'codex',
    capabilities: defineCapabilities({
      // `--output-schema` requests a validated final response.
      structuredOutput: true,
      textGeneration: true,
      notify: options.notify !== undefined,
      browserLaunch: true,
      cancel: true,
      backgroundGeneration: true,
    }),
    projectRoot: () => cwd,
    createModel: ({ id, model, signal }) =>
      createCodexGuideModel({
        host,
        id,
        model: resolveCodexModel(options, model),
        cwd,
        signal,
        ...(options.extraArgs === undefined ? {} : { extraArgs: options.extraArgs }),
        ...(options.maxRepairAttempts === undefined
          ? {}
          : { maxRepairAttempts: options.maxRepairAttempts }),
        ...(options.workDirectory === undefined
          ? {}
          : { workDirectory: options.workDirectory }),
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

export interface CodexRuntimeOptions extends CodexAdapterOptions {
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
 * The Codex runtime. The plugin's skill and hooks call this; the returned
 * object is the shared `HarnessRuntime`, so `sothspell serve` remains the only
 * local server and the run store stays shared with the browser.
 */
export function createCodexRuntime(options: CodexRuntimeOptions = {}): HarnessRuntime {
  const adapter = createCodexAdapter(options);
  return createHarnessRuntime(adapter, {
    playerUrl: options.playerUrl ?? DEFAULT_SERVE_URL,
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
