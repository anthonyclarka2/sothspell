import type { GraphEdge, ProjectSnapshot, SymbolNode } from './types.js';

/** The relation kinds a canvas flow link can honestly present. */
export type SymbolRelationKind = 'calls' | 'references' | 'imports';

export type SymbolRelationDirection = 'incoming' | 'outgoing';

export interface SelectedSymbolRelation {
  symbol: SymbolNode;
  relation: SymbolRelationKind;
  confidence: GraphEdge['confidence'];
  /**
   * One-based line in the related symbol's file that an excerpt should centre
   * on. Incoming calls centre on the caller's call site and incoming
   * imports/references centre on the import statement. An outgoing relation
   * targets a definition, so the line in the source container would be wrong
   * to show for the destination.
   */
  line: number | null;
}

export interface SymbolRelationSelection {
  symbol: SymbolNode | null;
  relations: SelectedSymbolRelation[];
  /** More distinct related symbols matched than this page returned. */
  truncated: boolean;
  /** Distinct related symbols before the offset and limit window. */
  total: number;
}

const RELATION_RANK: Record<SymbolRelationKind, number> = {
  calls: 0,
  references: 1,
  imports: 2,
};

function isRelationKind(kind: GraphEdge['kind']): kind is SymbolRelationKind {
  return kind === 'calls' || kind === 'references' || kind === 'imports';
}

function candidateFor(
  edge: GraphEdge,
  direction: SymbolRelationDirection,
  byId: ReadonlyMap<string, SymbolNode>,
): SelectedSymbolRelation | null {
  if (!isRelationKind(edge.kind)) {
    return null;
  }

  if (direction === 'incoming') {
    const symbol = byId.get(edge.from);
    if (!symbol) {
      return null;
    }
    return {
      symbol,
      relation: edge.kind,
      confidence: edge.confidence,
      line: edge.kind === 'calls' ? (edge.atLine ?? null) : (edge.line ?? null),
    };
  }

  if (direction === 'outgoing') {
    const symbol = byId.get(edge.to);
    if (!symbol) {
      return null;
    }
    return {
      symbol,
      relation: edge.kind,
      confidence: edge.confidence,
      line: null,
    };
  }

  return null;
}

function beats(left: SelectedSymbolRelation, right: SelectedSymbolRelation): boolean {
  const rank = RELATION_RANK[left.relation] - RELATION_RANK[right.relation];
  if (rank !== 0) {
    return rank < 0;
  }
  const pathOrder = left.symbol.path.localeCompare(right.symbol.path);
  if (pathOrder !== 0) {
    return pathOrder < 0;
  }
  const lineOrder = left.symbol.startLine - right.symbol.startLine;
  if (lineOrder !== 0) {
    return lineOrder < 0;
  }
  const nameOrder = left.symbol.id.localeCompare(right.symbol.id);
  if (nameOrder !== 0) {
    return nameOrder < 0;
  }
  return (left.line ?? Number.MAX_SAFE_INTEGER) < (right.line ?? Number.MAX_SAFE_INTEGER);
}

/**
 * Selects a bounded symbol-level subgraph from one snapshot. The function is
 * pure so the API can shape the same answer for definitions, callers, and
 * callees without sending a snapshot to the browser. One related symbol is
 * returned once; a proven call beats a reference, and a reference beats an
 * import, because the stronger edge is the honest label.
 */
export function selectSymbolRelations(
  snapshot: Pick<ProjectSnapshot, 'symbols' | 'graph'>,
  symbolId: string,
  direction: SymbolRelationDirection,
  limit: number,
  offset = 0,
): SymbolRelationSelection {
  const symbol = snapshot.symbols.find((candidate) => candidate.id === symbolId) ?? null;
  if (!symbol) {
    return { symbol: null, relations: [], truncated: false, total: 0 };
  }

  const byId = new Map(snapshot.symbols.map((entry) => [entry.id, entry]));
  const best = new Map<string, SelectedSymbolRelation>();
  for (const edge of snapshot.graph.edges) {
    if (direction === 'incoming' ? edge.to !== symbol.id : edge.from !== symbol.id) {
      continue;
    }
    const candidate = candidateFor(edge, direction, byId);
    if (!candidate) {
      continue;
    }
    const current = best.get(candidate.symbol.id);
    if (!current || beats(candidate, current)) {
      best.set(candidate.symbol.id, candidate);
    }
  }

  const ordered = [...best.values()].toSorted((left, right) =>
    left === right ? 0 : beats(left, right) ? -1 : 1,
  );
  const safeLimit = Math.max(0, Math.trunc(limit));
  const safeOffset = Math.max(0, Math.trunc(offset));
  const relations = ordered.slice(safeOffset, safeOffset + safeLimit);

  return {
    symbol,
    relations,
    truncated: safeOffset + relations.length < ordered.length,
    total: ordered.length,
  };
}
