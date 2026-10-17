import { spawn } from 'node:child_process';
import { readFile, readdir, realpath, mkdir, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  analyzeProject,
  buildProjectBrief,
  type AnalyzeOptions,
  type ProjectBrief,
  type ProjectSnapshot,
} from '@sothspell/analyzer';
import {
  authorTour,
  buildContextPack,
  type AuthorTourOptions,
  type AuthoringResult,
  type BuildContextOptions,
  type ContextPack,
  type GuideModel,
} from '@sothspell/authoring';
import { SothspellDocumentSchema, type SothspellDocument } from '@sothspell/core';
import { OpenCodeGuideModel, type ModelRef } from './opencode-model.js';

/**
 * The plugin's only dependency on the host. Commands, tools, and RPC handlers
 * all talk to this port, so the OpenCode API stays at one seam and tests can
 * exercise the complete surface with a fake runtime.
 */
export interface SothspellRunSummary {
  beatId: string;
  completed: number;
}

export interface SothspellStatus {
  projectRoot: string;
  tourId: string | null;
  playerUrl: string;
  run: SothspellRunSummary | null;
}

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

export type SothspellErrorCode =
  'generation_running' | 'generation_failed' | 'no_tour' | 'ask_failed';

export class SothspellError extends Error {
  readonly code: SothspellErrorCode;

  constructor(code: SothspellErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'SothspellError';
    this.code = code;
  }
}

export interface GenerationProgress {
  stage: string;
  chapterIndex?: number;
  detail?: string;
}

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

export interface DefaultRuntimeDependencies {
  analyzeProject: (root: string, options?: AnalyzeOptions) => Promise<ProjectSnapshot>;
  buildProjectBrief: (snapshot: ProjectSnapshot) => ProjectBrief;
  buildContextPack: (
    snapshot: ProjectSnapshot,
    brief: ProjectBrief,
    options: BuildContextOptions,
  ) => Promise<ContextPack>;
  authorTour: (
    snapshot: ProjectSnapshot,
    model: GuideModel,
    options: AuthorTourOptions,
  ) => Promise<AuthoringResult>;
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

export interface LaunchResult {
  url: string;
  opened: boolean;
  error?: string;
}

export const DEFAULT_PLAYER_URL = 'http://127.0.0.1:5173';
export const DEFAULT_MAX_MINUTES = 12;

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/u, '');
}

function defaultHome(): string {
  return process.env.SOTHSPELL_HOME ?? path.join(os.homedir(), '.sothspell');
}

/** Mirrors the analyzer's slug rules so the plugin finds the same tour store. */
function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/^@/u, '')
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, 63);
  return slug.length > 1 ? slug : 'project';
}

async function projectSlug(root: string): Promise<string> {
  try {
    const manifest = JSON.parse(
      await readFile(path.join(root, 'package.json'), 'utf8'),
    ) as { name?: unknown };
    if (typeof manifest.name === 'string' && manifest.name.length > 0) {
      return slugify(manifest.name);
    }
  } catch {
    // A project without a manifest still gets a stable directory name.
  }
  return slugify(path.basename(root));
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

function insideProject(projectRoot: string, target: string): boolean {
  const relative = path.relative(path.resolve(projectRoot), path.resolve(target));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

async function assertOutsideProject(projectRoot: string, target: string): Promise<void> {
  // Resolve both sides so a symlinked SOTHSPELL_HOME cannot point back into the
  // project. The final directory may not exist yet; resolve its parent instead.
  const root = await realpath(projectRoot).catch(() => path.resolve(projectRoot));
  const parent = await realpath(path.dirname(target)).catch(() =>
    path.resolve(path.dirname(target)),
  );
  const resolved = path.join(parent, path.basename(target));
  if (insideProject(root, resolved)) {
    throw new Error(
      `refusing to write ${resolved} inside the project root; sóþspell stores artifacts under SOTHSPELL_HOME`,
    );
  }
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

/**
 * Opens the player without making browser launch a failure condition. A headless
 * machine still gets the URL back so the caller can print it.
 */
export async function launchPlayer(
  url: string,
  options: {
    platform?: NodeJS.Platform;
    openUrl?: (url: string) => Promise<void>;
  } = {},
): Promise<LaunchResult> {
  if (options.openUrl) {
    try {
      await options.openUrl(url);
      return { url, opened: true };
    } catch (error) {
      return {
        url,
        opened: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  const platform = options.platform ?? process.platform;
  const [command, args] =
    platform === 'darwin'
      ? ['open', [url]]
      : platform === 'win32'
        ? ['cmd', ['/c', 'start', '', url]]
        : ['xdg-open', [url]];

  try {
    await new Promise<void>((resolve, reject) => {
      const child = spawn(command, args, { stdio: 'ignore', detached: true });
      child.once('error', reject);
      child.once('spawn', () => {
        child.unref();
        resolve();
      });
    });
    return { url, opened: true };
  } catch (error) {
    return {
      url,
      opened: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function generationFailure(error: unknown): SothspellError {
  return new SothspellError(
    'generation_failed',
    error instanceof Error ? error.message : String(error),
    { cause: error },
  );
}

export function completedBeatCount(value: unknown): number {
  if (!Array.isArray(value)) {
    return 0;
  }
  return new Set(value.filter((id): id is string => typeof id === 'string')).size;
}

function runSummary(run: unknown): SothspellRunSummary | null {
  if (run === null || typeof run !== 'object') {
    return null;
  }
  const candidate = run as {
    beatId?: unknown;
    completedBeatIds?: unknown;
  };
  if (typeof candidate.beatId !== 'string') {
    return null;
  }
  return {
    beatId: candidate.beatId,
    completed: completedBeatCount(candidate.completedBeatIds),
  };
}

/**
 * The default adapter over the analyzer, authoring pipeline, and local player.
 * It keeps state in the OpenCode process and writes tours only under
 * SOTHSPELL_HOME, never into the project it explains.
 */
export function createDefaultRuntime(
  context: OpenCodeRuntimeContext,
  options: DefaultRuntimeOptions = {},
): SothspellRuntime {
  const projectRoot = path.resolve(context.location.directory);
  const playerUrl = trimTrailingSlash(options.playerUrl ?? DEFAULT_PLAYER_URL);
  const home = path.resolve(options.home ?? defaultHome());
  const clientId =
    options.clientId ?? process.env.SOTHSPELL_CLIENT_ID ?? 'opencode-plugin';
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const dependencies = { ...defaultDependencies(), ...options.dependencies };

  let currentTourId: string | null = null;
  let slugPromise: Promise<string> | null = null;
  let controller: AbortController | null = null;
  let inFlight: Promise<SothspellGenerateResult> | null = null;

  const slug = (): Promise<string> =>
    (slugPromise ??= projectSlug(projectRoot).then((value) => value));

  const tourDirectory = async (tourId: string): Promise<string> =>
    path.join(home, 'projects', await slug(), 'tours', tourId);

  const tourPath = async (tourId: string): Promise<string> =>
    path.join(await tourDirectory(tourId), 'tour.json');

  const latestTourId = async (): Promise<string | null> => {
    const root = path.join(home, 'projects', await slug(), 'tours');
    const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
    const tours: Array<{ id: string; modified: number }> = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }
      const info = await stat(path.join(root, entry.name)).catch(() => null);
      if (info) {
        tours.push({ id: entry.name, modified: info.mtimeMs });
      }
    }
    tours.sort(
      (left, right) => right.modified - left.modified || right.id.localeCompare(left.id),
    );
    return tours[0]?.id ?? null;
  };

  const resolveTourId = async (): Promise<string | null> => {
    currentTourId ??= await latestTourId();
    return currentTourId;
  };

  const readTour = async (tourId: string): Promise<SothspellDocument | null> => {
    try {
      const raw = await readFile(await tourPath(tourId), 'utf8');
      return SothspellDocumentSchema.parse(JSON.parse(raw) as unknown);
    } catch {
      return null;
    }
  };

  const readRun = async (tourId: string): Promise<unknown | null> => {
    const url = `${playerUrl}/api/runs/${encodeURIComponent(tourId)}?clientId=${encodeURIComponent(clientId)}`;
    try {
      const response = await fetchImpl(url, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(1500),
      });
      if (!response.ok) {
        return null;
      }
      return (await response.json()) as unknown;
    } catch {
      return null;
    }
  };

  const firstBeatId = async (tourId: string): Promise<string | null> => {
    const document = await readTour(tourId);
    return document?.chapters[0]?.beats[0]?.id ?? null;
  };

  const runGeneration = async (
    input: { maxMinutes?: number },
    signal: AbortSignal,
  ): Promise<SothspellGenerateResult> => {
    const analysis = { cacheDirectory: path.join(home, 'cache', 'analysis') };
    const authoring = { cacheDirectory: path.join(home, 'cache', 'authoring') };

    options.onProgress?.({ stage: 'analyzing' });
    const snapshot = await dependencies.analyzeProject(projectRoot, analysis);
    signal.throwIfAborted();

    options.onProgress?.({ stage: 'packing' });
    const brief = dependencies.buildProjectBrief(snapshot);
    const contextPack = await dependencies.buildContextPack(snapshot, brief, {
      sourceRoot: projectRoot,
      maxCandidates: 60,
    });
    signal.throwIfAborted();

    const modelId = options.model ?? 'opencode/default';
    const model = dependencies.createModel(context, {
      id: modelId,
      model: modelRef(options.model),
      signal,
    });

    const result = await dependencies.authorTour(snapshot, model, {
      sourceRoot: projectRoot,
      contextPack,
      maxMinutes: input.maxMinutes ?? options.maxMinutes ?? DEFAULT_MAX_MINUTES,
      ...authoring,
      signal,
      onProgress: (progress) => {
        options.onProgress?.({
          stage: progress.stage,
          ...(progress.chapterIndex === undefined
            ? {}
            : { chapterIndex: progress.chapterIndex }),
          ...(progress.detail === undefined ? {} : { detail: progress.detail }),
        });
      },
    });

    signal.throwIfAborted();
    const destination = await tourDirectory(result.document.id);
    await assertOutsideProject(projectRoot, destination);
    await mkdir(destination, { recursive: true });
    await writeFile(
      path.join(destination, 'tour.json'),
      `${JSON.stringify(result.document, null, 2)}\n`,
      'utf8',
    );
    await writeFile(
      path.join(destination, 'quality.json'),
      `${JSON.stringify(result.quality, null, 2)}\n`,
      'utf8',
    );

    currentTourId = result.document.id;
    return {
      tourId: result.document.id,
      playerUrl,
      quality: result.quality,
    };
  };

  return {
    async status() {
      const tourId = await resolveTourId();
      const run = tourId ? runSummary(await readRun(tourId)) : null;
      return { projectRoot, tourId, playerUrl, run };
    },

    async generate(input) {
      if (inFlight) {
        throw new SothspellError(
          'generation_running',
          'a sóþspell generation is already running for this project',
        );
      }
      const active = new AbortController();
      controller = active;
      const promise = runGeneration(input, active.signal)
        .catch((error: unknown) => {
          if (active.signal.aborted) {
            throw new SothspellError('generation_failed', 'generation was cancelled', {
              cause: error,
            });
          }
          if (error instanceof SothspellError) {
            throw error;
          }
          throw generationFailure(error);
        })
        .finally(() => {
          if (controller === active) {
            controller = null;
          }
          inFlight = null;
        });
      inFlight = promise;
      return promise;
    },

    async open() {
      await launchPlayer(`${playerUrl}/`, {
        ...(options.platform === undefined ? {} : { platform: options.platform }),
        ...(options.openUrl === undefined ? {} : { openUrl: options.openUrl }),
      });
      return { playerUrl };
    },

    async progress() {
      const tourId = await resolveTourId();
      return { run: tourId ? await readRun(tourId) : null };
    },

    async ask(input) {
      const tourId = await resolveTourId();
      if (!tourId) {
        throw new SothspellError(
          'no_tour',
          'no sóþspell tour exists for this project; run /sothspell first',
        );
      }

      const run = await readRun(tourId);
      const runBeatId = runSummary(run)?.beatId;
      const beatId = input.beatId ?? runBeatId ?? (await firstBeatId(tourId));
      if (!beatId) {
        throw new SothspellError(
          'no_tour',
          'the sóþspell tour has no beats to ask about',
        );
      }

      const url = `${playerUrl}/api/tours/${encodeURIComponent(tourId)}/ask`;
      let response: Response;
      try {
        response = await fetchImpl(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json', accept: 'application/json' },
          body: JSON.stringify({ beatId, question: input.question }),
        });
      } catch (error) {
        throw new SothspellError(
          'ask_failed',
          `the local player is not reachable at ${playerUrl}; start it with /sothspell open`,
          { cause: error },
        );
      }

      const body = (await response.json().catch(() => null)) as {
        error?: unknown;
      } | null;
      if (!response.ok) {
        throw new SothspellError(
          'ask_failed',
          typeof body?.error === 'string'
            ? body.error
            : `the local player rejected the question (HTTP ${response.status})`,
        );
      }
      return { answer: body };
    },

    async cancel() {
      controller?.abort();
      controller = null;
    },
  };
}
