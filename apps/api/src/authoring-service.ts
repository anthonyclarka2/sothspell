import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import {
  analyzeProject,
  buildProjectBrief,
  type ProjectSnapshot,
} from '@sothspell/analyzer';
import {
  authorTour,
  buildContextPack,
  createAiSdkGuideModel,
  createFixtureGuideModel,
  saveTourArtifacts,
  type AuthoringProgress,
  type ContextPack,
  type GuideModel,
  type TourPlan,
} from '@sothspell/authoring';
import type { ImportService } from '@sothspell/import';
import type { AuthoringConnection } from '@sothspell/settings';

const execFileAsync = promisify(execFile);

/**
 * The authoring HTTP service. It owns the job lifecycle for "open a repository
 * and start authoring": validate the source, import a GitHub URL when needed,
 * analyze, author with the fixture or active profile model, and write the tour
 * where the existing tour resolver already serves it.
 */

export class AuthoringSourceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthoringSourceError';
  }
}

export class AuthoringUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthoringUnavailableError';
  }
}

export class AuthoringJobNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthoringJobNotFoundError';
  }
}

export type AuthoringModelChoice = 'fixture' | 'profile';

export type AuthoringSource =
  | { kind: 'local'; path: string }
  | { kind: 'import'; importId: string }
  | { kind: 'github'; url: string; ref?: string | null };

export interface AuthoringRequest {
  source: AuthoringSource;
  model: AuthoringModelChoice;
  audience?: TourPlan['audience'];
  maxMinutes?: number;
}

export interface ProjectInspection {
  path: string;
  name: string;
  slug: string;
  revision: ProjectSnapshot['revision'];
  languages: Array<{ id: string; files: number; bytes: number; primary: boolean }>;
  fileCount: number;
  docCount: number;
  symbolCount: number;
}

export type AuthoringStepStatus = 'pending' | 'active' | 'done' | 'failed';

export interface AuthoringStep {
  id: 'import' | 'analyze' | 'plan' | 'chapters' | 'validate' | 'save';
  status: AuthoringStepStatus;
  detail?: string;
}

export interface AuthoringJobResult {
  tourId: string;
  title: string;
  firstBeatId: string;
  playerPath: string;
  /** Absolute path of the written tour.json under SOTHSPELL_HOME. */
  tourPath: string;
  chapters: number;
  beats: number;
  anchors: number;
  estimatedDurationMs: number;
  droppedChapters: number;
  modelId: string;
  profileName: string | null;
}

export interface AuthoringJob {
  id: string;
  status: 'queued' | 'running' | 'done' | 'failed' | 'cancelled';
  source: { kind: AuthoringSource['kind']; label: string };
  steps: AuthoringStep[];
  detail: string | null;
  result: AuthoringJobResult | null;
  error: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface AuthoringService {
  start(request: AuthoringRequest): Promise<AuthoringJob>;
  get(jobId: string): AuthoringJob | null;
  cancel(jobId: string): boolean;
  inspectLocalProject(root: string): Promise<ProjectInspection>;
}

export interface CreateAuthoringServiceOptions {
  /** SOTHSPELL_HOME; tours and caches live under it. */
  home: string;
  importService: Pick<ImportService, 'import' | 'get'>;
  /** Active authoring connection resolver; profile choice fails 503 without one. */
  resolveAuthoringConnection: () => Promise<AuthoringConnection | null>;
  /** Model factory seam; tests inject a deterministic fake. */
  createModel?: (
    choice: AuthoringModelChoice,
    context: ContextPack,
    connection: AuthoringConnection | null,
  ) => GuideModel;
  analysisCacheDirectory?: string;
  authoringCacheDirectory?: string;
  now?: () => number;
}

const MAX_JOBS = 50;
const MAX_PATH_LENGTH = 1024;
const GIT_TIMEOUT_MS = 5000;

const STEP_ORDER: Record<AuthoringSource['kind'], AuthoringStep['id'][]> = {
  github: ['import', 'analyze', 'plan', 'chapters', 'validate', 'save'],
  import: ['analyze', 'plan', 'chapters', 'validate', 'save'],
  local: ['analyze', 'plan', 'chapters', 'validate', 'save'],
};

function stepList(kind: AuthoringSource['kind']): AuthoringStep[] {
  return STEP_ORDER[kind].map((id) => ({ id, status: 'pending' }));
}

async function isGitRepository(root: string): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync(
      'git',
      ['-C', root, 'rev-parse', '--is-inside-work-tree'],
      { timeout: GIT_TIMEOUT_MS },
    );
    return stdout.trim() === 'true';
  } catch {
    return false;
  }
}

function normalizeLocalPath(input: string): string {
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    throw new AuthoringSourceError('enter a path to a local git repository');
  }
  if (trimmed.length > MAX_PATH_LENGTH) {
    throw new AuthoringSourceError('the path is too long');
  }
  if (trimmed.includes('\0')) {
    throw new AuthoringSourceError('the path contains an invalid character');
  }
  return path.resolve(trimmed);
}

function describeSource(source: AuthoringSource): string {
  switch (source.kind) {
    case 'local':
      return source.path;
    case 'import':
      return `import ${source.importId}`;
    case 'github':
      return source.ref ? `${source.url} @ ${source.ref}` : source.url;
  }
}

function firstBeatPath(tourId: string, firstBeatId: string): string {
  return `/t/${encodeURIComponent(tourId)}/${encodeURIComponent(firstBeatId)}`;
}

/**
 * A job is a small state machine the UI polls. The work itself is the existing
 * analyzer + authoring pipeline; the job only records where it is.
 */
export function createAuthoringService(
  options: CreateAuthoringServiceOptions,
): AuthoringService {
  const now = options.now ?? (() => Date.now());
  const jobs = new Map<string, AuthoringJob>();
  const controllers = new Map<string, AbortController>();

  const touch = (job: AuthoringJob): void => {
    job.updatedAt = now();
  };

  const setStep = (
    job: AuthoringJob,
    id: AuthoringStep['id'],
    status: AuthoringStepStatus,
    detail?: string,
  ): void => {
    const step = job.steps.find((candidate) => candidate.id === id);
    if (!step) {
      return;
    }
    step.status = status;
    if (detail !== undefined) {
      step.detail = detail;
    }
    touch(job);
  };

  const pruneJobs = (): void => {
    if (jobs.size <= MAX_JOBS) {
      return;
    }
    const finished = [...jobs.values()]
      .filter((job) => job.status !== 'running' && job.status !== 'queued')
      .toSorted((left, right) => left.updatedAt - right.updatedAt);
    for (const job of finished) {
      if (jobs.size <= MAX_JOBS) {
        break;
      }
      jobs.delete(job.id);
    }
  };

  const resolveModel = (
    choice: AuthoringModelChoice,
    context: ContextPack,
    connection: AuthoringConnection | null,
  ): GuideModel => {
    if (options.createModel) {
      return options.createModel(choice, context, connection);
    }
    if (choice === 'fixture') {
      return createFixtureGuideModel(context);
    }
    if (!connection) {
      throw new AuthoringUnavailableError(
        'no authoring profile is active; add one in Settings or use the fixture model',
      );
    }
    if (connection.modelId === 'fixture' || connection.modelId === 'fake') {
      return createFixtureGuideModel(context);
    }
    return createAiSdkGuideModel(connection.modelId, {
      ...(connection.apiKey === null ? {} : { apiKey: connection.apiKey }),
      ...(connection.baseUrl === null ? {} : { baseUrl: connection.baseUrl }),
    });
  };

  const resolveSourceRoot = async (
    job: AuthoringJob,
    source: AuthoringSource,
  ): Promise<{ root: string; snapshot: ProjectSnapshot }> => {
    let root: string;
    if (source.kind === 'local') {
      root = normalizeLocalPath(source.path);
      const info = await stat(root).catch(() => null);
      if (!info?.isDirectory()) {
        throw new AuthoringSourceError(`the path is not a directory: ${root}`);
      }
      if (!(await isGitRepository(root))) {
        throw new AuthoringSourceError(`the path is not a git repository: ${root}`);
      }
    } else if (source.kind === 'import') {
      const record = await options.importService.get(source.importId);
      if (!record) {
        throw new AuthoringSourceError(`unknown import: ${source.importId}`);
      }
      root = record.directory;
    } else {
      setStep(job, 'import', 'active', 'cloning the public repository');
      const result = await options.importService.import({
        url: source.url,
        ...(source.ref === undefined || source.ref === null ? {} : { ref: source.ref }),
      });
      root = result.record.directory;
      setStep(
        job,
        'import',
        'done',
        `${result.record.owner}/${result.record.repo} @ ${result.record.shortCommit}`,
      );
    }

    setStep(job, 'analyze', 'active', 'reading the project read-only');
    const analysisOptions =
      options.analysisCacheDirectory === undefined
        ? {}
        : { cacheDirectory: options.analysisCacheDirectory };
    const snapshot = await analyzeProject(root, analysisOptions);
    setStep(
      job,
      'analyze',
      'done',
      `${snapshot.files.length} files · ${snapshot.symbols.length} symbols`,
    );
    return { root, snapshot };
  };

  const onAuthoringProgress = (job: AuthoringJob, progress: AuthoringProgress): void => {
    switch (progress.stage) {
      case 'plan':
        setStep(job, 'plan', 'active', 'planning the curriculum');
        break;
      case 'chapter': {
        setStep(job, 'plan', 'done');
        const chapter =
          progress.chapterIndex === undefined ? '' : ` ${progress.chapterIndex + 1}`;
        setStep(job, 'chapters', 'active', `writing chapter${chapter}`);
        break;
      }
      case 'repair':
        setStep(job, 'chapters', 'done');
        setStep(job, 'validate', 'active', progress.detail ?? 'repairing a chapter');
        break;
      case 'assembled':
        setStep(job, 'chapters', 'done');
        setStep(job, 'validate', 'done');
        setStep(job, 'save', 'active', 'assembling the tour document');
        break;
      case 'done':
        break;
    }
  };

  const run = async (job: AuthoringJob, request: AuthoringRequest): Promise<void> => {
    const controller = new AbortController();
    controllers.set(job.id, controller);
    job.status = 'running';
    touch(job);

    try {
      const connection =
        request.model === 'profile' ? await options.resolveAuthoringConnection() : null;
      const { root, snapshot } = await resolveSourceRoot(job, request.source);

      const brief = buildProjectBrief(snapshot);
      const context = await buildContextPack(snapshot, brief, {
        sourceRoot: root,
        maxCandidates: 60,
      });

      setStep(job, 'plan', 'active', 'planning the curriculum');
      const model = resolveModel(request.model, context, connection);
      const result = await authorTour(snapshot, model, {
        sourceRoot: root,
        contextPack: context,
        ...(request.audience === undefined ? {} : { audience: request.audience }),
        ...(request.maxMinutes === undefined ? {} : { maxMinutes: request.maxMinutes }),
        ...(options.authoringCacheDirectory === undefined
          ? {}
          : { cacheDirectory: options.authoringCacheDirectory }),
        ...(connection?.profileName == null
          ? {}
          : { profileName: connection.profileName }),
        signal: controller.signal,
        onProgress: (progress) => onAuthoringProgress(job, progress),
      });

      setStep(job, 'save', 'active', 'writing the tour under SOTHSPELL_HOME');
      const firstBeatId = result.document.chapters[0]?.beats[0]?.id;
      if (!firstBeatId) {
        throw new Error('the authored tour has no beats');
      }
      const saved = await saveTourArtifacts({
        home: options.home,
        document: result.document,
        quality: result.quality,
        snapshot,
        sourceRoot: root,
        sourceKind: request.source.kind === 'local' ? 'local' : 'imported',
      });
      setStep(job, 'save', 'done');

      job.result = {
        tourId: result.document.id,
        title: result.document.title,
        firstBeatId,
        playerPath: firstBeatPath(result.document.id, firstBeatId),
        tourPath: saved.tourPath,
        chapters: result.quality.chapters,
        beats: result.quality.beats,
        anchors: result.quality.anchors,
        estimatedDurationMs: result.quality.estimatedDurationMs,
        droppedChapters: result.quality.droppedChapters,
        modelId: result.quality.modelId,
        profileName: result.quality.profileName ?? null,
      };
      job.status = 'done';
      job.detail = 'the tour is ready';
    } catch (error) {
      const aborted = controller.signal.aborted;
      job.status = aborted ? 'cancelled' : 'failed';
      job.error = aborted
        ? 'authoring was cancelled'
        : error instanceof Error
          ? error.message
          : String(error);
      for (const step of job.steps) {
        if (step.status === 'active') {
          step.status = aborted ? 'pending' : 'failed';
        }
      }
    } finally {
      controllers.delete(job.id);
      touch(job);
      pruneJobs();
    }
  };

  return {
    async start(request) {
      const job: AuthoringJob = {
        id: `job_${randomUUID()}`,
        status: 'queued',
        source: { kind: request.source.kind, label: describeSource(request.source) },
        steps: stepList(request.source.kind),
        detail: 'queued',
        result: null,
        error: null,
        createdAt: now(),
        updatedAt: now(),
      };
      jobs.set(job.id, job);
      pruneJobs();
      void run(job, request);
      return job;
    },

    get(jobId) {
      return jobs.get(jobId) ?? null;
    },

    cancel(jobId) {
      const controller = controllers.get(jobId);
      if (!controller) {
        return false;
      }
      controller.abort();
      return true;
    },

    async inspectLocalProject(rootInput) {
      const root = normalizeLocalPath(rootInput);
      const info = await stat(root).catch(() => null);
      if (!info?.isDirectory()) {
        throw new AuthoringSourceError(`the path is not a directory: ${root}`);
      }
      if (!(await isGitRepository(root))) {
        throw new AuthoringSourceError(`the path is not a git repository: ${root}`);
      }
      const analysisOptions =
        options.analysisCacheDirectory === undefined
          ? {}
          : { cacheDirectory: options.analysisCacheDirectory };
      const snapshot = await analyzeProject(root, analysisOptions);
      return {
        path: root,
        name: snapshot.project.name,
        slug: snapshot.project.slug,
        revision: snapshot.revision,
        languages: snapshot.languages.map((language) => ({
          id: language.id,
          files: language.files,
          bytes: language.bytes,
          primary: language.primary,
        })),
        fileCount: snapshot.files.length,
        docCount: snapshot.docs.length,
        symbolCount: snapshot.symbols.length,
      };
    },
  };
}
