import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { analyzeProject } from './analyze.js';
import type { ProjectSnapshot } from './types.js';

const roots: string[] = [];

/**
 * A project small enough to count every call by hand. The fixture exercises the
 * resolution order the phase pins: same-file function, same-class method, typed
 * `this` member, constructor parameter property, aliased import, recursive
 * same-file call, and two deliberately unresolved calls.
 */
async function makeCallProject(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'sothspell-calls-'));
  roots.push(root);
  await mkdir(path.join(root, 'src'), { recursive: true });
  await writeFile(
    path.join(root, 'package.json'),
    JSON.stringify({ name: 'calls-fixture', version: '1.0.0' }),
  );
  await writeFile(
    path.join(root, 'src', 'math.ts'),
    [
      'export function double(value: number): number {',
      '  return value * 2;',
      '}',
      '',
      'export function factorial(n: number): number {',
      '  return n <= 1 ? 1 : n * factorial(n - 1);',
      '}',
    ].join('\n'),
  );
  await writeFile(
    path.join(root, 'src', 'store.ts'),
    [
      'export class Store {',
      '  save(id: string): string {',
      '    return id;',
      '  }',
      '',
      '  helper(): string {',
      "    return this.save('helper');",
      '  }',
      '}',
    ].join('\n'),
  );
  await writeFile(
    path.join(root, 'src', 'service.ts'),
    [
      "import { Store } from './store';",
      "import { double as twice } from './math';",
      '',
      'function helperFn(): void {}',
      '',
      'export class Service {',
      '  private readonly store: Store;',
      '',
      '  constructor(private readonly fallback: Store) {',
      '    this.store = fallback;',
      '  }',
      '',
      '  getStore(): Store {',
      '    return this.store;',
      '  }',
      '',
      '  run(value: string): string {',
      '    this.store.save(value);',
      '    this.fallback.save(value);',
      '    this.local();',
      '    twice(2);',
      '    this.getStore().save(value);',
      '    return this.store.helper();',
      '  }',
      '',
      '  private local(): void {}',
      '}',
      '',
      'export function main(): void {',
      '  helperFn();',
      '  mystery();',
      "  console.log('unresolved');",
      '}',
      '',
      'export const arrowRunner = (): void => {',
      '  helperFn();',
      '};',
      '',
      'export function duplicate(): void {',
      '  helperFn(); helperFn();',
      '}',
    ].join('\n'),
  );
  return root;
}

function callEdges(snapshot: ProjectSnapshot) {
  return snapshot.graph.edges.filter((edge) => edge.kind === 'calls');
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe('call-site extraction and resolution', () => {
  it('resolves same-file calls inside functions and arrow functions', async () => {
    const root = await makeCallProject();
    const snapshot = await analyzeProject(root);
    const edges = callEdges(snapshot);

    expect(edges).toContainEqual({
      from: 'symbol:src/service.ts#main',
      to: 'symbol:src/service.ts#helperFn',
      kind: 'calls',
      confidence: 'syntax',
      atLine: 30,
    });
    expect(edges).toContainEqual({
      from: 'symbol:src/service.ts#arrowRunner',
      to: 'symbol:src/service.ts#helperFn',
      kind: 'calls',
      confidence: 'syntax',
      atLine: 36,
    });
  });

  it('resolves same-class methods', async () => {
    const root = await makeCallProject();
    const snapshot = await analyzeProject(root);
    const edges = callEdges(snapshot);

    expect(edges).toContainEqual({
      from: 'symbol:src/store.ts#Store.helper',
      to: 'symbol:src/store.ts#Store.save',
      kind: 'calls',
      confidence: 'syntax',
      atLine: 7,
    });
    expect(edges).toContainEqual({
      from: 'symbol:src/service.ts#Service.run',
      to: 'symbol:src/service.ts#Service.local',
      kind: 'calls',
      confidence: 'syntax',
      atLine: 20,
    });
    // The chained receiver's own call is a same-class method too.
    expect(edges).toContainEqual({
      from: 'symbol:src/service.ts#Service.run',
      to: 'symbol:src/service.ts#Service.getStore',
      kind: 'calls',
      confidence: 'syntax',
      atLine: 22,
    });
  });

  it('follows a typed class field through an imported class', async () => {
    const root = await makeCallProject();
    const snapshot = await analyzeProject(root);
    const edges = callEdges(snapshot);

    expect(edges).toContainEqual({
      from: 'symbol:src/service.ts#Service.run',
      to: 'symbol:src/store.ts#Store.save',
      kind: 'calls',
      confidence: 'import',
      atLine: 18,
    });
  });

  it('follows a constructor parameter property type', async () => {
    const root = await makeCallProject();
    const snapshot = await analyzeProject(root);
    const edges = callEdges(snapshot);

    expect(edges).toContainEqual({
      from: 'symbol:src/service.ts#Service.run',
      to: 'symbol:src/store.ts#Store.save',
      kind: 'calls',
      confidence: 'import',
      atLine: 19,
    });
  });

  it('follows a same-class method return type', async () => {
    const root = await makeCallProject();
    const snapshot = await analyzeProject(root);
    const edges = callEdges(snapshot);

    expect(edges).toContainEqual({
      from: 'symbol:src/service.ts#Service.run',
      to: 'symbol:src/store.ts#Store.save',
      kind: 'calls',
      confidence: 'import',
      atLine: 22,
    });
  });

  it('resolves a renamed import to its exported symbol', async () => {
    const root = await makeCallProject();
    const snapshot = await analyzeProject(root);
    const edges = callEdges(snapshot);

    expect(edges).toContainEqual({
      from: 'symbol:src/service.ts#Service.run',
      to: 'symbol:src/math.ts#double',
      kind: 'calls',
      confidence: 'import',
      atLine: 21,
    });
  });

  it('keeps recursive calls as a self edge', async () => {
    const root = await makeCallProject();
    const snapshot = await analyzeProject(root);
    const edges = callEdges(snapshot);

    expect(edges).toContainEqual({
      from: 'symbol:src/math.ts#factorial',
      to: 'symbol:src/math.ts#factorial',
      kind: 'calls',
      confidence: 'syntax',
      atLine: 6,
    });
  });

  it('drops unresolved calls and counts them', async () => {
    const root = await makeCallProject();
    const snapshot = await analyzeProject(root);

    expect(snapshot.analysis.unresolvedCalls).toBe(2);
    expect(callEdges(snapshot).some((edge) => edge.to.includes('mystery'))).toBe(false);
    expect(callEdges(snapshot).some((edge) => edge.to.includes('console'))).toBe(false);
  });

  it('deduplicates call sites that resolve to the same line', async () => {
    const root = await makeCallProject();
    const snapshot = await analyzeProject(root);
    const duplicateEdges = callEdges(snapshot).filter(
      (edge) =>
        edge.from === 'symbol:src/service.ts#duplicate' &&
        edge.to === 'symbol:src/service.ts#helperFn',
    );

    expect(duplicateEdges).toEqual([
      {
        from: 'symbol:src/service.ts#duplicate',
        to: 'symbol:src/service.ts#helperFn',
        kind: 'calls',
        confidence: 'syntax',
        atLine: 40,
      },
    ]);
  });

  it('records the import statement line on imports and reference edges', async () => {
    const root = await makeCallProject();
    const snapshot = await analyzeProject(root);

    expect(snapshot.graph.fileImports).toContainEqual({
      from: 'src/service.ts',
      to: 'src/store.ts',
      specifier: './store',
      line: 1,
    });
    expect(snapshot.graph.edges).toContainEqual({
      from: 'symbol:src/service.ts',
      to: 'symbol:src/store.ts',
      kind: 'imports',
      confidence: 'syntax',
      line: 1,
    });
    expect(snapshot.graph.edges).toContainEqual({
      from: 'symbol:src/service.ts',
      to: 'symbol:src/store.ts#Store',
      kind: 'references',
      confidence: 'import',
      line: 1,
    });
    expect(snapshot.graph.edges).toContainEqual({
      from: 'symbol:src/service.ts',
      to: 'symbol:src/math.ts#double',
      kind: 'references',
      confidence: 'import',
      line: 2,
    });
  });

  it('is deterministic and keeps cached call sites', async () => {
    const root = await makeCallProject();
    const cacheDirectory = await mkdtemp(path.join(tmpdir(), 'sothspell-calls-cache-'));
    roots.push(cacheDirectory);

    const first = await analyzeProject(root, { cacheDirectory });
    const second = await analyzeProject(root, { cacheDirectory });

    expect(first.graph.edges).toEqual(second.graph.edges);
    expect(second.analysis.cacheHits).toBeGreaterThan(0);
    expect(second.analysis.unresolvedCalls).toBe(first.analysis.unresolvedCalls);
  });

  it('orders call edges deterministically by caller, target, kind, and line', async () => {
    const root = await makeCallProject();
    const snapshot = await analyzeProject(root);
    const calls = callEdges(snapshot);
    const sorted = calls.toSorted((left, right) => {
      const fromOrder = left.from.localeCompare(right.from);
      if (fromOrder !== 0) {
        return fromOrder;
      }
      const toOrder = left.to.localeCompare(right.to);
      if (toOrder !== 0) {
        return toOrder;
      }
      return (left.atLine ?? 0) - (right.atLine ?? 0);
    });

    expect(calls).toEqual(sorted);
  });
});
