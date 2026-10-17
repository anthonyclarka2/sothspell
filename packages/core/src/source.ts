import { createHash } from 'node:crypto';
import { readFile, realpath } from 'node:fs/promises';
import path from 'node:path';

export interface SourceRange {
  path: string;
  startLine: number;
  endLine: number;
  text: string;
  contentHash: string;
}

export function hashText(text: string): string {
  return `sha256:${createHash('sha256').update(text, 'utf8').digest('hex')}`;
}

function isWithin(root: string, candidate: string): boolean {
  return candidate === root || candidate.startsWith(`${root}${path.sep}`);
}

/**
 * Resolves a repository-relative path and proves it stays inside the project
 * root, including through symlinks. The check is deliberately conservative:
 * an absolute path, a parent segment, a NUL byte, or a symlink that leaves the
 * root is a refusal, not a normalisation puzzle.
 */
export async function resolveContainedPath(
  root: string,
  relativePath: string,
): Promise<string> {
  if (path.isAbsolute(relativePath)) {
    throw new Error(`absolute paths are not allowed: ${relativePath}`);
  }
  if (relativePath.includes('\0')) {
    throw new Error('path contains a NUL byte');
  }

  const normalized = path.normalize(relativePath);
  if (normalized === '..' || normalized.startsWith(`..${path.sep}`)) {
    throw new Error(`path traversal is not allowed: ${relativePath}`);
  }

  const rootReal = await realpath(root);
  const resolved = path.resolve(rootReal, normalized);

  if (!isWithin(rootReal, resolved)) {
    throw new Error(`path escapes the project root: ${relativePath}`);
  }

  try {
    const targetReal = await realpath(resolved);
    if (!isWithin(rootReal, targetReal)) {
      throw new Error(`path points outside the project root: ${relativePath}`);
    }
    return targetReal;
  } catch (error) {
    if (error instanceof Error && /outside the project root/.test(error.message)) {
      throw error;
    }
    // The file may not exist yet (a future generated artifact); containment is
    // already proven above, so return the resolved path and let the caller fail
    // on the read if it truly is missing.
    return resolved;
  }
}

/** Reads a 1-based inclusive line range from a project file. */
export async function readSourceRange(
  root: string,
  relativePath: string,
  startLine: number,
  endLine: number,
): Promise<SourceRange> {
  if (!Number.isInteger(startLine) || !Number.isInteger(endLine) || startLine < 1) {
    throw new Error(`invalid line range: ${startLine}-${endLine}`);
  }
  if (endLine < startLine) {
    throw new Error(`line range end ${endLine} is before start ${startLine}`);
  }

  const absolute = await resolveContainedPath(root, relativePath);
  const fileText = await readFile(absolute, 'utf8');
  const lines = fileText.split('\n');

  if (endLine > lines.length) {
    throw new Error(
      `line range ${startLine}-${endLine} is beyond the end of ${relativePath} (${lines.length} lines)`,
    );
  }

  const text = lines.slice(startLine - 1, endLine).join('\n');

  return {
    path: relativePath,
    startLine,
    endLine,
    text,
    contentHash: hashText(text),
  };
}
