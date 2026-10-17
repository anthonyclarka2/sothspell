import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../analyze.js';
import { buildProjectBrief } from '../brief.js';
import type { FileAnalysis } from '../types.js';
import { resolveRustImport, rustAnalyzer } from './rust.js';

const fixtureRoot = path.join(import.meta.dirname, '..', '..', 'fixtures', 'rust');

async function parseFixture(relativePath: string): Promise<FileAnalysis> {
  await rustAnalyzer.prepare?.();
  const text = await readFile(path.join(fixtureRoot, relativePath), 'utf8');
  return rustAnalyzer.parse({
    path: relativePath,
    text,
    fileLanguage: 'rust',
    language: 'rust',
  });
}

function symbolNames(analysis: FileAnalysis): string[] {
  return analysis.symbols.map((symbol) => symbol.qualifiedName);
}

describe('rust adapter', () => {
  it('extracts structs, enums, traits, impl methods, constants, and functions', async () => {
    const analysis = await parseFixture('src/greeter.rs');

    expect(symbolNames(analysis)).toContain('MAX_LENGTH');
    expect(symbolNames(analysis)).toContain('Greeter');
    expect(symbolNames(analysis)).toContain('State');
    expect(symbolNames(analysis)).toContain('Greets');
    expect(symbolNames(analysis)).toContain('Greets.greet');
    expect(symbolNames(analysis)).toContain('Greeter.new');
    expect(symbolNames(analysis)).toContain('Greeter.greet');
    expect(symbolNames(analysis)).toContain('helper');
  });

  it('maps kinds, visibility, attributes, and docs', async () => {
    const analysis = await parseFixture('src/greeter.rs');
    const byName = new Map(
      analysis.symbols.map((symbol) => [symbol.qualifiedName, symbol]),
    );

    expect(byName.get('Greeter')?.kind).toBe('class');
    expect(byName.get('Greeter')?.decorators).toContainEqual({
      name: 'derive',
      argument: 'Debug',
    });
    expect(byName.get('State')?.kind).toBe('enum');
    expect(byName.get('Greets')?.kind).toBe('interface');
    expect(byName.get('Greets.greet')?.kind).toBe('method');
    expect(byName.get('Greeter.new')?.parentId).toBe('symbol:src/greeter.rs#Greeter');
    expect(byName.get('Greeter.new')?.exported).toBe(true);
    expect(byName.get('helper')?.exported).toBe(false);
    expect(byName.get('MAX_LENGTH')?.documentation).toBe(
      'The longest greeting we build.',
    );
    expect(byName.get('MAX_LENGTH')?.language).toBe('rust');
  });

  it('drops a struct field that a method shadows, keeping ids unique', async () => {
    const analysis = await parseFixture('src/greeter.rs');
    const ids = analysis.symbols.map((symbol) => symbol.id);
    const countSymbols = analysis.symbols.filter(
      (symbol) => symbol.qualifiedName === 'Greeter.count',
    );

    expect(new Set(ids).size).toBe(ids.length);
    // The struct field and the trait impl method would share an id; the method
    // wins and the field's line stays reachable as a line-hint anchor.
    expect(countSymbols).toHaveLength(1);
    expect(countSymbols[0]?.kind).toBe('method');
  });

  it('reads use declarations, including grouped and aliased forms', async () => {
    const analysis = await parseFixture('src/greeter.rs');

    expect(analysis.imports).toContainEqual({
      specifier: 'crate::store::Store',
      bindings: [{ imported: 'Store', local: 'Store' }],
    });

    const inline = await parseFixture('src/lib.rs');
    expect(inline.imports).toContainEqual({ specifier: 'greeter', bindings: [] });
    expect(inline.imports).toContainEqual({
      specifier: 'greeter::Greeter',
      bindings: [{ imported: 'Greeter', local: 'Greeter' }],
    });
  });

  it('marks fn main as an entry point', async () => {
    const main = await parseFixture('src/main.rs');
    const library = await parseFixture('src/lib.rs');

    expect(main.entryPoint).toBe(true);
    expect(library.entryPoint).toBe(false);
  });
});

describe('rust import resolution', () => {
  const fileSet = new Set([
    'src/lib.rs',
    'src/main.rs',
    'src/greeter.rs',
    'src/store/mod.rs',
  ]);

  it('resolves a mod declaration to its file', () => {
    expect(resolveRustImport('src/lib.rs', 'greeter', fileSet)).toBe('src/greeter.rs');
    expect(resolveRustImport('src/lib.rs', 'store', fileSet)).toBe('src/store/mod.rs');
  });

  it('resolves crate and crate-relative paths', () => {
    expect(resolveRustImport('src/greeter.rs', 'crate::store::Store', fileSet)).toBe(
      'src/store/mod.rs',
    );
    expect(resolveRustImport('src/lib.rs', 'greeter::Greeter', fileSet)).toBe(
      'src/greeter.rs',
    );
  });

  it('keeps external crates external', () => {
    expect(resolveRustImport('src/main.rs', 'std::fmt::Display', fileSet)).toBeNull();
    expect(rustAnalyzer.isExternal('std::fmt::Display')).toBe(true);
    expect(rustAnalyzer.isExternal('crate::store::Store')).toBe(false);
    expect(rustAnalyzer.isExternal('greeter')).toBe(false);
  });
});

describe('rust snapshot', () => {
  it('builds module edges, entry points, and external crates', async () => {
    const snapshot = await analyzeProject(fixtureRoot);

    expect(snapshot.graph.entryPoints).toEqual(['src/main.rs']);
    expect(snapshot.graph.fileImports).toContainEqual({
      from: 'src/lib.rs',
      to: 'src/greeter.rs',
      specifier: 'greeter',
    });
    expect(snapshot.graph.fileImports).toContainEqual({
      from: 'src/greeter.rs',
      to: 'src/store/mod.rs',
      specifier: 'crate::store::Store',
    });
    expect(snapshot.graph.packageImports).toContainEqual({
      from: 'src/main.rs',
      packageName: 'fixture',
      specifier: 'fixture::greeter::Greeter',
    });
  });

  it('reads Cargo.toml for the brief', async () => {
    const snapshot = await analyzeProject(fixtureRoot);
    const manifest = snapshot.manifests.find((entry) => entry.path === 'Cargo.toml');

    expect(manifest?.buildSystem).toBe('cargo');
    expect(manifest?.name).toBe('fixture');
    expect(manifest?.version).toBe('0.1.0');
    expect(manifest?.entryPoints).toEqual(['fixture']);
    expect(manifest?.dependencies).toContainEqual({
      name: 'serde',
      version: '1.0',
      kind: 'runtime',
    });
    expect(manifest?.dependencies).toContainEqual({
      name: 'pretty_assertions',
      version: '1.4',
      kind: 'dev',
    });
  });

  it('summarizes the crate layout in the brief', async () => {
    const snapshot = await analyzeProject(fixtureRoot);
    const brief = buildProjectBrief(snapshot);
    const rust = brief.languageBriefs.find((entry) => entry.id === 'rust');

    expect(rust?.primary).toBe(true);
    expect(rust?.buildSystems).toEqual(['cargo']);
    expect(rust?.entryPoints).toEqual(['fixture', 'src/main.rs']);
    expect(rust?.modules.map((module) => module.name)).toEqual([
      'crate',
      'greeter',
      'store',
    ]);
    expect(rust?.notableSymbols.map((symbol) => symbol.qualifiedName)).toContain(
      'Greeter',
    );
  });
});
