import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../analyze.js';
import { buildProjectBrief } from '../brief.js';
import type { FileAnalysis } from '../types.js';
import { javaAnalyzer, resolveJavaImport } from './java.js';

const fixtureRoot = path.join(import.meta.dirname, '..', '..', 'fixtures', 'java');

async function parseFixture(relativePath: string): Promise<FileAnalysis> {
  await javaAnalyzer.prepare?.();
  const text = await readFile(path.join(fixtureRoot, relativePath), 'utf8');
  return javaAnalyzer.parse({
    path: relativePath,
    text,
    fileLanguage: 'java',
    language: 'java',
  });
}

function symbolNames(analysis: FileAnalysis): string[] {
  return analysis.symbols.map((symbol) => symbol.qualifiedName);
}

const GREETER = 'src/main/java/com/example/fixture/Greeter.java';

describe('java adapter', () => {
  it('extracts classes, interfaces, methods, constructors, and fields', async () => {
    const analysis = await parseFixture(GREETER);

    expect(symbolNames(analysis)).toContain('Greeter');
    expect(symbolNames(analysis)).toContain('Greeter.constructor');
    expect(symbolNames(analysis)).toContain('Greeter.greet');
    expect(symbolNames(analysis)).toContain('Greeter.count');
    expect(symbolNames(analysis)).toContain('Greeter.MAX_LENGTH');
    expect(symbolNames(analysis)).toContain('Greeter.store');

    const greets = await parseFixture('src/main/java/com/example/fixture/Greets.java');
    expect(symbolNames(greets)).toContain('Greets');
    expect(symbolNames(greets)).toContain('Greets.greet');
  });

  it('maps kinds, visibility, annotations, and docs', async () => {
    const analysis = await parseFixture(GREETER);
    const byName = new Map(
      analysis.symbols.map((symbol) => [symbol.qualifiedName, symbol]),
    );

    expect(byName.get('Greeter')?.kind).toBe('class');
    expect(byName.get('Greeter')?.exported).toBe(true);
    expect(byName.get('Greeter')?.documentation).toBe(
      'Builds greetings through a Store.',
    );
    expect(byName.get('Greeter')?.signature).toBe('class Greeter implements Greets');
    expect(byName.get('Greeter.greet')?.decorators).toContainEqual({
      name: 'Override',
      argument: null,
    });
    expect(byName.get('Greeter.greet')?.signature).toBe('String greet(String name)');
    expect(byName.get('Greeter.MAX_LENGTH')?.kind).toBe('property');
    expect(byName.get('Greeter.MAX_LENGTH')?.exported).toBe(false);
    expect(byName.get('Greeter.maxLength')?.exported).toBe(false);
    expect(byName.get('Greeter')?.language).toBe('java');

    const greets = await parseFixture('src/main/java/com/example/fixture/Greets.java');
    const greet = greets.symbols.find(
      (symbol) => symbol.qualifiedName === 'Greets.greet',
    );
    // Interface members are public without a modifier.
    expect(greet?.exported).toBe(true);
  });

  it('keeps overloaded members apart with their parameter types', async () => {
    const analysis = await javaAnalyzer.parse({
      path: 'src/Overloads.java',
      text: [
        'package demo;',
        'public class Overloads {',
        '  public Overloads() {}',
        '  public Overloads(String name) {}',
        '  public int size() { return 0; }',
        '  public int size(int scale) { return scale; }',
        '}',
      ].join('\n'),
      fileLanguage: 'java',
      language: 'java',
    });
    const names = analysis.symbols.map((symbol) => symbol.qualifiedName);

    expect(names).toContain('Overloads.constructor()');
    expect(names).toContain('Overloads.constructor(String)');
    expect(names).toContain('Overloads.size()');
    expect(names).toContain('Overloads.size(int)');
    const ids = analysis.symbols.map((symbol) => symbol.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('reads imports, including wildcards and static imports', async () => {
    const analysis = await parseFixture(GREETER);
    expect(analysis.imports).toContainEqual({
      specifier: 'com.example.fixture.store.Store',
      bindings: [{ imported: 'Store', local: 'Store' }],
    });

    const wildcard = await javaAnalyzer.parse({
      path: 'src/Wild.java',
      text: [
        'package demo;',
        'import java.util.*;',
        'import static java.lang.Math.max;',
        'class Wild {}',
      ].join('\n'),
      fileLanguage: 'java',
      language: 'java',
    });
    expect(wildcard.imports).toContainEqual({
      specifier: 'java.util',
      bindings: [],
    });
    expect(wildcard.imports).toContainEqual({
      specifier: 'java.lang.Math.max',
      bindings: [{ imported: 'max', local: 'max' }],
    });
  });

  it('marks a static main method as an entry point', async () => {
    const main = await parseFixture('src/main/java/com/example/fixture/Main.java');
    const library = await parseFixture(
      'src/main/java/com/example/fixture/store/Store.java',
    );

    expect(main.entryPoint).toBe(true);
    expect(library.entryPoint).toBe(false);
  });
});

describe('java import resolution', () => {
  const fileSet = new Set([
    'src/main/java/com/example/fixture/Greeter.java',
    'src/main/java/com/example/fixture/store/Store.java',
  ]);

  it('resolves a package-qualified class to its source file', () => {
    expect(
      resolveJavaImport(
        'src/main/java/com/example/fixture/Greeter.java',
        'com.example.fixture.store.Store',
        fileSet,
      ),
    ).toBe('src/main/java/com/example/fixture/store/Store.java');
  });

  it('leaves wildcards and platform packages external', () => {
    expect(resolveJavaImport('src/A.java', 'java.util', fileSet)).toBeNull();
    expect(javaAnalyzer.isExternal('java.util.List')).toBe(true);
    expect(javaAnalyzer.packageName('java.util.List')).toBe('java.util');
  });
});

describe('java snapshot', () => {
  it('builds the package graph, entry point, and dependency nodes', async () => {
    const snapshot = await analyzeProject(fixtureRoot);

    expect(snapshot.graph.entryPoints).toEqual([
      'src/main/java/com/example/fixture/Main.java',
    ]);
    expect(snapshot.graph.fileImports).toContainEqual({
      from: 'src/main/java/com/example/fixture/Greeter.java',
      to: 'src/main/java/com/example/fixture/store/Store.java',
      specifier: 'com.example.fixture.store.Store',
    });
    expect(snapshot.graph.packageImports).toContainEqual({
      from: 'src/main/java/com/example/fixture/Greeter.java',
      packageName: 'java.util',
      specifier: 'java.util.Objects',
    });
  });

  it('reads pom.xml for the brief', async () => {
    const snapshot = await analyzeProject(fixtureRoot);
    const manifest = snapshot.manifests.find((entry) => entry.path === 'pom.xml');

    expect(manifest?.buildSystem).toBe('maven');
    expect(manifest?.name).toBe('fixture');
    expect(manifest?.version).toBe('0.1.0');
    expect(manifest?.dependencies).toEqual([
      {
        name: 'org.junit.jupiter:junit-jupiter',
        version: '5.10.2',
        kind: 'dev',
      },
    ]);
  });

  it('summarizes packages in the brief', async () => {
    const snapshot = await analyzeProject(fixtureRoot);
    const brief = buildProjectBrief(snapshot);
    const java = brief.languageBriefs.find((entry) => entry.id === 'java');

    expect(java?.primary).toBe(true);
    expect(java?.buildSystems).toEqual(['maven']);
    expect(java?.entryPoints).toEqual(['src/main/java/com/example/fixture/Main.java']);
    expect(java?.modules.map((module) => module.name)).toEqual([
      'com.example.fixture',
      'com.example.fixture.store',
    ]);
    expect(java?.notableSymbols.map((symbol) => symbol.qualifiedName)).toContain(
      'Greeter',
    );
  });
});
