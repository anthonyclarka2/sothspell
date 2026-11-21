import { existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { listProjectFiles } from '@sothspell/analyzer';
import { isSafeTourId, readSourceFile } from '@sothspell/core';
import sourceHashes from '../../../examples/tiny-notes-tour/source-hashes.json' with { type: 'json' };
import { resolveProjectSource } from './project-record.js';

export const BUNBUN_TOUR_ID = 'tour_bunbun_golden';
export const TINY_NOTES_TOUR_ID = 'tour_tiny_notes_golden';

const BUNBUN_TOUR = fileURLToPath(
  new URL('../../../examples/bunbun-tour/tour.json', import.meta.url),
);
const TINY_NOTES_TOUR = fileURLToPath(
  new URL('../../../examples/tiny-notes-tour/tour.json', import.meta.url),
);
const TINY_NOTES_SOURCE = fileURLToPath(
  new URL('../../../examples/tiny-notes', import.meta.url),
);

interface TourAccessOptions {
  home: string;
  bunbunRoot: string | null;
  bunbunTourPath?: string;
}

/** Resolves built-in tours before local project tours, using paths owned by Sóþspell. */
export function createTourAccess(options: TourAccessOptions) {
  const builtInTours = new Map([
    [BUNBUN_TOUR_ID, options.bunbunTourPath ?? BUNBUN_TOUR],
    [TINY_NOTES_TOUR_ID, TINY_NOTES_TOUR],
  ]);
  const aliases = new Map([
    ['demo', TINY_NOTES_TOUR_ID],
    ['tiny-notes-golden', TINY_NOTES_TOUR_ID],
    ['bunbun-golden', BUNBUN_TOUR_ID],
  ]);
  const canonicalId = (tourId: string): string => aliases.get(tourId) ?? tourId;
  const isPinnedDemo = (tourId: string): boolean =>
    canonicalId(tourId) === TINY_NOTES_TOUR_ID;

  return {
    isPinnedDemo,

    async resolvePath(tourId: string): Promise<string | null> {
      if (!isSafeTourId(tourId)) {
        return null;
      }
      const builtIn = builtInTours.get(canonicalId(tourId));
      if (builtIn) {
        return builtIn;
      }

      const root = path.join(options.home, 'projects');
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
    },

    async resolveRoot(tourId: string, projectSlug: string): Promise<string | null> {
      if (isPinnedDemo(tourId)) {
        // An authored Tiny Notes checkout can have the same slug. Only the
        // shipped source, checked against its pinned manifest, backs this tour.
        const files = await listProjectFiles(TINY_NOTES_SOURCE);
        if (
          files.length !== Object.keys(sourceHashes).length ||
          files.some((file) => !Object.hasOwn(sourceHashes, file))
        ) {
          return null;
        }
        const matches = await Promise.all(
          Object.entries(sourceHashes).map(async ([file, hash]) => {
            const source = await readSourceFile(TINY_NOTES_SOURCE, file).catch(
              () => null,
            );
            return source?.contentHash === hash;
          }),
        );
        return matches.every(Boolean) ? TINY_NOTES_SOURCE : null;
      }

      const source = await resolveProjectSource(projectSlug, {
        home: options.home,
        configuredRoot: options.bunbunRoot,
      });
      return source.root;
    },
  };
}
