import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Hono } from 'hono';
import { z } from 'zod';
import type { NarrationAssetStore } from '@sothspell/narration';
import {
  createSettingsService,
  type ProfileTester,
  type SettingsService,
} from '@sothspell/settings';
import {
  createFileTourSource,
  createReviewService,
  createReviewStore,
  type ReviewService,
} from '@sothspell/review';
import {
  LocaleSchema,
  compileSothspell,
  highlightCodeLines,
  isSafeTourId,
  languageForPath,
  parseSothspell,
  readSourceFile,
  readSourceRange,
  sourceLocaleOf,
  withTranslation,
  type CompiledAnchor,
  type CompiledTour,
} from '@sothspell/core';
import { createDeferredNarrationAssetStore, registerAudioRoutes } from './audio.js';
import { registerImportRoutes } from './imports.js';
import {
  createAuthRuntime,
  registerAuthRoutes,
  resolveAuth,
  ensureTrustedOrigin,
} from './auth.js';
import { registerAccountRoutes } from './accounts.js';
import {
  NarrationBodySchema,
  NarrationUnavailableError,
  createNarrationService,
  type NarrationService,
} from './narration.js';
import { createRunStore, RunBodySchema, type RunRecord } from './runs.js';
import { AskUnavailableError, createAskService, type AskService } from './ask-service.js';
import { createDrilldownService, type DrilldownService } from './drilldown-service.js';
import { registerSettingsRoutes } from './settings.js';
import { registerReviewRoutes } from './reviews.js';
import { createConnectionGuideModel, createProfileTester } from './settings-tester.js';
import { createImportService, type ImportService } from '@sothspell/import';
import {
  createSyncService,
  type AccountStore,
  type SyncService,
} from '@sothspell/accounts';
import { createSqliteAccountStore } from '@sothspell/accounts/sqlite';
import {
  createFileTranslationStore,
  createTranslationService,
  registerTranslationRoutes,
  type TranslationService,
  type TranslationStore,
} from './translations.js';
import { createAuthoringService, type AuthoringService } from './authoring-service.js';
import { registerAuthoringRoutes } from './authoring.js';
import { createApiSecurityMiddleware } from './security.js';

const AskBodySchema = z.object({
  beatId: z.string().min(1).max(128),
  question: z.string().min(3).max(2000),
  history: z
    .array(
      z.object({
        question: z.string().min(1).max(2000),
        answer: z.string().min(1).max(8000),
      }),
    )
    .max(6)
    .optional(),
});

export interface AppOptions {
  /** Override for tests; defaults to the checked-in golden tour. */
  tourJsonPath?: string;
  /** Read-only project root for full-file code pages. */
  projectRoot?: string | null;
  /** SQLite path; `:memory:` is used by tests. */
  databasePath?: string;
  /** Narration cache root; defaults to `$SOTHSPELL_HOME/audio`. */
  narrationAssetRoot?: string;
  /** Asset store override for tests; avoids the file-backed store. */
  narrationAssetStore?: NarrationAssetStore;
  elevenLabsApiKey?: string;
  elevenLabsVoiceId?: string;
  elevenLabsModelId?: string;
  fetchImpl?: typeof fetch;
  /** Full service override for tests. */
  narrationService?: NarrationService;
  /** In-tour question service; tests inject a fake. */
  askService?: AskService | null;
  /** Drilldown service; tests inject a fake. */
  drilldownService?: DrilldownService | null;
  /** Connection-profile store; tests inject a store over a temp home. */
  settingsService?: SettingsService;
  /** Provider-test seam; tests inject a fake, `null` disables the test route. */
  profileTester?: ProfileTester | null;
  /** Import service; tests inject a fake instead of git and disk. */
  importService?: ImportService;
  /** Account store override for tests; defaults to SQLite beside the runs. */
  accountStore?: AccountStore;
  /** Sync service override for tests. */
  syncService?: SyncService;
  /** Signing secret for session cookies; falls back to SOTHSPELL_SESSION_SECRET. */
  sessionSecret?: string | null;
  /** GitHub OAuth app credentials; fall back to GITHUB_CLIENT_ID/GITHUB_CLIENT_SECRET. */
  githubClientId?: string | null;
  githubClientSecret?: string | null;
  githubBaseUrl?: string;
  githubApiBaseUrl?: string;
  /** Public base URL for redirects and origin checks; SOTHSPELL_PUBLIC_URL. */
  publicUrl?: string | null;
  allowedOrigins?: string[];
  /** Fake provider seam for OAuth tests; narration keeps its own fetchImpl. */
  oauthFetchImpl?: typeof fetch;
  /** Injectable clock for session and tombstone tests. */
  now?: () => number;
  /** Review service; tests inject one over a temp store and a fake model. */
  reviewService?: ReviewService;
  /** Translation store; defaults to a file store under SOTHSPELL_HOME. */
  translationStore?: TranslationStore;
  /** Translation service; tests inject a fake, `null` disables the POST route. */
  translationService?: TranslationService | null;
  /** Authoring service; tests inject a fake job runner. */
  authoringService?: AuthoringService;
}

const DEFAULT_TOUR_PATH = new URL(
  '../../../examples/bunbun-tour/tour.json',
  import.meta.url,
);

export const GOLDEN_TOUR_ID = 'tour_bunbun_golden';
const GOLDEN_TOUR_ALIASES = new Set([GOLDEN_TOUR_ID, 'bunbun-golden']);
const GOLDEN_PROJECT_ID = 'bunbun';

const compiledCache = new Map<string, Promise<CompiledTour>>();

function sothspellHome(): string {
  return process.env.SOTHSPELL_HOME ?? path.join(os.homedir(), '.sothspell');
}

function defaultDatabasePath(): string {
  return path.join(sothspellHome(), 'sothspell.db');
}

/** Generated narration audio lives beside the run database, not in projects. */
export function defaultNarrationAssetRoot(): string {
  return path.join(sothspellHome(), 'audio');
}

async function resolveTourJsonPath(
  tourJsonPath: string,
  tourId: string,
): Promise<string | null> {
  if (GOLDEN_TOUR_ALIASES.has(tourId)) {
    return tourJsonPath;
  }
  if (!isSafeTourId(tourId)) {
    return null;
  }
  const root = path.join(sothspellHome(), 'projects');
  const projects = await readdir(root, { withFileTypes: true }).catch(() => []);
  for (const project of projects) {
    if (!project.isDirectory()) {
      continue;
    }
    const candidate = path.join(root, project.name, 'tours', tourId, 'tour.json');
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

function loadCompiledTour(
  store: TranslationStore,
  tourJsonPath: string,
  tourId: string,
  locale?: string,
): Promise<CompiledTour> {
  if (locale === undefined) {
    const cached = compiledCache.get(tourJsonPath);
    if (cached) {
      return cached;
    }

    const compiled = readFile(tourJsonPath, 'utf8').then((raw) =>
      compileSothspell(JSON.parse(raw) as unknown),
    );
    compiledCache.set(tourJsonPath, compiled);
    return compiled;
  }

  // A translated compile is never cached: a translation can be stored at any
  // moment, and recompiling one tour is cheaper than invalidating every key.
  return readFile(tourJsonPath, 'utf8').then(async (raw) => {
    const document = parseSothspell(JSON.parse(raw) as unknown);
    if (locale === sourceLocaleOf(document)) {
      return compileSothspell(document);
    }
    const translation = await store.read(tourId, locale);
    if (!translation) {
      return compileSothspell(document);
    }
    return compileSothspell(withTranslation(document, translation), { locale });
  });
}

interface AnchorLocation {
  anchor: CompiledAnchor;
  beatId: string;
  beatTitle: string;
  chapterId: string;
  chapterTitle: string;
}

function findAnchor(tour: CompiledTour, anchorId: string): AnchorLocation | null {
  for (const chapter of tour.chapters) {
    for (const beat of chapter.beats) {
      const anchor = beat.anchors.find((candidate) => candidate.id === anchorId);
      if (anchor) {
        return {
          anchor,
          beatId: beat.id,
          beatTitle: beat.title,
          chapterId: chapter.id,
          chapterTitle: chapter.title,
        };
      }
    }
  }
  return null;
}

function outlineFor(tour: CompiledTour, filePath: string) {
  const outline: Array<{
    anchorId: string;
    label: string;
    startLine: number;
    endLine: number;
    beatId: string;
    beatTitle: string;
  }> = [];
  for (const chapter of tour.chapters) {
    for (const beat of chapter.beats) {
      for (const anchor of beat.anchors) {
        if (anchor.path === filePath) {
          outline.push({
            anchorId: anchor.id,
            label: anchor.label ?? anchor.symbol ?? anchor.path,
            startLine: anchor.startLine,
            endLine: anchor.endLine,
            beatId: beat.id,
            beatTitle: beat.title,
          });
        }
      }
    }
  }
  return outline;
}

async function sourcePayload(input: {
  projectRoot: string | null;
  location: AnchorLocation;
  tour: CompiledTour;
  projectId: string;
}) {
  const { anchor } = input.location;
  const language = anchor.language || languageForPath(anchor.path);
  const outline = outlineFor(input.tour, anchor.path);

  if (input.projectRoot && existsSync(path.join(input.projectRoot, anchor.path))) {
    try {
      const file = await readSourceFile(input.projectRoot, anchor.path);
      const range = await readSourceRange(
        input.projectRoot,
        anchor.path,
        anchor.startLine,
        anchor.endLine,
      );
      const stale = range.contentHash !== anchor.contentHash;
      const highlighted = await highlightCodeLines(file.text, language, {
        startLine: anchor.startLine,
        endLine: anchor.endLine,
      });
      return {
        projectId: input.projectId,
        tourId: input.tour.id,
        anchorId: anchor.id,
        path: anchor.path,
        symbol: anchor.symbol ?? null,
        label: anchor.label ?? null,
        startLine: anchor.startLine,
        endLine: anchor.endLine,
        language,
        contentHash: anchor.contentHash,
        liveContentHash: range.contentHash,
        stale,
        totalLines: file.lineCount,
        excerpt: anchor.excerpt,
        html: highlighted.html,
        lines: highlighted.lines,
        beatId: input.location.beatId,
        beatTitle: input.location.beatTitle,
        chapterId: input.location.chapterId,
        chapterTitle: input.location.chapterTitle,
        outline,
      };
    } catch {
      // Fall through to the embedded excerpt when the live file is unreadable.
    }
  }

  const lineCount = anchor.excerpt.length === 0 ? 0 : anchor.excerpt.split('\n').length;
  const highlighted = await highlightCodeLines(anchor.excerpt, language, {
    startLine: 1,
    endLine: lineCount,
  });

  return {
    projectId: input.projectId,
    tourId: input.tour.id,
    anchorId: anchor.id,
    path: anchor.path,
    symbol: anchor.symbol ?? null,
    label: anchor.label ?? null,
    startLine: anchor.startLine,
    endLine: anchor.endLine,
    language,
    contentHash: anchor.contentHash,
    liveContentHash: anchor.contentHash,
    stale: false,
    totalLines: lineCount,
    excerpt: anchor.excerpt,
    html: highlighted.html,
    lines: highlighted.lines,
    beatId: input.location.beatId,
    beatTitle: input.location.beatTitle,
    chapterId: input.location.chapterId,
    chapterTitle: input.location.chapterTitle,
    outline,
  };
}

/**
 * The HTTP boundary for the local player. It returns compiled tours and code
 * anchors; full files are read only from the configured project root, progress
 * is stored in a local anonymous run table, and cloud narration is generated on
 * request and cached under SOTHSPELL_HOME.
 */
export function createApp(options: AppOptions = {}): Hono {
  const tourJsonPath = options.tourJsonPath ?? DEFAULT_TOUR_PATH.pathname;
  const projectRoot = options.projectRoot ?? process.env.SOTHSPELL_PROJECT_ROOT ?? null;
  const runStore = createRunStore(options.databasePath ?? defaultDatabasePath());
  const accountStore =
    options.accountStore ??
    createSqliteAccountStore(options.databasePath ?? defaultDatabasePath());
  const auth = createAuthRuntime({
    accountStore,
    sessionSecret: options.sessionSecret,
    clientId: options.githubClientId,
    clientSecret: options.githubClientSecret,
    publicUrl: options.publicUrl,
    allowedOrigins: options.allowedOrigins,
    githubBaseUrl: options.githubBaseUrl,
    apiBaseUrl: options.githubApiBaseUrl,
    fetchImpl: options.oauthFetchImpl,
    now: options.now,
  });
  const syncService =
    options.syncService ??
    createSyncService({ accountStore, runStore, now: options.now });
  const assetStore =
    options.narrationAssetStore ??
    createDeferredNarrationAssetStore(
      options.narrationAssetRoot ?? defaultNarrationAssetRoot(),
    );
  const settingsService =
    options.settingsService ?? createSettingsService({ homeDirectory: sothspellHome() });
  const narrationService =
    options.narrationService ??
    createNarrationService({
      assetStore,
      apiKey: options.elevenLabsApiKey ?? process.env.ELEVENLABS_API_KEY,
      voiceId: options.elevenLabsVoiceId ?? process.env.ELEVENLABS_VOICE_ID,
      modelId: options.elevenLabsModelId ?? process.env.ELEVENLABS_MODEL_ID,
      fetchImpl: options.fetchImpl,
      resolveConnection: () => settingsService.resolveNarrationConnection(),
    });
  const profileTester =
    options.profileTester === undefined
      ? createProfileTester({ narrationService })
      : options.profileTester;
  // The active authoring profile supplies the model for ask and drilldown;
  // when it is absent the services keep the SOTHSPELL_MODEL fallback.
  const resolveAuthoringModel = async () => {
    const connection = await settingsService.resolveAuthoringConnection();
    if (
      !connection ||
      connection.modelId === 'fixture' ||
      connection.modelId === 'fake'
    ) {
      return null;
    }
    return createConnectionGuideModel(connection);
  };
  const askService =
    options.askService === undefined
      ? createAskService({
          resolveTourPath: (tourId) => resolveTourJsonPath(tourJsonPath, tourId),
          sourceRoot: projectRoot,
          modelId: process.env.SOTHSPELL_MODEL ?? null,
          resolveModel: resolveAuthoringModel,
        })
      : options.askService;
  const drilldownService =
    options.drilldownService === undefined
      ? createDrilldownService({
          resolveTourPath: (tourId) => resolveTourJsonPath(tourJsonPath, tourId),
          sourceRoot: projectRoot ?? process.cwd(),
          modelId: process.env.SOTHSPELL_MODEL ?? null,
          resolveModel: resolveAuthoringModel,
        })
      : options.drilldownService;
  const importService =
    options.importService ?? createImportService({ home: sothspellHome() });
  const authoringService =
    options.authoringService ??
    createAuthoringService({
      home: sothspellHome(),
      importService,
      resolveAuthoringConnection: () => settingsService.resolveAuthoringConnection(),
      analysisCacheDirectory: path.join(sothspellHome(), 'cache', 'analysis'),
      authoringCacheDirectory: path.join(sothspellHome(), 'cache', 'authoring'),
    });
  // Reviews share the run database; the audit trail and progress are both
  // local-first records under SOTHSPELL_HOME.
  const reviewService =
    options.reviewService ??
    createReviewService({
      store: createReviewStore(options.databasePath ?? defaultDatabasePath()),
      tours: createFileTourSource({
        homeDirectory: sothspellHome(),
        goldenTourPath: DEFAULT_TOUR_PATH.pathname,
        goldenTourIds: [GOLDEN_TOUR_ID, 'bunbun-golden'],
      }),
      sourceRoot: projectRoot,
      resolveModel: resolveAuthoringModel,
    });
  const translationStore =
    options.translationStore ??
    createFileTranslationStore(path.join(sothspellHome(), 'translations'));
  const translationService =
    options.translationService === undefined
      ? createTranslationService({
          resolveTourPath: (tourId) => resolveTourJsonPath(tourJsonPath, tourId),
          resolveModel: resolveAuthoringModel,
          cacheDirectory: path.join(sothspellHome(), 'cache', 'authoring'),
        })
      : options.translationService;
  const app = new Hono();

  // Host/Origin/Content-Type checks run before any route: the local API has no
  // authentication, so a page the user visits must not be able to reach it.
  app.use(
    '*',
    createApiSecurityMiddleware({
      publicUrl: options.publicUrl ?? process.env.SOTHSPELL_PUBLIC_URL ?? null,
      allowedOrigins: options.allowedOrigins,
    }),
  );

  registerAudioRoutes(app, { assetStore });
  registerSettingsRoutes(app, { service: settingsService, tester: profileTester });
  registerImportRoutes(app, { service: importService });
  registerAuthRoutes(app, auth);
  registerAccountRoutes(app, { auth, sync: syncService });
  registerReviewRoutes(app, { service: reviewService });
  registerTranslationRoutes(app, {
    service: translationService,
    store: translationStore,
    resolveTourPath: (tourId) => resolveTourJsonPath(tourJsonPath, tourId),
  });
  registerAuthoringRoutes(app, { service: authoringService });

  app.get('/api/health', (context) =>
    context.json({
      ok: true,
      service: 'sothspell',
      version: '0.2.0',
    }),
  );

  app.get('/api/tours/:tourId', async (context) => {
    const tourId = context.req.param('tourId');
    const resolvedPath = await resolveTourJsonPath(tourJsonPath, tourId);
    if (!resolvedPath) {
      return context.json({ error: `unknown tour: ${tourId}` }, 404);
    }
    const locale = context.req.query('locale');
    if (locale !== undefined && !LocaleSchema.safeParse(locale).success) {
      return context.json({ error: `invalid locale: ${locale}` }, 400);
    }
    const tour = await loadCompiledTour(translationStore, resolvedPath, tourId, locale);
    context.header('cache-control', 'no-store');
    return context.json(tour);
  });

  app.get('/api/projects/:projectId/source/:path{.+}', async (context) => {
    const projectId = context.req.param('projectId');
    if (projectId !== GOLDEN_PROJECT_ID) {
      return context.json({ error: `unknown project: ${projectId}` }, 404);
    }

    const anchorId = context.req.query('anchor');
    if (!anchorId) {
      return context.json({ error: 'anchor query parameter is required' }, 400);
    }

    const requestedTourId = context.req.query('tourId') ?? GOLDEN_TOUR_ID;
    const resolvedPath = await resolveTourJsonPath(tourJsonPath, requestedTourId);
    if (!resolvedPath) {
      return context.json({ error: `unknown tour: ${requestedTourId}` }, 404);
    }
    const tour = await loadCompiledTour(translationStore, resolvedPath, requestedTourId);
    const location = findAnchor(tour, anchorId);
    if (!location) {
      return context.json({ error: `unknown anchor: ${anchorId}` }, 404);
    }

    const requestedPath = decodeURIComponent(context.req.param('path') ?? '');
    if (requestedPath && requestedPath !== location.anchor.path) {
      return context.json({ error: 'the requested path does not match the anchor' }, 404);
    }

    context.header('cache-control', 'no-store');
    return context.json(await sourcePayload({ projectRoot, location, tour, projectId }));
  });

  app.post('/api/tours/:tourId/ask', async (context) => {
    const tourId = context.req.param('tourId');
    if (!(await resolveTourJsonPath(tourJsonPath, tourId))) {
      return context.json({ error: `unknown tour: ${tourId}` }, 404);
    }
    if (!askService) {
      return context.json(
        { error: 'in-tour questions are unavailable; no model is configured' },
        503,
      );
    }

    const body = await context.req.json().catch(() => null);
    const parsed = AskBodySchema.safeParse(body);
    if (!parsed.success) {
      return context.json(
        { error: 'invalid question payload', issues: parsed.error.issues },
        400,
      );
    }

    try {
      return context.json(await askService.answer({ ...parsed.data, tourId }));
    } catch (error) {
      if (error instanceof AskUnavailableError) {
        return context.json({ error: error.message }, 503);
      }
      if (error instanceof Error && /unknown beat/i.test(error.message)) {
        return context.json({ error: error.message }, 404);
      }
      throw error;
    }
  });

  app.post('/api/tours/:tourId/drilldown', async (context) => {
    const tourId = context.req.param('tourId');
    if (!(await resolveTourJsonPath(tourJsonPath, tourId))) {
      return context.json({ error: `unknown tour: ${tourId}` }, 404);
    }
    if (!drilldownService) {
      return context.json(
        { error: 'drilldown is unavailable; no model is configured' },
        503,
      );
    }
    const body = await context.req.json().catch(() => null);
    const parsed = z.object({ anchorId: z.string().min(1).max(256) }).safeParse(body);
    if (!parsed.success) {
      return context.json({ error: 'invalid drilldown payload' }, 400);
    }
    try {
      return context.json(await drilldownService.generate(tourId, parsed.data.anchorId));
    } catch (error) {
      if (error instanceof AskUnavailableError) {
        return context.json({ error: error.message }, 503);
      }
      if (error instanceof Error && /unknown anchor/i.test(error.message)) {
        return context.json({ error: error.message }, 404);
      }
      throw error;
    }
  });

  app.get('/api/runs', (context) => {
    const clientId = context.req.query('clientId');
    if (!clientId) {
      return context.json({ error: 'clientId query parameter is required' }, 400);
    }
    return context.json({ runs: runStore.list(clientId) });
  });

  app.get('/api/runs/:tourId', (context) => {
    const clientId = context.req.query('clientId');
    if (!clientId) {
      return context.json({ error: 'clientId query parameter is required' }, 400);
    }
    const run = runStore.get(clientId, context.req.param('tourId'));
    if (!run) {
      return context.json({ error: 'run not found' }, 404);
    }
    return context.json(run);
  });

  app.put('/api/runs/:tourId', async (context) => {
    const body = await context.req.json().catch(() => null);
    const parsed = RunBodySchema.safeParse(body);
    if (!parsed.success) {
      return context.json(
        { error: 'invalid run payload', issues: parsed.error.issues },
        400,
      );
    }

    const record: RunRecord = {
      ...parsed.data,
      tourId: context.req.param('tourId'),
      updatedAt: parsed.data.updatedAt ?? Date.now(),
    };
    runStore.put(record.tourId, record);
    return context.json(record);
  });

  app.delete('/api/runs/:tourId', (context) => {
    const originError = ensureTrustedOrigin(context, auth);
    if (originError) {
      return originError;
    }
    const clientId = context.req.query('clientId');
    if (!clientId) {
      return context.json({ error: 'clientId query parameter is required' }, 400);
    }
    const tourId = context.req.param('tourId');
    runStore.remove(clientId, tourId);
    // A signed-in "start over" also clears the account copy; the tombstone
    // keeps another device from pulling the deleted progress back.
    const authenticated = resolveAuth(context, auth);
    if (authenticated) {
      runStore.deleteUserRun(authenticated.user.id, tourId, auth.now());
    }
    return context.json({ ok: true });
  });

  app.post('/api/narration', async (context) => {
    const body = await context.req.json().catch(() => null);
    const parsed = NarrationBodySchema.safeParse(body);
    if (!parsed.success) {
      return context.json(
        { error: 'invalid narration payload', issues: parsed.error.issues },
        400,
      );
    }

    try {
      return context.json(await narrationService.synthesize(parsed.data));
    } catch (error) {
      // Cloud narration is optional; the player falls back to browser speech.
      if (error instanceof NarrationUnavailableError) {
        return context.json({ error: error.message }, 503);
      }
      throw error;
    }
  });

  app.notFound((context) =>
    context.json({ error: `not found: ${context.req.path}` }, 404),
  );

  app.onError((error, context) => {
    console.error(error);
    return context.json({ error: 'internal server error' }, 500);
  });

  return app;
}
