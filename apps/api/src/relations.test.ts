import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { CanvasRelationResponse } from '@sothspell/canvas';
import { parseSothspell, hashText } from '@sothspell/core';
import {
  ANALYZER_VERSION,
  analyzeProject,
  saveSnapshot,
  snapshotPathFor,
  type ProjectSnapshot,
} from '@sothspell/analyzer';
import { createApp } from './app.js';
import {
  MAX_EXCERPT_LINES,
  MAX_RELATION_LIMIT,
  createRelationService,
} from './relations.js';

const roots: string[] = [];
const originalHome = process.env.SOTHSPELL_HOME;
const originalProjectRoot = process.env.SOTHSPELL_PROJECT_ROOT;

const tourId = 'tour_relation_fixture';

interface Fixture {
  root: string;
  home: string;
  slug: string;
  snapshot: ProjectSnapshot;
}

async function temporaryDirectory(prefix: string): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), prefix));
  roots.push(directory);
  return directory;
}

function mathSource(): string {
  return [
    'export function add(left: number, right: number): number {',
    '  return left + right;',
    '}',
    '',
    'export function double(value: number): number {',
    '  return add(value, value);',
    '}',
    '',
    'export function helper(): void {}',
    '',
    'export class Calculator {',
    '  addOne(value: number): number {',
    '    return value + 1;',
    '  }',
    '',
    '  twice(value: number): number {',
    '    return this.addOne(this.addOne(value));',
    '  }',
    '}',
  ].join('\n');
}

function useSource(): string {
  return [
    "import { double, helper } from './math.js';",
    '',
    'export function run(): number {',
    '  return double(2);',
    '}',
    '',
    'export function later(): void {',
    '  void helper;',
    '}',
  ].join('\n');
}

async function makeFixture(): Promise<Fixture> {
  const root = await temporaryDirectory('sothspell-relations-project-');
  await mkdir(path.join(root, 'src'), { recursive: true });
  await writeFile(
    path.join(root, 'package.json'),
    JSON.stringify({ name: 'relation-fixture' }),
  );
  await writeFile(path.join(root, 'src', 'math.ts'), `${mathSource()}\n`);
  await writeFile(path.join(root, 'src', 'use.ts'), `${useSource()}\n`);
  await writeFile(
    path.join(root, 'src', 'big.ts'),
    [
      'export function big(): number {',
      ...Array.from(
        { length: 200 },
        (_value, index) => `  const value${index} = ${index};`,
      ),
      '  return 0;',
      '}',
      '',
    ].join('\n'),
  );
  await writeFile(
    path.join(root, 'src', 'secret.ts'),
    "export const API_KEY = 'abcdefghijklmnop1234';\n",
  );
  // One symbol with three lines that individually exceed the container budget
  // proves the excerpt window shrinks around a focus line without dropping it.
  await writeFile(
    path.join(root, 'src', 'wide.ts'),
    [
      `export function wide(/* ${'x'.repeat(12 * 1024)} */): string {`,
      `  return "${'w'.repeat(12 * 1024)}";`,
      '}',
      '',
    ].join('\n'),
  );
  // A single line larger than MAX_CONTAINER_BYTES cannot produce a container.
  await writeFile(
    path.join(root, 'src', 'huge.ts'),
    `export function huge(): string { return "${'h'.repeat(20 * 1024)}"; }\n`,
  );
  const manyNames = Array.from({ length: 60 }, (_value, index) => `name${index}`);
  await writeFile(
    path.join(root, 'src', 'many.ts'),
    [
      ...manyNames.map((name) => `export const ${name} = 1;`),
      '',
      'export function many(): number {',
      `  return ${manyNames.join(' + ')};`,
      '}',
      '',
    ].join('\n'),
  );

  const snapshot = await analyzeProject(root);
  const home = await temporaryDirectory('sothspell-relations-home-');
  process.env.SOTHSPELL_HOME = home;

  await saveSnapshot(snapshot, snapshotPathFor(home, snapshot.project.slug));
  const projectDirectory = path.join(home, 'projects', snapshot.project.slug);
  await writeFile(
    path.join(projectDirectory, 'project.json'),
    `${JSON.stringify(
      {
        slug: snapshot.project.slug,
        name: snapshot.project.name,
        sourceRoot: root,
        sourceKind: 'local',
        revision: snapshot.revision,
        updatedAt: new Date().toISOString(),
      },
      null,
      2,
    )}\n`,
    'utf8',
  );

  const mathExcerpt = mathSource().split('\n').slice(0, 2).join('\n');
  const document = parseSothspell({
    schemaVersion: '1.2.0',
    id: tourId,
    title: 'Relations fixture',
    subtitle: 'A small project used to prove the relation API',
    audience: 'new-contributor',
    locale: 'en',
    project: {
      slug: snapshot.project.slug,
      name: snapshot.project.name,
      revision: {
        commit: snapshot.revision.commit ?? 'test',
        branch: snapshot.revision.branch,
        dirty: snapshot.revision.dirty,
      },
    },
    chapters: [
      {
        id: 'chapter_one',
        title: 'Relations',
        summary: 'One chapter with the anchors the relation routes need.',
        diagrams: [
          {
            id: 'diagram_one',
            kind: 'architecture',
            title: 'Relations',
            nodes: [{ id: 'node_math', label: 'Math', type: 'file' }],
            edges: [],
          },
        ],
        beats: [
          {
            id: 'beat_one',
            title: 'Relations',
            narration:
              'This fixture gives the relation route enough anchors to resolve a project record.',
            durationMs: 8000,
            anchors: [
              {
                id: 'anchor_math',
                path: 'src/math.ts',
                symbol: 'double',
                lines: { start: 1, end: 2 },
                contentHash: hashText(mathExcerpt),
                excerpt: mathExcerpt,
                language: 'typescript',
              },
              {
                id: 'anchor_secret',
                path: 'src/secret.ts',
                lines: { start: 1, end: 1 },
                contentHash: hashText("export const API_KEY = 'abcdefghijklmnop1234';"),
                excerpt: "export const API_KEY = 'abcdefghijklmnop1234';",
                language: 'typescript',
              },
            ],
            stage: { anchorIds: ['anchor_math'], diagramId: 'diagram_one' },
          },
        ],
      },
    ],
  });
  const tourDirectory = path.join(projectDirectory, 'tours', tourId);
  await mkdir(tourDirectory, { recursive: true });
  await writeFile(
    path.join(tourDirectory, 'tour.json'),
    `${JSON.stringify(document, null, 2)}\n`,
    'utf8',
  );

  return { root, home, slug: snapshot.project.slug, snapshot };
}

function appFor(projectRoot: string | null = null) {
  const previous = process.env.SOTHSPELL_PROJECT_ROOT;
  delete process.env.SOTHSPELL_PROJECT_ROOT;
  const app = createApp({ databasePath: ':memory:', projectRoot });
  if (previous !== undefined) {
    process.env.SOTHSPELL_PROJECT_ROOT = previous;
  }
  return app;
}

async function relation(
  app: ReturnType<typeof createApp>,
  query: Record<string, string | number | undefined>,
): Promise<Response> {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      search.set(key, String(value));
    }
  }
  return app.request(`/api/tours/${tourId}/canvas/symbol?${search.toString()}`);
}

async function readSavedSnapshot(fixture: Fixture): Promise<ProjectSnapshot> {
  return JSON.parse(
    await readFile(snapshotPathFor(fixture.home, fixture.slug), 'utf8'),
  ) as ProjectSnapshot;
}

async function writeSavedSnapshot(
  fixture: Fixture,
  snapshot: ProjectSnapshot,
): Promise<void> {
  await writeFile(
    snapshotPathFor(fixture.home, fixture.slug),
    `${JSON.stringify(snapshot, null, 2)}\n`,
    'utf8',
  );
}

function symbolById(snapshot: ProjectSnapshot, id: string) {
  const symbol = snapshot.symbols.find((candidate) => candidate.id === id);
  if (!symbol) {
    throw new Error(`fixture symbol ${id} is missing`);
  }
  return symbol;
}

afterEach(async () => {
  if (originalHome === undefined) {
    delete process.env.SOTHSPELL_HOME;
  } else {
    process.env.SOTHSPELL_HOME = originalHome;
  }
  if (originalProjectRoot === undefined) {
    delete process.env.SOTHSPELL_PROJECT_ROOT;
  } else {
    process.env.SOTHSPELL_PROJECT_ROOT = originalProjectRoot;
  }
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe('canvas relation API', () => {
  it('returns a definition container with no relations', async () => {
    const fixture = await makeFixture();
    const response = await relation(appFor(), {
      symbolId: 'symbol:src/math.ts#double',
      direction: 'definition',
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as CanvasRelationResponse;
    expect(body.available).toBe(true);
    expect(body.direction).toBe('definition');
    expect(body.symbol.id).toBe('symbol:src/math.ts#double');
    expect(body.container.path).toBe('src/math.ts');
    expect(body.container.excerpt).toContain('export function double');
    expect(body.container.html).toContain('shiki');
    expect(body.relations).toEqual([]);
    expect(body.identifierTargets).toContainEqual({
      text: 'add',
      symbolId: 'symbol:src/math.ts#add',
      path: 'src/math.ts',
    });
    expect(JSON.stringify(body)).not.toContain(fixture.root);
  });

  it('caps identifier targets at 50 distinct symbols', async () => {
    await makeFixture();
    const response = await relation(appFor(), {
      symbolId: 'symbol:src/many.ts#many',
      direction: 'definition',
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as CanvasRelationResponse;
    expect(body.identifierTargets).toHaveLength(50);
    expect(new Set(body.identifierTargets.map((target) => target.text)).size).toBe(50);
    const excerptBytes = Buffer.byteLength(body.container.excerpt, 'utf8');
    expect(excerptBytes).toBeLessThanOrEqual(64 * 1024);
  });

  it('returns incoming callers before importer references', async () => {
    await makeFixture();
    const response = await relation(appFor(), {
      symbolId: 'symbol:src/math.ts#double',
      direction: 'incoming',
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as CanvasRelationResponse;
    expect(body.relations.length).toBeGreaterThanOrEqual(2);
    expect(body.relations[0]).toMatchObject({
      relation: 'calls',
      confidence: 'import',
      symbol: { id: 'symbol:src/use.ts#run', path: 'src/use.ts' },
    });
    expect(body.relations[0]?.container.excerpt).toContain('double(2)');
    expect(body.relations).toContainEqual(
      expect.objectContaining({
        relation: 'references',
        symbol: expect.objectContaining({ id: 'symbol:src/use.ts' }),
      }),
    );
  });

  it('returns outgoing callees labelled by the edge the analyzer proved', async () => {
    await makeFixture();
    const response = await relation(appFor(), {
      symbolId: 'symbol:src/math.ts#double',
      direction: 'outgoing',
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as CanvasRelationResponse;
    expect(body.relations).toEqual([
      expect.objectContaining({
        relation: 'calls',
        confidence: 'syntax',
        symbol: expect.objectContaining({ id: 'symbol:src/math.ts#add' }),
      }),
    ]);
  });

  it('falls back to references and imports when no call exists', async () => {
    await makeFixture();
    const app = appFor();

    const reference = await relation(app, {
      symbolId: 'symbol:src/math.ts#helper',
      direction: 'incoming',
    });
    expect(reference.status).toBe(200);
    const referenceBody = (await reference.json()) as CanvasRelationResponse;
    expect(referenceBody.relations).toEqual([
      expect.objectContaining({
        relation: 'references',
        confidence: 'import',
        symbol: expect.objectContaining({ id: 'symbol:src/use.ts' }),
      }),
    ]);

    const imported = await relation(app, {
      symbolId: 'symbol:src/math.ts',
      direction: 'incoming',
    });
    expect(imported.status).toBe(200);
    const importedBody = (await imported.json()) as CanvasRelationResponse;
    expect(importedBody.relations).toEqual([
      expect.objectContaining({
        relation: 'imports',
        symbol: expect.objectContaining({ id: 'symbol:src/use.ts' }),
      }),
    ]);
  });

  it('resolves a legacy symbol by exact path and qualified name', async () => {
    await makeFixture();
    const response = await relation(appFor(), {
      path: 'src/math.ts',
      symbol: 'double',
      direction: 'definition',
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as CanvasRelationResponse;
    expect(body.symbol.id).toBe('symbol:src/math.ts#double');
  });

  it('caps the limit and honours the offset deterministically', async () => {
    await makeFixture();
    const app = appFor();

    const first = await relation(app, {
      symbolId: 'symbol:src/math.ts#double',
      direction: 'incoming',
      limit: 1,
    });
    const firstBody = (await first.json()) as CanvasRelationResponse;
    expect(first.status).toBe(200);
    expect(firstBody.relations).toHaveLength(1);
    expect(firstBody.truncated).toBe(true);

    const second = await relation(app, {
      symbolId: 'symbol:src/math.ts#double',
      direction: 'incoming',
      limit: 1,
      offset: 1,
    });
    const secondBody = (await second.json()) as CanvasRelationResponse;
    expect(second.status).toBe(200);
    expect(secondBody.relations).toHaveLength(1);
    expect(secondBody.truncated).toBe(false);
    expect(secondBody.relations[0]?.symbol.id).not.toBe(
      firstBody.relations[0]?.symbol.id,
    );

    const capped = await relation(app, {
      symbolId: 'symbol:src/math.ts#double',
      direction: 'incoming',
      limit: 99,
    });
    const cappedBody = (await capped.json()) as CanvasRelationResponse;
    expect(cappedBody.relations.length).toBeLessThanOrEqual(MAX_RELATION_LIMIT);
  });

  it('truncates a definition that is longer than the excerpt cap', async () => {
    await makeFixture();
    const response = await relation(appFor(), {
      symbolId: 'symbol:src/big.ts#big',
      direction: 'definition',
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as CanvasRelationResponse;
    expect(body.truncated).toBe(true);
    expect(body.container.endLine - body.container.startLine + 1).toBeLessThanOrEqual(
      MAX_EXCERPT_LINES,
    );
  });

  it('returns the same ordered payload for the same request', async () => {
    await makeFixture();
    const app = appFor();
    const query = {
      symbolId: 'symbol:src/math.ts#double',
      direction: 'incoming',
    };

    const first = await (await relation(app, query)).text();
    const second = await (await relation(app, query)).text();
    expect(second).toBe(first);
  });

  it('re-analyzes when the saved snapshot is missing, once per root', async () => {
    const fixture = await makeFixture();
    await rm(snapshotPathFor(fixture.home, fixture.slug), { force: true });
    let analyses = 0;
    const service = createRelationService({
      home: fixture.home,
      analysisCacheDirectory: path.join(fixture.home, 'cache', 'analysis'),
      analyze: async (root, options) => {
        analyses += 1;
        return analyzeProject(root, options);
      },
    });
    const app = createApp({
      databasePath: ':memory:',
      relationService: service,
    });

    const first = await relation(app, {
      symbolId: 'symbol:src/math.ts#double',
      direction: 'definition',
    });
    const second = await relation(app, {
      symbolId: 'symbol:src/math.ts#double',
      direction: 'definition',
    });

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(analyses).toBe(1);
  });

  it('rejects a stale-version snapshot and analyzes the root instead', async () => {
    const fixture = await makeFixture();
    const stale = { ...fixture.snapshot, analyzerVersion: '0.0.1' };
    await writeFile(
      snapshotPathFor(fixture.home, fixture.slug),
      `${JSON.stringify(stale, null, 2)}\n`,
      'utf8',
    );
    let analyses = 0;
    const service = createRelationService({
      home: fixture.home,
      analyze: async (root, options) => {
        analyses += 1;
        return analyzeProject(root, options);
      },
    });
    const app = createApp({
      databasePath: ':memory:',
      relationService: service,
    });

    const live = await relation(app, {
      symbolId: 'symbol:src/math.ts#double',
      direction: 'definition',
    });
    expect(live.status).toBe(200);
    expect(analyses).toBe(1);

    const staleOnly = await relation(app, {
      symbolId: 'symbol:src/math.ts#not-in-current-analysis',
      direction: 'definition',
    });
    expect(staleOnly.status).toBe(404);
  });

  it('returns unavailable when the snapshot is stale and no root resolves', async () => {
    const fixture = await makeFixture();
    const stale = { ...fixture.snapshot, analyzerVersion: '0.0.1' };
    await writeFile(
      snapshotPathFor(fixture.home, fixture.slug),
      `${JSON.stringify(stale, null, 2)}\n`,
      'utf8',
    );
    await rm(path.join(fixture.home, 'projects', fixture.slug, 'project.json'));

    const response = await relation(appFor(), {
      symbolId: 'symbol:src/math.ts#double',
      direction: 'definition',
    });
    expect(response.status).toBe(409);
  });

  it('returns 409 when the record is missing and no root is configured', async () => {
    const fixture = await makeFixture();
    await rm(path.join(fixture.home, 'projects', fixture.slug, 'project.json'));

    const response = await relation(appFor(), {
      symbolId: 'symbol:src/math.ts#double',
      direction: 'definition',
    });
    expect(response.status).toBe(409);
  });

  it('returns 409 for a redacted source file', async () => {
    await makeFixture();
    const response = await relation(appFor(), {
      symbolId: 'symbol:src/secret.ts#API_KEY',
      direction: 'definition',
    });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringMatching(/redacted/i),
    });
  });

  it('rejects a symbol path that escapes the project root', async () => {
    const fixture = await makeFixture();
    const snapshot = JSON.parse(
      await readFile(snapshotPathFor(fixture.home, fixture.slug), 'utf8'),
    ) as ProjectSnapshot;
    snapshot.symbols.push({
      id: 'symbol:../outside.ts#evil',
      kind: 'function',
      name: 'evil',
      qualifiedName: 'evil',
      path: '../outside.ts',
      startLine: 1,
      endLine: 2,
      exported: true,
      parentId: null,
      decorators: [],
      signature: '',
      documentation: null,
      language: 'typescript',
    });
    await writeFile(
      snapshotPathFor(fixture.home, fixture.slug),
      `${JSON.stringify(snapshot, null, 2)}\n`,
      'utf8',
    );

    const response = await relation(appFor(), {
      symbolId: 'symbol:../outside.ts#evil',
      direction: 'definition',
    });
    expect(response.status).toBe(400);
  });

  it('returns 404 for unknown tours and symbols', async () => {
    await makeFixture();
    const unknownTour = await appFor().request(
      '/api/tours/tour_missing/canvas/symbol?symbolId=symbol%3Asrc%2Fmath.ts%23double',
    );
    expect(unknownTour.status).toBe(404);

    const unknownSymbol = await relation(appFor(), {
      symbolId: 'symbol:src/math.ts#missing',
      direction: 'definition',
    });
    expect(unknownSymbol.status).toBe(404);
  });

  it('rejects malformed relation input with 400', async () => {
    await makeFixture();
    const app = appFor();

    for (const query of [
      { symbolId: 'symbol:src/math.ts#double', direction: 'sideways' },
      { symbolId: 'symbol:src/math.ts#double', limit: 'many' },
      { symbolId: 'symbol:src/math.ts#double', offset: -1 },
      { direction: 'definition' },
      { path: 'src/math.ts', direction: 'definition' },
    ]) {
      const response = await relation(app, query);
      expect(response.status, JSON.stringify(query)).toBe(400);
    }
  });

  it('keeps a stale analyzer version out of the response contract', async () => {
    const fixture = await makeFixture();
    expect(fixture.snapshot.analyzerVersion).toBe(ANALYZER_VERSION);
  });

  it('rejects incomplete selectors before reading a project', async () => {
    const service = createRelationService({
      home: path.join(tmpdir(), 'sothspell-relations-unused'),
    });

    await expect(
      service.load({
        slug: 'fixture',
        root: null,
        direction: 'definition',
        limit: 8,
        offset: 0,
      }),
    ).rejects.toThrow(/symbolId, or both path and symbol/u);
    await expect(
      service.load({
        slug: 'fixture',
        root: null,
        direction: 'definition',
        symbolId: 'symbol:src/math.ts#double',
        symbol: 'double',
        limit: 8,
        offset: 0,
      }),
    ).rejects.toThrow(/path is required when symbol is given/u);
    await expect(
      service.load({
        slug: 'fixture',
        root: null,
        direction: 'definition',
        symbolId: 'symbol:src/math.ts#double',
        path: 'src/math.ts',
        limit: 8,
        offset: 0,
      }),
    ).rejects.toThrow(/symbol is required when path is given/u);
  });

  it('resolves a legacy symbol id and rejects a malformed one', async () => {
    await makeFixture();
    const app = appFor();

    const legacy = await relation(app, {
      symbolId: 'legacy:src/math.ts#double',
      direction: 'definition',
    });
    expect(legacy.status).toBe(200);
    const body = (await legacy.json()) as CanvasRelationResponse;
    expect(body.symbol.id).toBe('symbol:src/math.ts#double');

    for (const symbolId of ['legacy:nohash', 'legacy:#double']) {
      const malformed = await relation(app, { symbolId, direction: 'definition' });
      expect(malformed.status, symbolId).toBe(404);
    }
  });

  it('returns unavailable when a saved symbol has no readable source file', async () => {
    const fixture = await makeFixture();
    const snapshot = await readSavedSnapshot(fixture);
    snapshot.symbols.push({
      id: 'symbol:src/missing.ts#gone',
      kind: 'function',
      name: 'gone',
      qualifiedName: 'gone',
      path: 'src/missing.ts',
      startLine: 1,
      endLine: 2,
      exported: true,
      parentId: null,
      decorators: [],
      signature: '',
      documentation: null,
      language: 'typescript',
    });
    await writeSavedSnapshot(fixture, snapshot);

    const response = await relation(appFor(), {
      symbolId: 'symbol:src/missing.ts#gone',
      direction: 'definition',
    });
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringMatching(/cannot be read/u),
    });
  });

  it('rechecks redaction on source text even when the file entry is not flagged', async () => {
    const fixture = await makeFixture();
    const snapshot = await readSavedSnapshot(fixture);
    const secret = snapshot.files.find((file) => file.path === 'src/secret.ts');
    expect(secret?.redacted).toBe(true);
    if (secret) {
      secret.redacted = false;
    }
    await writeSavedSnapshot(fixture, snapshot);

    const response = await relation(appFor(), {
      symbolId: 'symbol:src/secret.ts#API_KEY',
      direction: 'definition',
    });
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringMatching(/redacted/u),
    });
  });

  it('centres a long relation excerpt on the call line', async () => {
    const fixture = await makeFixture();
    const snapshot = await readSavedSnapshot(fixture);
    const big = symbolById(snapshot, 'symbol:src/big.ts#big');
    snapshot.graph.edges.push({
      from: big.id,
      to: 'symbol:src/math.ts#double',
      kind: 'calls',
      confidence: 'syntax',
      atLine: 100,
    });
    await writeSavedSnapshot(fixture, snapshot);

    const response = await relation(appFor(), {
      symbolId: 'symbol:src/math.ts#double',
      direction: 'incoming',
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as CanvasRelationResponse;
    const caller = body.relations.find((item) => item.symbol.id === big.id);
    expect(caller).toBeDefined();
    expect(caller!.container.startLine).toBeGreaterThan(1);
    expect(caller!.container.startLine).toBeLessThanOrEqual(100);
    expect(
      caller!.container.endLine - caller!.container.startLine + 1,
    ).toBeLessThanOrEqual(MAX_EXCERPT_LINES);
  });

  it('shrinks a wide excerpt around a focus line and drops a container that cannot fit', async () => {
    const fixture = await makeFixture();
    const snapshot = await readSavedSnapshot(fixture);
    const wide = snapshot.symbols.find(
      (symbol) => symbol.path === 'src/wide.ts' && symbol.name === 'wide',
    );
    const huge = snapshot.symbols.find(
      (symbol) => symbol.path === 'src/huge.ts' && symbol.name === 'huge',
    );
    expect(wide).toBeDefined();
    expect(huge).toBeDefined();

    snapshot.graph.edges.push({
      from: wide!.id,
      to: 'symbol:src/math.ts#double',
      kind: 'calls',
      confidence: 'syntax',
      atLine: 2,
    });
    await writeSavedSnapshot(fixture, snapshot);
    const app = appFor();

    const focused = await relation(app, {
      symbolId: 'symbol:src/math.ts#double',
      direction: 'incoming',
      limit: 8,
    });
    expect(focused.status).toBe(200);
    const focusedBody = (await focused.json()) as CanvasRelationResponse;
    const wideRelation = focusedBody.relations.find(
      (item) => item.symbol.id === wide!.id,
    );
    expect(wideRelation).toBeDefined();
    expect(wideRelation!.container.excerpt.length).toBeLessThanOrEqual(16 * 1024);
    expect(wideRelation!.container.startLine).toBe(2);

    const definition = await relation(app, {
      symbolId: wide!.id,
      direction: 'definition',
    });
    expect(definition.status).toBe(200);
    const definitionBody = (await definition.json()) as CanvasRelationResponse;
    expect(definitionBody.container.startLine).toBe(1);
    expect(definitionBody.container.endLine).toBe(1);

    const tooLarge = await relation(app, {
      symbolId: huge!.id,
      direction: 'definition',
    });
    expect(tooLarge.status).toBe(409);
    await expect(tooLarge.json()).resolves.toMatchObject({
      error: expect.stringMatching(/too large/u),
    });
  });

  it('does not cache a failed analysis and reports it as unavailable', async () => {
    const fixture = await makeFixture();
    await rm(snapshotPathFor(fixture.home, fixture.slug), { force: true });
    let analyses = 0;
    const service = createRelationService({
      home: fixture.home,
      analyze: async () => {
        analyses += 1;
        throw new Error('analysis exploded');
      },
    });
    const app = createApp({ databasePath: ':memory:', relationService: service });

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await relation(app, {
        symbolId: 'symbol:src/math.ts#double',
        direction: 'definition',
      });
      expect(response.status).toBe(409);
      await expect(response.json()).resolves.toMatchObject({
        error: expect.stringMatching(/could not be analyzed/u),
      });
    }
    // A rejected analysis is evicted so the next request retries instead of
    // replaying the failure forever.
    expect(analyses).toBe(2);
  });
});
