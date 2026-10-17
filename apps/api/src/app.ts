import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Hono } from 'hono';
import {
  compileSothspell,
  highlightCodeLines,
  languageForPath,
  readSourceFile,
  readSourceRange,
  type CompiledAnchor,
  type CompiledTour,
} from '@sothspell/core';
import { createRunStore, RunBodySchema, type RunRecord } from './runs.js';

export interface AppOptions {
  /** Override for tests; defaults to the checked-in golden tour. */
  tourJsonPath?: string;
  /** Read-only project root for full-file code pages. */
  projectRoot?: string | null;
  /** SQLite path; `:memory:` is used by tests. */
  databasePath?: string;
}

const DEFAULT_TOUR_PATH = new URL(
  '../../../examples/bunbun-tour/tour.json',
  import.meta.url,
);

export const GOLDEN_TOUR_ID = 'tour_bunbun_golden';
const GOLDEN_TOUR_ALIASES = new Set([GOLDEN_TOUR_ID, 'bunbun-golden']);
const GOLDEN_PROJECT_ID = 'bunbun';

const compiledCache = new Map<string, Promise<CompiledTour>>();

function defaultDatabasePath(): string {
  const home = process.env.SOTHSPELL_HOME ?? path.join(os.homedir(), '.sothspell');
  return path.join(home, 'sothspell.db');
}

function loadCompiledTour(tourJsonPath: string): Promise<CompiledTour> {
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
 * anchors; full files are read only from the configured project root, and
 * progress is stored in a local anonymous run table.
 */
export function createApp(options: AppOptions = {}): Hono {
  const tourJsonPath = options.tourJsonPath ?? DEFAULT_TOUR_PATH.pathname;
  const projectRoot = options.projectRoot ?? process.env.SOTHSPELL_PROJECT_ROOT ?? null;
  const runStore = createRunStore(options.databasePath ?? defaultDatabasePath());
  const app = new Hono();

  app.get('/api/health', (context) =>
    context.json({
      ok: true,
      service: 'sothspell',
      version: '0.2.0',
    }),
  );

  app.get('/api/tours/:tourId', async (context) => {
    const tourId = context.req.param('tourId');
    if (!GOLDEN_TOUR_ALIASES.has(tourId)) {
      return context.json({ error: `unknown tour: ${tourId}` }, 404);
    }

    const tour = await loadCompiledTour(tourJsonPath);
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

    const tour = await loadCompiledTour(tourJsonPath);
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
      updatedAt: Date.now(),
    };
    runStore.put(record.tourId, record);
    return context.json(record);
  });

  app.delete('/api/runs/:tourId', (context) => {
    const clientId = context.req.query('clientId');
    if (!clientId) {
      return context.json({ error: 'clientId query parameter is required' }, 400);
    }
    runStore.remove(clientId, context.req.param('tourId'));
    return context.json({ ok: true });
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
