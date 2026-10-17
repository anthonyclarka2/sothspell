import { readSourceRange } from '@sothspell/core';
import type { ProjectSnapshot, SymbolNode } from './types.js';

export interface AnchorInput {
  path: string;
  symbol?: string;
  lines: { start: number; end: number };
  contentHash?: string;
}

export interface ResolvedAnchor {
  path: string;
  symbolId: string | null;
  startLine: number;
  endLine: number;
  contentHash: string;
  excerpt: string;
}

function findSymbol(
  snapshot: ProjectSnapshot,
  path: string,
  symbolName: string,
): SymbolNode | null {
  return (
    snapshot.symbols.find(
      (symbol) =>
        symbol.path === path &&
        (symbol.qualifiedName === symbolName || symbol.id === symbolName),
    ) ?? null
  );
}

/**
 * Resolves a tour anchor against the snapshot and the live source. The symbol
 * wins over the line hint; the hash is the final proof that the excerpt the
 * tour cites is still the excerpt the user will see.
 */
export async function resolveAnchor(
  snapshot: ProjectSnapshot,
  sourceRoot: string,
  anchor: AnchorInput,
): Promise<ResolvedAnchor | null> {
  let symbolId: string | null = null;
  const ranges: Array<{ startLine: number; endLine: number }> = [];

  if (anchor.symbol) {
    const symbol = findSymbol(snapshot, anchor.path, anchor.symbol);
    if (symbol) {
      symbolId = symbol.id;
      ranges.push({ startLine: symbol.startLine, endLine: symbol.endLine });
    }
  }

  ranges.push({ startLine: anchor.lines.start, endLine: anchor.lines.end });

  for (const range of ranges) {
    let resolved;
    try {
      resolved = await readSourceRange(
        sourceRoot,
        anchor.path,
        range.startLine,
        range.endLine,
      );
    } catch {
      continue;
    }

    if (anchor.contentHash && resolved.contentHash !== anchor.contentHash) {
      continue;
    }

    return {
      path: anchor.path,
      symbolId,
      startLine: range.startLine,
      endLine: range.endLine,
      contentHash: resolved.contentHash,
      excerpt: resolved.text,
    };
  }

  return null;
}
