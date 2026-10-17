import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../analyze.js';
import { buildProjectBrief } from '../brief.js';
import type { FileAnalysis } from '../types.js';
import { pythonAnalyzer, resolvePythonImport } from './python.js';

const fixtureRoot = path.join(import.meta.dirname, '..', '..', 'fixtures', 'python');

async function parseFixture(relativePath: string): Promise<FileAnalysis> {
  await pythonAnalyzer.prepare?.();
  const text = await readFile(path.join(fixtureRoot, relativePath), 'utf8');
  return pythonAnalyzer.parse({
    path: relativePath,
    text,
    fileLanguage: 'python',
    language: 'python',
  });
}

function symbolNames(analysis: FileAnalysis): string[] {
  return analysis.symbols.map((symbol) => symbol.qualifiedName);
}

describe('python adapter', () => {
  it('extracts classes, methods, properties, functions, and module variables', async () => {
    const analysis = await parseFixture('src/fixture/greeter.py');

    expect(symbolNames(analysis)).toContain('Greeter');
    expect(symbolNames(analysis)).toContain('Greeter.greet');
    expect(symbolNames(analysis)).toContain('Greeter.count');
    expect(symbolNames(analysis)).toContain('greet');
    expect(symbolNames(analysis)).toContain('MAX_LENGTH');
    expect(symbolNames(analysis)).toContain('_secret_helper');
  });

  it('maps kinds, decorators, parents, and docstrings', async () => {
    const analysis = await parseFixture('src/fixture/greeter.py');
    const byName = new Map(
      analysis.symbols.map((symbol) => [symbol.qualifiedName, symbol]),
    );

    expect(byName.get('Greeter')?.kind).toBe('class');
    expect(byName.get('Greeter')?.documentation).toBe(
      'Builds greetings through a Store.',
    );
    expect(byName.get('Greeter.greet')?.kind).toBe('method');
    expect(byName.get('Greeter.greet')?.parentId).toBe(
      'symbol:src/fixture/greeter.py#Greeter',
    );
    // `@property` is a real member kind in the unified model.
    expect(byName.get('Greeter.count')?.kind).toBe('property');
    expect(byName.get('_secret_helper')?.exported).toBe(false);
    expect(byName.get('greet')?.exported).toBe(true);
    expect(byName.get('greet')?.language).toBe('python');
  });

  it('keeps class decorators and their arguments', async () => {
    const analysis = await parseFixture('src/fixture/store.py');
    const store = analysis.symbols.find((symbol) => symbol.qualifiedName === 'Store');

    expect(store?.decorators).toContainEqual({ name: 'dataclass', argument: null });
    expect(store?.kind).toBe('class');
  });

  it('does not record locals inside function bodies', async () => {
    const analysis = await parseFixture('src/fixture/greeter.py');

    expect(symbolNames(analysis)).not.toContain('Greeter.greet.message');
  });

  it('reads relative imports with their bindings', async () => {
    const analysis = await parseFixture('src/fixture/greeter.py');

    expect(analysis.imports).toContainEqual({
      specifier: '.store',
      bindings: [{ imported: 'Store', local: 'Store' }],
    });
  });

  it('reads absolute imports and star imports', async () => {
    const store = await parseFixture('src/fixture/store.py');
    expect(store.imports).toContainEqual({
      specifier: 'dataclasses',
      bindings: [
        { imported: 'dataclass', local: 'dataclass' },
        { imported: 'field', local: 'field' },
      ],
    });
  });

  it('marks a __main__ guard as an entry point', async () => {
    const analysis = await parseFixture('src/fixture/__main__.py');

    expect(analysis.entryPoint).toBe(true);
  });
});

describe('python import resolution', () => {
  const fileSet = new Set([
    'src/fixture/__init__.py',
    'src/fixture/greeter.py',
    'src/fixture/store.py',
  ]);

  it('resolves a relative module import', () => {
    expect(resolvePythonImport('src/fixture/greeter.py', '.store', fileSet)).toBe(
      'src/fixture/store.py',
    );
  });

  it('resolves a package-relative import to __init__.py', () => {
    expect(resolvePythonImport('src/fixture/greeter.py', '.', fileSet)).toBe(
      'src/fixture/__init__.py',
    );
  });

  it('resolves an absolute import against a source root', () => {
    expect(resolvePythonImport('tests/test_greeter.py', 'fixture.greeter', fileSet)).toBe(
      'src/fixture/greeter.py',
    );
  });

  it('returns null for a dependency that is not a project file', () => {
    expect(resolvePythonImport('src/fixture/store.py', 'os.path', fileSet)).toBeNull();
    expect(pythonAnalyzer.isExternal('os')).toBe(true);
    expect(pythonAnalyzer.isExternal('.store')).toBe(false);
  });
});

describe('python snapshot', () => {
  it('builds the file graph, entry points, and language mix', async () => {
    const snapshot = await analyzeProject(fixtureRoot);

    expect(snapshot.graph.fileImports).toContainEqual({
      from: 'src/fixture/greeter.py',
      to: 'src/fixture/store.py',
      specifier: '.store',
    });
    expect(snapshot.graph.entryPoints).toEqual(['src/fixture/__main__.py']);
    expect(snapshot.graph.packageImports).toContainEqual({
      from: 'src/fixture/store.py',
      packageName: 'dataclasses',
      specifier: 'dataclasses',
    });
    const python = snapshot.languages.find((entry) => entry.language === 'python');
    expect(python?.id).toBe('python');
    expect(python?.primary).toBe(true);
    expect(snapshot.analysis.languageRuntimes).toContainEqual(
      expect.objectContaining({ id: 'python', abiVersion: 14 }),
    );
  });

  it('reads the pyproject manifest the brief needs', async () => {
    const snapshot = await analyzeProject(fixtureRoot);
    const manifest = snapshot.manifests.find((entry) => entry.path === 'pyproject.toml');

    expect(manifest?.buildSystem).toBe('hatchling');
    expect(manifest?.name).toBe('fixture');
    expect(manifest?.version).toBe('0.1.0');
    expect(manifest?.entryPoints).toEqual(['fixture']);
    expect(manifest?.dependencies).toContainEqual({
      name: 'httpx',
      version: '>=0.27',
      kind: 'runtime',
    });
    expect(manifest?.dependencies).toContainEqual({
      name: 'pytest',
      version: '>=8',
      kind: 'dev',
    });
  });

  it('collects reStructuredText docs through the adapter', async () => {
    const snapshot = await analyzeProject(fixtureRoot);
    const doc = snapshot.docs.find((entry) => entry.path === 'docs/index.rst');

    expect(doc?.title).toBe('Fixture');
    expect(doc?.summary).toBe(
      'A hand-written Python fixture used by the analyzer tests.',
    );
  });

  it('summarizes the language in the project brief', async () => {
    const snapshot = await analyzeProject(fixtureRoot);
    const brief = buildProjectBrief(snapshot);
    const python = brief.languageBriefs.find((entry) => entry.id === 'python');

    expect(python?.primary).toBe(true);
    expect(python?.buildSystems).toEqual(['hatchling']);
    expect(python?.manifests).toEqual(['pyproject.toml']);
    expect(python?.entryPoints).toContain('src/fixture/__main__.py');
    expect(python?.modules.map((module) => module.name)).toEqual([
      'fixture',
      'test_greeter',
    ]);
    expect(python?.notableSymbols.map((symbol) => symbol.qualifiedName)).toContain(
      'Greeter',
    );
    expect(python?.risks.length).toBeGreaterThan(0);
  });
});
