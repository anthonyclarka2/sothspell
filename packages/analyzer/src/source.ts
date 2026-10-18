import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import ignore, { type Ignore } from 'ignore';
import { languageForPath, resolveContainedPath } from '@sothspell/core';
import type { FileEntry, FileLanguage, AnalysisWarning } from './types.js';
import { walkProjectFiles } from './walk.js';

export const MAX_FILE_BYTES = 2 * 1024 * 1024;

const BINARY_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.ico',
  '.pdf',
  '.zip',
  '.gz',
  '.tgz',
  '.woff',
  '.woff2',
  '.ttf',
  '.otf',
  '.eot',
  '.mp3',
  '.mp4',
  '.mov',
  '.wasm',
  '.node',
]);

interface IgnoreRule {
  base: string;
  matcher: Ignore;
}

export function normalizeLanguage(language: string): FileLanguage {
  return (language === 'plaintext' ? 'text' : language) as FileLanguage;
}

/**
 * Extensions the analyzer parses with a language adapter. They live here rather
 * than in `@sothspell/core`'s highlight map because only the analyzer needs to
 * know that a `.py` file is Python source rather than plain text.
 */
const ANALYZER_EXTENSIONS: Record<string, FileLanguage> = {
  '.py': 'python',
  '.pyi': 'python',
  '.go': 'go',
  '.rs': 'rust',
  '.java': 'java',
};

export function languageOf(filePath: string): FileLanguage {
  return (
    ANALYZER_EXTENSIONS[path.extname(filePath).toLowerCase()] ??
    normalizeLanguage(languageForPath(filePath))
  );
}

async function loadIgnoreRules(
  root: string,
  files: readonly string[],
): Promise<IgnoreRule[]> {
  const ignoreFiles = files.filter((file) => path.posix.basename(file) === '.gitignore');

  const rules: IgnoreRule[] = [];
  for (const ignoreFile of ignoreFiles) {
    const content = await readFile(path.join(root, ignoreFile), 'utf8').catch(() => null);
    if (content === null) {
      continue;
    }
    const directory = path.posix.dirname(ignoreFile);
    rules.push({
      base: directory === '.' ? '' : `${directory}/`,
      matcher: ignore().add(content),
    });
  }
  return rules;
}

function isIgnored(relativePath: string, rules: IgnoreRule[]): boolean {
  for (const rule of rules) {
    if (rule.base && !relativePath.startsWith(rule.base)) {
      continue;
    }
    const localPath = rule.base ? relativePath.slice(rule.base.length) : relativePath;
    if (rule.matcher.ignores(localPath)) {
      return true;
    }
  }
  return false;
}

/**
 * Lists every file the analyzer is allowed to read. `.gitignore` files are
 * honoured relative to their own directory, and build/vendor directories are
 * denied before the ignore rules run, so a repository cannot opt its cache
 * back into the snapshot.
 */
export async function listProjectFiles(root: string): Promise<string[]> {
  const files = await walkProjectFiles(root);
  const rules = await loadIgnoreRules(root, files);
  return files.filter((file) => !isIgnored(file, rules)).toSorted();
}

function looksBinary(content: Buffer, language: FileLanguage): boolean {
  if (language === 'binary') {
    return true;
  }
  const sample = content.subarray(0, 512);
  return sample.includes(0);
}

const SECRET_PATTERNS = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\b(?:api[_-]?key|secret|token|password|passwd|private[_-]?key)\b\s*[:=]\s*['"`][^'"`\n]{12,}/i,
  /\b(?:sk|pk)_[A-Za-z0-9]{16,}\b/,
  /\bghp_[A-Za-z0-9]{20,}\b/,
  /\bAKIA[0-9A-Z]{16}\b/,
];

export function redactionReason(text: string): string | null {
  for (const pattern of SECRET_PATTERNS) {
    if (pattern.test(text)) {
      return `matched ${pattern.source}`;
    }
  }
  return null;
}

export interface ReadFileResult {
  entry: FileEntry;
  text: string | null;
  /** Redacted files are parsed for symbols but never exposed as source text. */
  parseText?: string | null;
  warning?: AnalysisWarning;
}

export async function readProjectFile(
  root: string,
  relativePath: string,
): Promise<ReadFileResult> {
  const absolute = await resolveContainedPath(root, relativePath);
  const fileStat = await stat(absolute);
  const bytes = fileStat.size;
  const language = languageOf(relativePath);

  if (bytes > MAX_FILE_BYTES) {
    return {
      entry: {
        path: relativePath,
        language,
        bytes,
        hash: 'sha256:skipped',
        lineCount: 0,
        isBinary: BINARY_EXTENSIONS.has(path.extname(relativePath).toLowerCase()),
        redacted: false,
        lastModifiedMs: fileStat.mtimeMs,
      },
      text: null,
      warning: {
        path: relativePath,
        kind: 'large-file',
        message: `file is larger than ${MAX_FILE_BYTES} bytes and was not parsed`,
      },
    };
  }

  const content = await readFile(absolute);
  const hash = `sha256:${createHash('sha256').update(content).digest('hex')}`;
  const binary =
    BINARY_EXTENSIONS.has(path.extname(relativePath).toLowerCase()) ||
    looksBinary(content, language);

  if (binary) {
    return {
      entry: {
        path: relativePath,
        language: 'binary',
        bytes,
        hash,
        lineCount: 0,
        isBinary: true,
        redacted: false,
        lastModifiedMs: fileStat.mtimeMs,
      },
      text: null,
      warning: {
        path: relativePath,
        kind: 'binary',
        message: 'binary file: content was not parsed',
      },
    };
  }

  const text = content.toString('utf8');
  const reason = redactionReason(text);
  if (reason) {
    return {
      entry: {
        path: relativePath,
        language,
        bytes,
        hash,
        lineCount: text.split('\n').length,
        isBinary: false,
        redacted: true,
        redactionReason: reason,
        lastModifiedMs: fileStat.mtimeMs,
      },
      text: null,
      parseText: text,
      warning: {
        path: relativePath,
        kind: 'redacted',
        message: `secret-like content was not exposed (${reason})`,
      },
    };
  }

  return {
    entry: {
      path: relativePath,
      language,
      bytes,
      hash,
      lineCount: text.length === 0 ? 0 : text.split('\n').length,
      isBinary: false,
      redacted: false,
      lastModifiedMs: fileStat.mtimeMs,
    },
    text,
  };
}
