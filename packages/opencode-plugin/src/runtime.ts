import type { GuideModel } from '@sothspell/authoring';
import { authorTour, buildContextPack } from '@sothspell/authoring';
import { analyzeProject, buildProjectBrief } from '@sothspell/analyzer';
import {
  createHarnessRuntime,
  defineCapabilities,
  launchPlayer,
  SothspellError,
  type GenerationProgress,
  type HarnessAdapter,
  type HarnessRunSummary,
  type HarnessRuntimeDependencies,
  type HarnessStatus,
  type LaunchResult,
  type SothspellErrorCode,
} from '@sothspell/harness';
import { OpenCodeGuideModel, type ModelRef } from './opencode-model.js';

/**
 * The OpenCode adapter. Everything OpenCode-specific lives here: the host
 * context becomes the adapter port, and the shared runtime from
 * `@sothspell/harness` owns analysis, authoring, storage, player reads, and
 * ask. The plugin's commands, tools, and RPC are thin translations of the
 * runtime's status/generate/open/progress/ask surface.
 */

export type SothspellRunSummary = HarnessRunSummary;
export type SothspellStatus = HarnessStatus;

export interface SothspellGenerateResult {
  tourId: string;
  playerUrl: string;
  quality: unknown;
}

export interface SothspellRuntime {
  status(): Promise<SothspellStatus>;
  generate(input: { maxMinutes?: number }): Promise<SothspellGenerateResult>;
  open(): Promise<{ playerUrl: string }>;
  progress(): Promise<{ run: unknown | null }>;
  ask(input: { question: string; beatId?: string }): Promise<{ answer: unknown }>;
  cancel(): Promise<void>;
}

export type { GenerationProgress, LaunchResult, SothspellErrorCode };
export { SothspellError };

export interface OpenCodeRuntimeContext {
  readonly location: { readonly directory: string };
  readonly generate?: {
    text(
      input: { prompt: string; model?: ModelRef | null },
      options?: { signal?: AbortSignal },
    ): Promise<{ text: string }>;
  };
  readonly session?: {
    create?(input?: { title?: string }): Promise<{ id: string }>;
    generate(
      input: { sessionID: string; prompt: string },
      options?: { signal?: AbortSignal },
    ): Promise<{ text: string }>;
  };
}

export interface DefaultRuntimeDependencies extends HarnessRuntimeDependencies {
  createModel: (
    context: OpenCodeRuntimeContext,
    options: { id: string; model: ModelRef | undefined; signal: AbortSignal },
  ) => GuideModel;
}

export interface DefaultRuntimeOptions {
  playerUrl?: string;
  maxMinutes?: number;
  /** `provider/model` or `provider/model#variant` from plugin options. */
  model?: string;
  home?: string;
  clientId?: string;
  fetch?: typeof fetch;
  platform?: NodeJS.Platform;
  openUrl?: (url: string) => Promise<void>;
  onProgress?: (progress: GenerationProgress) => void;
  dependencies?: Partial<DefaultRuntimeDependencies>;
}

export const DEFAULT_PLAYER_URL = 'http://127.0.0.1:5173';
export { DEFAULT_MAX_MINUTES } from '@sothspell/harness';

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/u, '');
}

function modelRef(value: string | undefined): ModelRef | undefined {
  if (!value) {
    return undefined;
  }
  const match = /^([^/]+)\/([^#]+)(?:#(.+))?$/u.exec(value);
  if (!match?.[1] || !match[2]) {
    return undefined;
  }
  return {
    providerID: match[1],
    id: match[2],
    ...(match[3] ? { variant: match[3] } : {}),
  };
}

function defaultDependencies(): DefaultRuntimeDependencies {
  return {
    analyzeProject,
    buildProjectBrief,
    buildContextPack,
    authorTour,
    createModel: (context, options) => new OpenCodeGuideModel(context, options),
  };
}

export function createOpenCodeAdapter(
  context: OpenCodeRuntimeContext,
  options: DefaultRuntimeOptions = {},
): HarnessAdapter {
  const dependencies = { ...defaultDependencies(), ...options.dependencies };
  return {
    id: 'opencode',
    capabilities: defineCapabilities({
      // The host exposes text, not schema-validated objects; the shared text
      // model owns the JSON-only prompt and the repair loop.
      structuredOutput: false,
      textGeneration:
        typeof context.generate?.text === 'function' ||
        typeof context.session?.generate === 'function',
      notify: false,
      browserLaunch: true,
      cancel: true,
      backgroundGeneration: true,
    }),
    projectRoot: () => context.location.directory,
    createModel: ({ id, model, signal }) =>
      dependencies.createModel(context, { id, model: modelRef(model), signal }),
    launch: (url) =>
      launchPlayer(url, {
        ...(options.platform === undefined ? {} : { platform: options.platform }),
        ...(options.openUrl === undefined ? {} : { openUrl: options.openUrl }),
      }),
  };
}

/**
 * The OpenCode runtime: the shared harness runtime wired to the adapter. The
 * returned object is exactly the port the plugin's commands, tools, and RPC
 * handlers already consume.
 */
export function createDefaultRuntime(
  context: OpenCodeRuntimeContext,
  options: DefaultRuntimeOptions = {},
): SothspellRuntime {
  const dependencies = { ...defaultDependencies(), ...options.dependencies };
  const adapter = createOpenCodeAdapter(context, { ...options, dependencies });
  return createHarnessRuntime(adapter, {
    playerUrl: trimTrailingSlash(options.playerUrl ?? DEFAULT_PLAYER_URL),
    ...(options.maxMinutes === undefined ? {} : { maxMinutes: options.maxMinutes }),
    ...(options.model === undefined ? {} : { model: options.model }),
    ...(options.home === undefined ? {} : { home: options.home }),
    ...(options.clientId === undefined ? {} : { clientId: options.clientId }),
    ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
    ...(options.onProgress === undefined ? {} : { onProgress: options.onProgress }),
    // The RPC progress handler owns run.updated for OpenCode, so the runtime
    // does not mirror a second copy into the host event stream.
    emitRunUpdates: false,
    startHint: 'start it with /sothspell open',
    dependencies,
  });
}

export { launchPlayer, completedBeatCount } from '@sothspell/harness';
