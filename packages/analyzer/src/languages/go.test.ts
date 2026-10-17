import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../analyze.js';
import { buildProjectBrief } from '../brief.js';
import type { FileAnalysis } from '../types.js';
import { goAnalyzer } from './go.js';

const fixtureRoot = path.join(import.meta.dirname, '..', '..', 'fixtures', 'go');

async function parseFixture(relativePath: string): Promise<FileAnalysis> {
  await goAnalyzer.prepare?.();
  const text = await readFile(path.join(fixtureRoot, relativePath), 'utf8');
  return goAnalyzer.parse({
    path: relativePath,
    text,
    fileLanguage: 'go',
    language: 'go',
  });
}

function symbolNames(analysis: FileAnalysis): string[] {
  return analysis.symbols.map((symbol) => symbol.qualifiedName);
}

describe('go adapter', () => {
  it('extracts packages, structs, interfaces, funcs, and methods', async () => {
    const analysis = await parseFixture('internal/greeter/greeter.go');

    expect(symbolNames(analysis)).toContain('MaxLength');
    expect(symbolNames(analysis)).toContain('ErrEmptyName');
    expect(symbolNames(analysis)).toContain('Store');
    expect(symbolNames(analysis)).toContain('Store.Save');
    expect(symbolNames(analysis)).toContain('Greeter');
    expect(symbolNames(analysis)).toContain('New');
    expect(symbolNames(analysis)).toContain('Greeter.Greet');
    expect(symbolNames(analysis)).toContain('Greet');
  });

  it('maps Go kinds and parents to the unified model', async () => {
    const analysis = await parseFixture('internal/greeter/greeter.go');
    const byName = new Map(
      analysis.symbols.map((symbol) => [symbol.qualifiedName, symbol]),
    );

    expect(byName.get('Store')?.kind).toBe('interface');
    expect(byName.get('Store.Save')?.kind).toBe('method');
    expect(byName.get('Store.Save')?.parentId).toBe(
      'symbol:internal/greeter/greeter.go#Store',
    );
    expect(byName.get('Greeter')?.kind).toBe('class');
    expect(byName.get('Greeter.Count')?.kind).toBe('property');
    expect(byName.get('Greeter.Greet')?.parentId).toBe(
      'symbol:internal/greeter/greeter.go#Greeter',
    );
    expect(byName.get('greetAll')?.kind).toBe('function');
    expect(byName.get('MaxLength')?.kind).toBe('variable');
    expect(byName.get('MaxLength')?.language).toBe('go');
  });

  it("applies Go's capitalisation export rule and doc comments", async () => {
    const analysis = await parseFixture('internal/greeter/greeter.go');
    const byName = new Map(
      analysis.symbols.map((symbol) => [symbol.qualifiedName, symbol]),
    );

    expect(byName.get('Greet')?.exported).toBe(true);
    expect(byName.get('greetAll')?.exported).toBe(false);
    expect(byName.get('Greeter.Count')?.documentation).toBeNull();
    expect(byName.get('Greet')?.documentation).toBe('Greet greets every name.');
  });

  it('reads grouped and single import declarations', async () => {
    const analysis = await parseFixture('internal/greeter/greeter.go');

    expect(analysis.imports).toContainEqual({
      specifier: 'fmt',
      bindings: [{ imported: 'fmt', local: 'fmt' }],
    });
    expect(analysis.imports).toContainEqual({
      specifier: 'example.com/fixture/internal/store',
      bindings: [{ imported: 'store', local: 'store' }],
    });

    const main = await parseFixture('cmd/fixture/main.go');
    expect(main.imports.map((entry) => entry.specifier)).toContain(
      'example.com/fixture/internal/greeter',
    );
  });

  it('marks a main package with func main as an entry point', async () => {
    const main = await parseFixture('cmd/fixture/main.go');
    const library = await parseFixture('internal/store/store.go');

    expect(main.entryPoint).toBe(true);
    expect(library.entryPoint).toBe(false);
  });
});

describe('go snapshot', () => {
  it('keeps Go imports external and finds the command entry point', async () => {
    const snapshot = await analyzeProject(fixtureRoot);

    expect(snapshot.graph.entryPoints).toEqual(['cmd/fixture/main.go']);
    // Go import paths name packages, never files.
    expect(snapshot.graph.fileImports).toEqual([]);
    expect(snapshot.graph.packageImports).toContainEqual({
      from: 'cmd/fixture/main.go',
      packageName: 'fmt',
      specifier: 'fmt',
    });
    expect(snapshot.graph.packageImports).toContainEqual({
      from: 'internal/greeter/greeter.go',
      packageName: 'example.com/fixture/internal/store',
      specifier: 'example.com/fixture/internal/store',
    });
  });

  it('reads go.mod for the brief', async () => {
    const snapshot = await analyzeProject(fixtureRoot);
    const manifest = snapshot.manifests.find((entry) => entry.path === 'go.mod');

    expect(manifest?.buildSystem).toBe('go modules');
    expect(manifest?.name).toBe('example.com/fixture');
    expect(manifest?.dependencies).toEqual([
      { name: 'github.com/google/uuid', version: 'v1.6.0', kind: 'runtime' },
    ]);
  });

  it('summarizes the Go module layout in the brief', async () => {
    const snapshot = await analyzeProject(fixtureRoot);
    const brief = buildProjectBrief(snapshot);
    const go = brief.languageBriefs.find((entry) => entry.id === 'go');

    expect(go?.primary).toBe(true);
    expect(go?.buildSystems).toEqual(['go modules']);
    expect(go?.entryPoints).toEqual(['cmd/fixture/main.go']);
    expect(go?.modules.map((module) => module.name)).toEqual([
      'fixture',
      'greeter',
      'store',
    ]);
    expect(go?.notableSymbols.map((symbol) => symbol.qualifiedName)).toContain('Greeter');
  });
});
