import type { CompiledTour } from '@sothspell/core';

/**
 * Export guardrails. The embed bundle may contain excerpts and narration, but
 * never a local absolute path or a secret value; the checks run before any
 * byte is written so a rejected export leaves no partial bundle behind.
 */

export class EmbedExportError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'EmbedExportError';
    this.code = code;
  }
}

export const DEFAULT_MAX_EXCERPT_BYTES = 64 * 1024;
export const DEFAULT_MAX_TOTAL_EXCERPT_BYTES = 512 * 1024;

const encoder = new TextEncoder();

export function byteLength(value: string): number {
  return encoder.encode(value).length;
}

interface Pattern {
  name: string;
  regex: RegExp;
}

/**
 * Value-shaped secret patterns. Variable names like `OPENAI_API_KEY` are
 * allowed because source excerpts legitimately mention them; only a value that
 * looks like a live credential is rejected.
 */
const SECRET_PATTERNS: readonly Pattern[] = [
  { name: 'an OpenAI-style API key', regex: /\bsk-[A-Za-z0-9_-]{20,}/u },
  { name: 'a GitHub token', regex: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}/u },
  { name: 'an AWS access key', regex: /\bAKIA[0-9A-Z]{16}\b/u },
  { name: 'a Slack token', regex: /\bxox[baprs]-[A-Za-z0-9-]{10,}/u },
  { name: 'a private key block', regex: /-----BEGIN [A-Z ]*PRIVATE KEY-----/u },
  { name: 'a bearer token', regex: /\bBearer\s+[A-Za-z0-9._~+/-]{24,}=*/u },
  {
    name: 'a hard-coded credential',
    regex:
      /(?:api[_-]?key|secret|password|access[_-]?token|client[_-]?secret)\s*[:=]\s*["'][A-Za-z0-9+/_-]{24,}["']/iu,
  },
];

/**
 * Paths that identify a specific machine or checkout. A repository-relative
 * `/api/...` route or a `/tmp/...` reference inside an excerpt is fine; a home
 * directory or a `file://` URL is not.
 */
const ABSOLUTE_PATH_PATTERNS: readonly Pattern[] = [
  {
    name: 'a POSIX home path',
    regex: /(?:^|[\s"'`(=[])\/(?:Users|home)\/[A-Za-z0-9._-]+/u,
  },
  { name: 'a file URL', regex: /\bfile:\/\/[^\s"')]+/u },
  { name: 'a Windows path', regex: /\b[A-Za-z]:\\\\(?:[^\\\s"']+\\\\)+[^\\\s"']+/u },
  { name: 'a macOS temporary path', regex: /(?:^|[\s"'`(=[])\/private\/var\/[^\s"')]+/u },
];

export interface LocatedString {
  /** JSON-pointer-like location used in error messages. */
  location: string;
  value: string;
}

/**
 * Walks every human-facing string in the compiled tour. `html` is skipped
 * because it duplicates the excerpt that was already checked; scanning it
 * again would only slow the export down.
 */
export function collectTourStrings(tour: CompiledTour): LocatedString[] {
  const found: LocatedString[] = [];
  const visit = (value: unknown, location: string): void => {
    if (typeof value === 'string') {
      found.push({ location, value });
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, `${location}[${index}]`));
      return;
    }
    if (typeof value === 'object' && value !== null) {
      for (const [key, item] of Object.entries(value)) {
        if (key === 'html') {
          continue;
        }
        visit(item, location === '' ? key : `${location}.${key}`);
      }
    }
  };
  visit(tour, '');
  return found;
}

export function findSecret(value: string): string | null {
  for (const pattern of SECRET_PATTERNS) {
    if (pattern.regex.test(value)) {
      return pattern.name;
    }
  }
  return null;
}

export function findAbsoluteLocalPath(value: string): string | null {
  for (const pattern of ABSOLUTE_PATH_PATTERNS) {
    if (pattern.regex.test(value)) {
      return pattern.name;
    }
  }
  return null;
}

export interface ExcerptLimits {
  maxExcerptBytes: number;
  maxTotalExcerptBytes: number;
}

export function validateTourContent(
  tour: CompiledTour,
  limits: ExcerptLimits,
): { totalExcerptBytes: number } {
  let totalExcerptBytes = 0;
  const oversized: string[] = [];
  const anchorIds = new Set<string>();

  for (const chapter of tour.chapters) {
    for (const beat of chapter.beats) {
      for (const anchor of beat.anchors) {
        anchorIds.add(anchor.id);
        const bytes = byteLength(anchor.excerpt);
        totalExcerptBytes += bytes;
        if (bytes > limits.maxExcerptBytes) {
          oversized.push(`${anchor.id} (${bytes} bytes)`);
        }
      }
    }
  }

  if (oversized.length > 0) {
    throw new EmbedExportError(
      'excerpt-too-large',
      `these excerpts exceed the ${limits.maxExcerptBytes}-byte per-anchor ceiling: ${oversized.join(', ')}`,
    );
  }
  if (totalExcerptBytes > limits.maxTotalExcerptBytes) {
    throw new EmbedExportError(
      'excerpts-too-large',
      `the tour embeds ${totalExcerptBytes} bytes of excerpts across ${anchorIds.size} anchors, over the ${limits.maxTotalExcerptBytes}-byte ceiling; split the tour or raise the ceiling deliberately`,
    );
  }

  for (const { location, value } of collectTourStrings(tour)) {
    const secret = findSecret(value);
    if (secret) {
      // The value itself is never echoed: the error would otherwise leak the
      // secret into logs and the terminal.
      throw new EmbedExportError(
        'secret-detected',
        `${location} looks like ${secret}; remove the credential before exporting`,
      );
    }
    const absolute = findAbsoluteLocalPath(value);
    if (absolute) {
      throw new EmbedExportError(
        'absolute-path-detected',
        `${location} contains ${absolute}; the embed bundle must not ship machine-specific paths`,
      );
    }
  }

  return { totalExcerptBytes };
}

export function validateAssetPath(path: string): void {
  if (path.startsWith('/') || path.includes('..') || /^[A-Za-z]:/u.test(path)) {
    throw new EmbedExportError(
      'invalid-asset-path',
      `asset path ${JSON.stringify(path)} must be relative and stay inside the bundle`,
    );
  }
}
