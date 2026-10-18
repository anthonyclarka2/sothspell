import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';

/**
 * Directory names the analyzer never descends into. They are the build, vendor,
 * and tool-output directories that fast-glob used to exclude; skipping them by
 * name keeps the walk deterministic and independent of glob expansion.
 */
export const DEFAULT_IGNORED_DIRECTORIES: ReadonlySet<string> = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'coverage',
  '.next',
  '.turbo',
  '.worktrees',
  'playwright-report',
  'test-results',
  '.cache',
]);

export interface WalkOptions {
  /** Include dotfiles and dot-directories (default true). */
  dot?: boolean;
  /** Maximum depth below the root; 0 lists root files only (default unlimited). */
  maxDepth?: number;
  /** Extra directory names to skip at any depth. */
  ignoreDirectories?: ReadonlySet<string>;
  /** Skip symlinks entirely instead of listing file symlinks (default false). */
  skipSymlinks?: boolean;
}

/**
 * Lists project files without glob expansion. Symlinks are never traversed; a
 * symlink that resolves to a regular file is listed and containment is checked
 * when the file is read. An unreadable directory is skipped, so the snapshot
 * records what it can instead of failing the analysis.
 */
export async function walkProjectFiles(
  root: string,
  options: WalkOptions = {},
): Promise<string[]> {
  const dot = options.dot ?? true;
  const maxDepth = options.maxDepth ?? Number.POSITIVE_INFINITY;
  const ignored = new Set([
    ...DEFAULT_IGNORED_DIRECTORIES,
    ...(options.ignoreDirectories ?? []),
  ]);
  const results: string[] = [];

  const walk = async (directory: string, depth: number): Promise<void> => {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (!dot && entry.name.startsWith('.')) {
        continue;
      }
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (ignored.has(entry.name) || depth >= maxDepth) {
          continue;
        }
        await walk(absolute, depth + 1);
        continue;
      }
      if (entry.isSymbolicLink()) {
        if (options.skipSymlinks) {
          continue;
        }
        const target = await stat(absolute).catch(() => null);
        if (!target?.isFile()) {
          continue;
        }
      } else if (!entry.isFile()) {
        continue;
      }
      results.push(path.relative(root, absolute).split(path.sep).join('/'));
    }
  };

  await walk(root, 0);
  return results.toSorted();
}
