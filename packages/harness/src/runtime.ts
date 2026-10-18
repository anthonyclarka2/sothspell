import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, realpath, stat, writeFile } from 'node:fs/promises';
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
} from '@sothspell/authoring';
import {
  SothspellDocumentSchema,
  assertSafeTourId,
  type SothspellDocument,
} from '@sothspell/core';
import { launchPlayer } from './launch.js';
import {
  SothspellError,
  type GenerationProgress,
  type HarnessAdapter,
  type HarnessEvent,
  type HarnessGenerateResult,
  type HarnessRunSummary,
  type HarnessRuntime,
  type HarnessStatus,
  type LaunchResult,
} from './types.js';

/**
 * The shared harness runtime. It owns everything a host needs after it has
 * translated its own APIs into `HarnessAdapter`: read-only analysis, authoring,
 * writes under `SOTHSPELL_HOME`, player run reads, browser launch, and ask.
 * Hosts never reimplement this behavior; they call the runtime and translate
 * the result back into their command, tool, or hook surface.
 */

export interface HarnessRuntimeDependencies {
  analyzeProject: (root: string, options?: AnalyzeOptions) => Promise<ProjectSnapshot>;
  buildProjectBrief: (snapshot: ProjectSnapshot) => ProjectBrief;
  buildContextPack: (
    snapshot: ProjectSnapshot,
    brief: ProjectBrief,
    options: BuildContextOptions,
  ) => Promise<ContextPack>;
  authorTour: (
    snapshot: ProjectSnapshot,
    model: ReturnType<HarnessAdapter['createModel']>,
    options: AuthorTourOptions,
  ) => Promise<AuthoringResult>;
}

export interface HarnessRuntimeOptions {
  /** Browser player and local API base URL. */
  playerUrl?: string;
  maxMinutes?: number;
  /** `provider/model` or a host-native id, passed to the adapter untouched. */
  model?: string;
  home?: string;
  clientId?: string;
  fetch?: typeof fetch;
  /** Extra argv the adapter's launcher needs (platform, opener override). */
  launch?: (url: string) => Promise<LaunchResult>;
  /** Printed in failure messages so a closed player port has an exact fix. */
  startHint?: string;
  onProgress?: (progress: GenerationProgress) => void;
  /** Mirror run.updated events to the host sink. Defaults to true. */
  emitRunUpdates?: boolean;
  dependencies?: Partial<HarnessRuntimeDependencies>;
}

export const DEFAULT_SERVE_URL = 'http://127.0.0.1:4319';
export const DEFAULT_MAX_MINUTES = 12;
export const DEFAULT_START_HINT = 'start it with `pnpm sothspell serve`';

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/u, '');
}

function defaultHome(): string {
  return process.env.SOTHSPELL_HOME ?? path.join(os.homedir(), '.sothspell');
}

/** Mirrors the analyzer's slug rules so the runtime finds the same tour store. */
export function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/^@/u, '')
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, 63);
  return slug.length > 1 ? slug : 'project';
}

export async function projectSlug(root: string): Promise<string> {
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

/**
 * A stable per-install client id. The browser and harnesses can share a run by
 * setting `SOTHSPELL_CLIENT_ID`; otherwise the id is derived from the data
 * directory path, so it survives restarts and never writes to disk.
 */
export function perInstallClientId(home: string): string {
  const digest = createHash('sha256').update(path.resolve(home)).digest('hex');
  return `sothspell-${digest.slice(0, 32)}`;
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

function defaultDependencies(): HarnessRuntimeDependencies {
  return { analyzeProject, buildProjectBrief, buildContextPack, authorTour };
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

export function runSummary(run: unknown): HarnessRunSummary | null {
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

export function createHarnessRuntime(
  adapter: HarnessAdapter,
  options: HarnessRuntimeOptions = {},
): HarnessRuntime {
  const playerUrl = trimTrailingSlash(
    options.playerUrl ?? process.env.SOTHSPELL_PLAYER_URL ?? DEFAULT_SERVE_URL,
  );
  const home = path.resolve(options.home ?? defaultHome());
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const dependencies = { ...defaultDependencies(), ...options.dependencies };
  const startHint = options.startHint ?? DEFAULT_START_HINT;
  const emitRunUpdates = options.emitRunUpdates ?? true;

  const listeners = new Set<(event: HarnessEvent) => void>();
  const emit = (event: HarnessEvent): void => {
    for (const listener of Array.from(listeners)) {
      try {
        listener(event);
      } catch {
        // Event listeners are best-effort; one bad listener must not break work.
      }
    }
    try {
      adapter.emit?.(event);
    } catch {
      // A host event sink is also best-effort.
    }
  };

  const emitProgress = (progress: GenerationProgress): void => {
    options.onProgress?.(progress);
    emit({ name: 'generation.progress', progress });
  };

  let currentTourId: string | null = null;
  let slugPromise: Promise<string> | null = null;
  let clientIdPromise: Promise<string> | null = null;
  let controller: AbortController | null = null;
  let inFlight: Promise<HarnessGenerateResult> | null = null;

  const projectRoot = (): Promise<string> =>
    Promise.resolve(adapter.projectRoot()).then((root) => path.resolve(root));

  const slug = (): Promise<string> =>
    (slugPromise ??= projectRoot().then((root) => projectSlug(root)));

  const clientId = (): Promise<string> =>
    (clientIdPromise ??= Promise.resolve(
      options.clientId ?? process.env.SOTHSPELL_CLIENT_ID ?? perInstallClientId(home),
    ));

  const tourDirectory = async (tourId: string): Promise<string> =>
    path.join(home, 'projects', await slug(), 'tours', assertSafeTourId(tourId));

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
    const url = `${playerUrl}/api/runs/${encodeURIComponent(tourId)}?clientId=${encodeURIComponent(await clientId())}`;
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
  ): Promise<HarnessGenerateResult> => {
    const root = await projectRoot();
    const analysis = { cacheDirectory: path.join(home, 'cache', 'analysis') };
    const authoring = { cacheDirectory: path.join(home, 'cache', 'authoring') };

    emitProgress({ stage: 'analyzing' });
    const snapshot = await dependencies.analyzeProject(root, analysis);
    signal.throwIfAborted();

    emitProgress({ stage: 'packing' });
    const brief = dependencies.buildProjectBrief(snapshot);
    const contextPack = await dependencies.buildContextPack(snapshot, brief, {
      sourceRoot: root,
      maxCandidates: 60,
    });
    signal.throwIfAborted();

    const modelId = options.model ?? `${adapter.id}/default`;
    const model = adapter.createModel({
      id: modelId,
      ...(options.model === undefined ? {} : { model: options.model }),
      signal,
    });

    const result = await dependencies.authorTour(snapshot, model, {
      sourceRoot: root,
      contextPack,
      maxMinutes: input.maxMinutes ?? options.maxMinutes ?? DEFAULT_MAX_MINUTES,
      ...authoring,
      signal,
      onProgress: (progress) => {
        emitProgress({
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
    await assertOutsideProject(root, destination);
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
      playerUrl: `${playerUrl}/t/${encodeURIComponent(result.document.id)}`,
      quality: result.quality,
    };
  };

  const launch = async (url: string): Promise<LaunchResult> => {
    if (options.launch) {
      return options.launch(url);
    }
    if (adapter.launch) {
      return adapter.launch(url);
    }
    return launchPlayer(url);
  };

  return {
    capabilities: adapter.capabilities,
    events: {
      on(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    },

    async status(): Promise<HarnessStatus> {
      const root = await projectRoot();
      const tourId = await resolveTourId();
      const run = tourId ? runSummary(await readRun(tourId)) : null;
      return { projectRoot: root, tourId, playerUrl, run };
    },

    async generate(input) {
      if (inFlight) {
        throw new SothspellError(
          'generation_running',
          'a sóþspell generation is already running for this project',
        );
      }
      if (adapter.capabilities.textGeneration !== true) {
        throw new SothspellError(
          'unsupported_capability',
          `the ${adapter.id} harness cannot generate text; configure a model or use another host`,
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
      const tourId = await resolveTourId();
      const url = tourId ? `${playerUrl}/t/${encodeURIComponent(tourId)}` : playerUrl;
      const result = await launch(url);
      if (!result.opened && adapter.notify) {
        const reason = result.error ? ` (${result.error})` : '';
        await adapter
          .notify(`could not open the browser${reason}; ${startHint}`)
          .catch(() => undefined);
      }
      return { playerUrl: url };
    },

    async progress() {
      const tourId = await resolveTourId();
      const run = tourId ? await readRun(tourId) : null;
      if (emitRunUpdates) {
        const summary = runSummary(run);
        emit({
          name: 'run.updated',
          tourId,
          beatId: summary?.beatId ?? null,
          completed: summary?.completed ?? 0,
        });
      }
      return { run };
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
          `the local player is not reachable at ${playerUrl}; ${startHint}`,
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

    async dispose() {
      controller?.abort();
      controller = null;
      listeners.clear();
    },
  };
}
