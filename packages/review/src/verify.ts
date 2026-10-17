import { hashText, readSourceRange, type SothspellDocument } from '@sothspell/core';
import type { AnchorCheck, AnchorVerification } from './schemas.js';

/**
 * Anchor re-verification for the approval gate. This reuses the compiler's
 * verification primitives — `readSourceRange` produces the hash and `hashText`
 * is the hash the compiler compares against — so review can never disagree
 * with playback about what "stale" means.
 *
 * With a project root, the live source is the evidence. Without one, the
 * embedded excerpt is checked against its own recorded hash, which still
 * proves the tour's evidence is internally consistent but is reported with a
 * distinct reason so the reviewer knows the check was weaker.
 */

export interface VerifyAnchorsOptions {
  /** Read-only project root; `null` falls back to embedded excerpts. */
  sourceRoot: string | null;
  clock?: () => Date;
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && (error as NodeJS.ErrnoException).code === 'ENOENT';
}

async function verifyAnchor(
  anchor: {
    id: string;
    path: string;
    lines: { start: number; end: number };
    contentHash: string;
    excerpt?: string;
  },
  beatId: string,
  options: VerifyAnchorsOptions,
): Promise<AnchorCheck> {
  const base = {
    anchorId: anchor.id,
    beatId,
    path: anchor.path,
    expectedHash: anchor.contentHash,
  };

  if (options.sourceRoot) {
    try {
      const range = await readSourceRange(
        options.sourceRoot,
        anchor.path,
        anchor.lines.start,
        anchor.lines.end,
      );
      if (range.contentHash === anchor.contentHash) {
        return {
          ...base,
          status: 'verified',
          liveHash: range.contentHash,
          detail: 'the live source matches the anchor hash',
        };
      }
      return {
        ...base,
        status: 'mismatch',
        liveHash: range.contentHash,
        detail: `the live source hash ${range.contentHash} does not match ${anchor.contentHash}`,
      };
    } catch (error) {
      if (isMissingFile(error)) {
        return {
          ...base,
          status: 'missing',
          liveHash: null,
          detail: 'the anchored file is not present in the project',
        };
      }
      return {
        ...base,
        status: 'unreadable',
        liveHash: null,
        detail: `the anchored range could not be read: ${
          error instanceof Error ? error.message : String(error)
        }`,
      };
    }
  }

  if (anchor.excerpt === undefined) {
    return {
      ...base,
      status: 'unverifiable',
      liveHash: null,
      detail: 'no project root is configured and the anchor has no embedded excerpt',
    };
  }

  const excerptHash = hashText(anchor.excerpt);
  if (excerptHash === anchor.contentHash) {
    return {
      ...base,
      status: 'verified',
      liveHash: excerptHash,
      detail: 'the embedded excerpt matches the anchor hash (no project root configured)',
    };
  }
  return {
    ...base,
    status: 'mismatch',
    liveHash: excerptHash,
    detail: `the embedded excerpt hash ${excerptHash} does not match ${anchor.contentHash}`,
  };
}

export async function verifyAnchors(
  document: SothspellDocument,
  options: VerifyAnchorsOptions,
): Promise<AnchorVerification> {
  const clock = options.clock ?? (() => new Date());
  const checks: AnchorCheck[] = [];

  for (const chapter of document.chapters) {
    for (const beat of chapter.beats) {
      for (const anchor of beat.anchors) {
        checks.push(await verifyAnchor(anchor, beat.id, options));
      }
    }
  }

  return {
    checkedAt: clock().toISOString(),
    ok: checks.every((check) => check.status === 'verified'),
    checks,
  };
}
