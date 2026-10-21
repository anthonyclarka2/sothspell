import { describe, expect, it } from 'vitest';
import { selectSymbolRelations } from './relations.js';
import type { GraphEdge, ProjectGraph, ProjectSnapshot, SymbolNode } from './types.js';

function symbol(id: string, overrides: Partial<SymbolNode> = {}): SymbolNode {
  const path =
    overrides.path ?? `src/${id.split('#')[0]?.replace('symbol:', '') || 'file'}.ts`;
  return {
    id,
    kind: 'function',
    name: id.split('#').pop() ?? id,
    qualifiedName: id.split('#').pop() ?? id,
    path,
    startLine: 1,
    endLine: 2,
    exported: true,
    parentId: null,
    decorators: [],
    signature: '',
    documentation: null,
    language: 'typescript',
    ...overrides,
  };
}

function graph(edges: GraphEdge[]): ProjectGraph {
  return { fileImports: [], packageImports: [], edges, entryPoints: [] };
}

function snapshot(
  symbols: SymbolNode[],
  edges: GraphEdge[],
): Pick<ProjectSnapshot, 'symbols' | 'graph'> {
  return { symbols, graph: graph(edges) };
}

describe('selectSymbolRelations', () => {
  it('returns incoming callers with the call line in the caller', () => {
    const caller = symbol('symbol:src/a.ts#run', { path: 'src/a.ts' });
    const target = symbol('symbol:src/b.ts#save', { path: 'src/b.ts' });
    const selection = selectSymbolRelations(
      snapshot(
        [caller, target],
        [
          {
            from: caller.id,
            to: target.id,
            kind: 'calls',
            confidence: 'syntax',
            atLine: 7,
          },
        ],
      ),
      target.id,
      'incoming',
      8,
    );

    expect(selection.symbol?.id).toBe(target.id);
    expect(selection.relations).toEqual([
      {
        symbol: caller,
        relation: 'calls',
        confidence: 'syntax',
        line: 7,
      },
    ]);
    expect(selection.truncated).toBe(false);
    expect(selection.total).toBe(1);
  });

  it('returns outgoing callees without centring on the source call line', () => {
    const source = symbol('symbol:src/a.ts#run', { path: 'src/a.ts' });
    const callee = symbol('symbol:src/b.ts#save', { path: 'src/b.ts' });
    const selection = selectSymbolRelations(
      snapshot(
        [source, callee],
        [
          {
            from: source.id,
            to: callee.id,
            kind: 'calls',
            confidence: 'import',
            atLine: 4,
          },
        ],
      ),
      source.id,
      'outgoing',
      8,
    );

    expect(selection.relations).toEqual([
      {
        symbol: callee,
        relation: 'calls',
        confidence: 'import',
        line: null,
      },
    ]);
  });

  it('falls back to references and imports, labelled as such', () => {
    const importer = symbol('symbol:src/importer.ts', {
      kind: 'module',
      name: 'importer.ts',
      qualifiedName: '',
      path: 'src/importer.ts',
    });
    const target = symbol('symbol:src/target.ts#helper', {
      path: 'src/target.ts',
    });
    const dependency = symbol('symbol:src/dependency.ts', {
      kind: 'module',
      name: 'dependency.ts',
      qualifiedName: '',
      path: 'src/dependency.ts',
    });

    const incoming = selectSymbolRelations(
      snapshot(
        [importer, target],
        [
          {
            from: importer.id,
            to: target.id,
            kind: 'references',
            confidence: 'import',
            line: 2,
          },
        ],
      ),
      target.id,
      'incoming',
      8,
    );
    expect(incoming.relations[0]).toMatchObject({
      symbol: importer,
      relation: 'references',
      confidence: 'import',
      line: 2,
    });

    const outgoing = selectSymbolRelations(
      snapshot(
        [importer, dependency],
        [
          {
            from: importer.id,
            to: dependency.id,
            kind: 'imports',
            confidence: 'syntax',
            line: 11,
          },
        ],
      ),
      importer.id,
      'outgoing',
      8,
    );
    expect(outgoing.relations[0]).toMatchObject({
      symbol: dependency,
      relation: 'imports',
      confidence: 'syntax',
      line: null,
    });
  });

  it('prefers a call edge over a reference edge to the same symbol', () => {
    const caller = symbol('symbol:src/a.ts#run', { path: 'src/a.ts' });
    const target = symbol('symbol:src/b.ts#save', { path: 'src/b.ts' });
    const selection = selectSymbolRelations(
      snapshot(
        [caller, target],
        [
          {
            from: caller.id,
            to: target.id,
            kind: 'references',
            confidence: 'import',
            line: 2,
          },
          {
            from: caller.id,
            to: target.id,
            kind: 'calls',
            confidence: 'syntax',
            atLine: 9,
          },
        ],
      ),
      target.id,
      'incoming',
      8,
    );

    expect(selection.relations).toHaveLength(1);
    expect(selection.relations[0]).toMatchObject({
      relation: 'calls',
      line: 9,
    });
  });

  it('orders by relation kind, then path and line, independent of edge order', () => {
    const target = symbol('symbol:src/target.ts#save', { path: 'src/target.ts' });
    const callerZ = symbol('symbol:src/z.ts#caller', {
      path: 'src/z.ts',
      startLine: 20,
    });
    const callerA = symbol('symbol:src/a.ts#caller', {
      path: 'src/a.ts',
      startLine: 30,
    });
    const moduleB = symbol('symbol:src/b.ts', {
      kind: 'module',
      name: 'b.ts',
      qualifiedName: '',
      path: 'src/b.ts',
    });
    const edges: GraphEdge[] = [
      { from: callerZ.id, to: target.id, kind: 'calls', confidence: 'syntax', atLine: 4 },
      {
        from: moduleB.id,
        to: target.id,
        kind: 'references',
        confidence: 'import',
        line: 1,
      },
      { from: callerA.id, to: target.id, kind: 'calls', confidence: 'syntax', atLine: 9 },
    ];

    const first = selectSymbolRelations(
      snapshot([target, callerZ, callerA, moduleB], edges),
      target.id,
      'incoming',
      8,
    );
    const second = selectSymbolRelations(
      snapshot([moduleB, callerA, target, callerZ], edges.toReversed()),
      target.id,
      'incoming',
      8,
    );

    expect(first.relations.map((relation) => relation.symbol.path)).toEqual([
      'src/a.ts',
      'src/z.ts',
      'src/b.ts',
    ]);
    expect(second.relations).toEqual(first.relations);
  });

  it('applies the limit and offset to deduplicated relations', () => {
    const target = symbol('symbol:src/target.ts#save', { path: 'src/target.ts' });
    const symbols = [target];
    const edges: GraphEdge[] = [];
    for (let index = 0; index < 10; index += 1) {
      const caller = symbol(`symbol:src/caller${index}.ts#run`, {
        path: `src/caller${index}.ts`,
      });
      symbols.push(caller);
      edges.push({
        from: caller.id,
        to: target.id,
        kind: 'calls',
        confidence: 'syntax',
        atLine: 3,
      });
    }

    const firstPage = selectSymbolRelations(
      snapshot(symbols, edges),
      target.id,
      'incoming',
      8,
      0,
    );
    expect(firstPage.relations).toHaveLength(8);
    expect(firstPage.total).toBe(10);
    expect(firstPage.truncated).toBe(true);
    expect(firstPage.relations[0]?.symbol.path).toBe('src/caller0.ts');

    const secondPage = selectSymbolRelations(
      snapshot(symbols, edges),
      target.id,
      'incoming',
      8,
      8,
    );
    expect(secondPage.relations).toHaveLength(2);
    expect(secondPage.relations[0]?.symbol.path).toBe('src/caller8.ts');
    expect(secondPage.truncated).toBe(false);
  });

  it('returns no relations for an unknown symbol', () => {
    const selection = selectSymbolRelations(
      snapshot([], []),
      'symbol:missing.ts#nope',
      'incoming',
      8,
    );
    expect(selection).toEqual({
      symbol: null,
      relations: [],
      truncated: false,
      total: 0,
    });
  });

  it('ignores call sites that never resolved and non-relation edges', () => {
    const target = symbol('symbol:src/target.ts#save', { path: 'src/target.ts' });
    const packageEdge: GraphEdge = {
      from: target.id,
      to: target.id,
      kind: 'package-imports',
      confidence: 'syntax',
    };
    const selection = selectSymbolRelations(
      snapshot([target], [packageEdge, { ...packageEdge, kind: 'contains' }]),
      target.id,
      'incoming',
      8,
    );
    expect(selection.relations).toEqual([]);
  });

  it('ignores an edge whose other endpoint is not in the symbol index', () => {
    const source = symbol('symbol:src/source.ts#run', { path: 'src/source.ts' });
    const target = symbol('symbol:src/target.ts#save', { path: 'src/target.ts' });
    const missingCaller: GraphEdge = {
      from: 'symbol:src/missing.ts#caller',
      to: target.id,
      kind: 'calls',
      confidence: 'syntax',
      atLine: 4,
    };
    const missingCallee: GraphEdge = {
      from: source.id,
      to: 'symbol:src/missing.ts#save',
      kind: 'calls',
      confidence: 'syntax',
      atLine: 6,
    };

    expect(
      selectSymbolRelations(
        snapshot([source, target], [missingCaller]),
        target.id,
        'incoming',
        8,
      ).relations,
    ).toEqual([]);
    expect(
      selectSymbolRelations(
        snapshot([source, target], [missingCallee]),
        source.id,
        'outgoing',
        8,
      ).relations,
    ).toEqual([]);
  });

  it('returns nothing for an unsupported direction', () => {
    // The public union has two directions; the service is defensive because a
    // future caller may pass a persisted value that predates validation.
    const target = symbol('symbol:src/target.ts#save', { path: 'src/target.ts' });
    const selection = selectSymbolRelations(
      snapshot(
        [target],
        [
          {
            from: target.id,
            to: target.id,
            kind: 'calls',
            confidence: 'syntax',
            atLine: 4,
          },
        ],
      ),
      target.id,
      'sideways' as unknown as 'incoming',
      8,
    );

    expect(selection.relations).toEqual([]);
  });

  it('orders same-path symbols at the same line by symbol id', () => {
    const target = symbol('symbol:src/target.ts#save', { path: 'src/target.ts' });
    const beta = symbol('symbol:src/a.ts#beta', {
      path: 'src/a.ts',
      startLine: 12,
    });
    const alpha = symbol('symbol:src/a.ts#alpha', {
      path: 'src/a.ts',
      startLine: 12,
    });
    const edges: GraphEdge[] = [
      { from: beta.id, to: target.id, kind: 'calls', confidence: 'syntax', atLine: 3 },
      { from: alpha.id, to: target.id, kind: 'calls', confidence: 'syntax', atLine: 8 },
    ];

    const forward = selectSymbolRelations(
      snapshot([target, beta, alpha], edges),
      target.id,
      'incoming',
      8,
    );
    const reversed = selectSymbolRelations(
      snapshot([target, alpha, beta], edges.toReversed()),
      target.id,
      'incoming',
      8,
    );

    expect(forward.relations.map((relation) => relation.symbol.id)).toEqual([
      alpha.id,
      beta.id,
    ]);
    expect(reversed.relations).toEqual(forward.relations);
  });
});
