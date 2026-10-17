import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { hashText, parseSothspell, type SothspellDocument } from '@sothspell/core';
import { ReviewQualitySchema, type ReviewQuality } from './schemas.js';

/**
 * Loads the tour a review is about. Tours live either at a pinned golden path
 * or under `$SOTHSPELL_HOME/projects/<slug>/tours/<tourId>/tour.json`; the
 * quality report the authoring pipeline wrote beside the tour is input to the
 * review, not part of it.
 */

export interface ReviewTour {
  document: SothspellDocument;
  /**
   * Content hash of the tour document. This is the revision the review is
   * pinned to: two tours at the same project commit can still differ, and an
   * edit to the tour must start a new review rather than reuse this one.
   */
  revision: string;
  quality: ReviewQuality | null;
}

export interface ReviewTourSource {
  load(tourId: string): Promise<ReviewTour | null>;
}

export interface FileTourSourceOptions {
  homeDirectory: string;
  goldenTourPath?: string | null;
  goldenTourIds?: string[];
}

async function resolveTourPath(
  options: FileTourSourceOptions,
  tourId: string,
): Promise<string | null> {
  if (
    options.goldenTourPath &&
    (options.goldenTourIds ?? []).includes(tourId) &&
    existsSync(options.goldenTourPath)
  ) {
    return options.goldenTourPath;
  }

  const root = path.join(options.homeDirectory, 'projects');
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

export function createFileTourSource(options: FileTourSourceOptions): ReviewTourSource {
  return {
    async load(tourId) {
      const tourPath = await resolveTourPath(options, tourId);
      if (!tourPath) {
        return null;
      }

      const raw = await readFile(tourPath, 'utf8');
      const document = parseSothspell(JSON.parse(raw) as unknown);

      const qualityPath = path.join(path.dirname(tourPath), 'quality.json');
      let quality: ReviewQuality | null = null;
      if (existsSync(qualityPath)) {
        try {
          const parsed = ReviewQualitySchema.safeParse(
            JSON.parse(await readFile(qualityPath, 'utf8')) as unknown,
          );
          quality = parsed.success ? parsed.data : null;
        } catch {
          // A malformed quality report must not block a review; it is input.
          quality = null;
        }
      }

      return {
        document,
        revision: hashText(JSON.stringify(document)),
        quality,
      };
    },
  };
}

/** An in-memory source for tests and harnesses. */
export function createMemoryTourSource(
  tours: Record<string, ReviewTour | SothspellDocument>,
): ReviewTourSource {
  const resolved = new Map<string, ReviewTour>(
    Object.entries(tours).map(([tourId, value]) => [
      tourId,
      'document' in value
        ? value
        : { document: value, revision: hashText(JSON.stringify(value)), quality: null },
    ]),
  );
  return {
    async load(tourId) {
      return resolved.get(tourId) ?? null;
    },
  };
}
