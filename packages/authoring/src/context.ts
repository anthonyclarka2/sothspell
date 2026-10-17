import { readSourceRange, languageForPath } from '@sothspell/core';
import type { ProjectBrief, ProjectSnapshot, SymbolNode } from '@sothspell/analyzer';

export interface AnchorCandidate {
  id: string;
  path: string;
  symbol: string;
  lines: { start: number; end: number };
  label: string;
  excerpt: string;
  language: string;
  contentHash: string;
}

export interface ContextPack {
  brief: ProjectBrief;
  candidates: AnchorCandidate[];
  docs: Array<{ path: string; title: string; summary: string }>;
  estimatedTokens: number;
}

export interface BuildContextOptions {
  sourceRoot: string;
  maxCandidates?: number;
  maxExcerptLines?: number;
}

function priority(symbol: SymbolNode): number {
  if (symbol.kind === 'class') return 0;
  if (symbol.kind === 'function') return 1;
  if (symbol.kind === 'interface' || symbol.kind === 'type') return 2;
  return 3;
}

function chooseSymbols(
  snapshot: ProjectSnapshot,
  brief: ProjectBrief,
  maxCandidates: number,
): SymbolNode[] {
  const byId = new Map(snapshot.symbols.map((symbol) => [symbol.id, symbol]));
  const byQualifiedName = new Map(
    snapshot.symbols.map((symbol) => [symbol.qualifiedName, symbol]),
  );
  const chosen: SymbolNode[] = [];
  const chosenIds = new Set<string>();

  const add = (symbol: SymbolNode | undefined): void => {
    if (!symbol || chosenIds.has(symbol.id) || chosen.length >= maxCandidates) {
      return;
    }
    if (symbol.kind === 'module' || symbol.path.endsWith('.spec.ts')) {
      return;
    }
    chosenIds.add(symbol.id);
    chosen.push(symbol);
  };

  for (const featureModule of brief.featureModules) {
    for (const representative of featureModule.representativeSymbols.slice(0, 2)) {
      add(byQualifiedName.get(representative));
    }
  }

  for (const entryPoint of brief.graphStats.entryPoints) {
    const moduleSymbol = byId.get(`symbol:${entryPoint}`);
    add(moduleSymbol);
    const exported = snapshot.symbols.find(
      (symbol) =>
        symbol.path === entryPoint && symbol.exported && symbol.kind !== 'module',
    );
    add(exported);
  }

  const fallback = snapshot.symbols
    .filter(
      (symbol) =>
        symbol.kind !== 'module' && symbol.exported && !symbol.path.endsWith('.spec.ts'),
    )
    .toSorted((left, right) => {
      const leftApp = left.path.startsWith('apps/') ? 0 : 1;
      const rightApp = right.path.startsWith('apps/') ? 0 : 1;
      const appOrder = leftApp - rightApp;
      if (appOrder !== 0) {
        return appOrder;
      }
      const priorityOrder = priority(left) - priority(right);
      return priorityOrder !== 0
        ? priorityOrder
        : `${left.path}:${left.startLine}`.localeCompare(
            `${right.path}:${right.startLine}`,
          );
    });

  for (const symbol of fallback) {
    add(symbol);
  }

  return chosen;
}

/**
 * Builds the bounded evidence set the model may cite. Candidates are chosen
 * from the project brief's representative symbols, entry points, and exported
 * declarations; each candidate carries only a short excerpt and a hash, never a
 * whole file.
 */
export async function buildContextPack(
  snapshot: ProjectSnapshot,
  brief: ProjectBrief,
  options: BuildContextOptions,
): Promise<ContextPack> {
  const maxCandidates = options.maxCandidates ?? 60;
  const maxExcerptLines = options.maxExcerptLines ?? 18;
  const redactedPaths = new Set(
    snapshot.files.filter((file) => file.redacted).map((file) => file.path),
  );
  const symbols = chooseSymbols(snapshot, brief, maxCandidates).filter(
    (symbol) => !redactedPaths.has(symbol.path),
  );
  const candidates: AnchorCandidate[] = [];

  for (const symbol of symbols) {
    const endLine = Math.min(symbol.endLine, symbol.startLine + maxExcerptLines - 1);
    try {
      const range = await readSourceRange(
        options.sourceRoot,
        symbol.path,
        symbol.startLine,
        endLine,
      );
      candidates.push({
        id: symbol.id,
        path: symbol.path,
        symbol: symbol.qualifiedName,
        lines: { start: range.startLine, end: range.endLine },
        label: symbol.qualifiedName || symbol.name,
        excerpt: range.text,
        language: languageForPath(symbol.path),
        contentHash: range.contentHash,
      });
    } catch {
      // A symbol whose source cannot be read is not evidence.
    }
  }

  const docs = brief.docs.slice(0, 10).map((doc) => ({
    path: doc.path,
    title: doc.title,
    summary: doc.summary,
  }));

  return {
    brief,
    candidates,
    docs,
    estimatedTokens: Math.ceil(JSON.stringify({ brief, candidates, docs }).length / 4),
  };
}
