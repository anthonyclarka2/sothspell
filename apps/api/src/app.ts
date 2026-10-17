import { readFile } from 'node:fs/promises';
import { Hono } from 'hono';
import {
  compileSothspell,
  type CompiledAnchor,
  type CompiledTour,
} from '@sothspell/core';

export interface AppOptions {
  /** Override for tests; defaults to the checked-in golden tour. */
  tourJsonPath?: string;
}

const DEFAULT_TOUR_PATH = new URL(
  '../../../examples/bunbun-tour/tour.json',
  import.meta.url,
);

export const GOLDEN_TOUR_ID = 'tour_bunbun_golden';
const GOLDEN_TOUR_ALIASES = new Set([GOLDEN_TOUR_ID, 'bunbun-golden']);
const GOLDEN_PROJECT_ID = 'bunbun';

const compiledCache = new Map<string, Promise<CompiledTour>>();

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
  chapterId: string;
}

function findAnchor(tour: CompiledTour, anchorId: string): AnchorLocation | null {
  for (const chapter of tour.chapters) {
    for (const beat of chapter.beats) {
      const anchor = beat.anchors.find((candidate) => candidate.id === anchorId);
      if (anchor) {
        return { anchor, beatId: beat.id, chapterId: chapter.id };
      }
    }
  }
  return null;
}

/**
 * The HTTP boundary for the local player. It returns compiled tours and code
 * anchors; it never reads the target repository directly, so the web client
 * cannot ask for a file the tour did not already cite.
 */
export function createApp(options: AppOptions = {}): Hono {
  const tourJsonPath = options.tourJsonPath ?? DEFAULT_TOUR_PATH.pathname;
  const app = new Hono();

  app.get('/api/health', (context) =>
    context.json({
      ok: true,
      service: 'sothspell',
      version: '0.1.0',
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
    return context.json({
      projectId,
      tourId: tour.id,
      path: location.anchor.path,
      symbol: location.anchor.symbol ?? null,
      label: location.anchor.label ?? null,
      startLine: location.anchor.startLine,
      endLine: location.anchor.endLine,
      language: location.anchor.language,
      contentHash: location.anchor.contentHash,
      excerpt: location.anchor.excerpt,
      html: location.anchor.html,
      beatId: location.beatId,
      chapterId: location.chapterId,
    });
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
