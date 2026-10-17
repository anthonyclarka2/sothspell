import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { hashText } from '@sothspell/core';
import { parseExportArgs, runExport, type ExportDeps } from './export.js';

const roots: string[] = [];

async function makeDirectory(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'sothspell-export-'));
  roots.push(root);
  return root;
}

const EXCERPT = 'export const answer = 42;\n';

function fixtureTour(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: '1.0.0',
    id: 'tour_fixture',
    title: 'Fixture tour',
    subtitle: 'A small tour used by the CLI export tests',
    audience: 'new-contributor',
    project: {
      slug: 'fixture',
      name: 'Fixture',
      revision: { commit: 'abc1234', branch: 'main', dirty: false },
    },
    chapters: [
      {
        id: 'chapter_one',
        title: 'One',
        summary: 'First chapter summary for the fixture tour.',
        diagrams: [
          {
            id: 'diagram_one',
            kind: 'flow',
            title: 'Flow',
            nodes: [{ id: 'node_a', label: 'Answer', type: 'module' }],
            edges: [],
          },
        ],
        beats: [
          {
            id: 'beat_one',
            title: 'Beat one',
            narration: 'This beat explains the answer constant in the source file.',
            durationMs: 6000,
            anchors: [
              {
                id: 'anchor_one',
                path: 'src/index.ts',
                lines: { start: 1, end: 1 },
                contentHash: hashText(EXCERPT),
                excerpt: EXCERPT,
                language: 'typescript',
              },
            ],
            stage: {
              anchorIds: ['anchor_one'],
              diagramId: 'diagram_one',
              nodeIds: ['node_a'],
            },
          },
        ],
      },
    ],
    ...overrides,
  };
}

function deps(tour: Record<string, unknown>): ExportDeps {
  return {
    readTour: async () => tour,
    readAssets: async () => [
      { path: 'player.js', contents: 'console.log("player");\n' },
      { path: 'player.css', contents: 'sothspell-tour { display: block; }\n' },
    ],
    now: () => new Date('2026-10-17T00:00:00.000Z'),
  };
}

function capture() {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    stdout,
    stderr,
    io: {
      stdout: (line: string) => stdout.push(line),
      stderr: (line: string) => stderr.push(line),
    },
  };
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe('sothspell export', () => {
  it('parses the export command arguments', () => {
    expect(parseExportArgs(['tour.json', '--embed', '--out', 'dist'])).toEqual({
      tour: 'tour.json',
      out: 'dist',
      sourceRoot: null,
      embed: true,
    });

    expect(
      parseExportArgs([
        'tour.json',
        '--embed',
        '--out',
        'dist',
        '--source-root',
        '/tmp/project',
      ]),
    ).toMatchObject({ sourceRoot: '/tmp/project' });
  });

  it('requires a tour path, --embed, and --out', () => {
    expect(() => parseExportArgs(['--embed', '--out', 'dist'])).toThrow(/tour\.json/u);
    expect(() => parseExportArgs(['tour.json', '--out', 'dist'])).toThrow(/--embed/u);
    expect(() => parseExportArgs(['tour.json', '--embed'])).toThrow(/--out/u);
    expect(() =>
      parseExportArgs(['tour.json', '--embed', '--out', 'dist', '--nope']),
    ).toThrow(/unknown option/u);
  });

  it('writes the bundle and reports each file', async () => {
    const out = path.join(await makeDirectory(), 'bundle');
    const output = capture();

    const code = await runExport(
      { tour: 'tour.json', out, sourceRoot: null, embed: true },
      output.io,
      deps(fixtureTour()),
    );

    expect(code).toBe(0);
    expect(output.stderr).toEqual([]);
    for (const file of [
      'player.js',
      'player.css',
      'embed.html',
      'tour.json',
      'README.md',
      'export-manifest.json',
    ]) {
      expect(existsSync(path.join(out, file))).toBe(true);
    }
    const manifest = JSON.parse(
      await readFile(path.join(out, 'export-manifest.json'), 'utf8'),
    ) as { tour: { id: string }; excerpts: { count: number } };
    expect(manifest.tour.id).toBe('tour_fixture');
    expect(manifest.excerpts.count).toBe(1);
    expect(output.stdout.join('\n')).toContain('export-manifest.json');
  });

  it('rejects a tour with a missing anchor and writes nothing', async () => {
    const out = path.join(await makeDirectory(), 'bundle');
    const output = capture();
    const tour = fixtureTour();
    const chapters = tour.chapters as Array<{
      beats: Array<{ anchors: Array<Record<string, unknown>> }>;
    }>;
    delete chapters[0]!.beats[0]!.anchors[0]!.excerpt;

    const code = await runExport(
      { tour: 'tour.json', out, sourceRoot: null, embed: true },
      output.io,
      deps(tour),
    );

    expect(code).toBe(1);
    expect(output.stderr.join('\n')).toMatch(/anchor_one/u);
    expect(existsSync(path.join(out, 'tour.json'))).toBe(false);
  });

  it('refuses to write the bundle inside the source root', async () => {
    const root = await makeDirectory();
    const output = capture();

    const code = await runExport(
      {
        tour: 'tour.json',
        out: path.join(root, 'bundle'),
        sourceRoot: root,
        embed: true,
      },
      output.io,
      deps(fixtureTour()),
    );

    expect(code).toBe(1);
    expect(output.stderr.join('\n')).toMatch(/inside the source root/u);
  });
});
