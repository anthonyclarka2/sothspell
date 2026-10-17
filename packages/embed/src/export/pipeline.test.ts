import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { hashText } from '@sothspell/core';
import { buildEmbedExport, type EmbedAssetWriter } from './pipeline.js';

const EXCERPT = 'export const answer = 42;\n';

const PLAYER_JS = 'console.log("player");\n';
const PLAYER_CSS = 'sothspell-tour { display: block; }\n';

function fakeAssets(): Array<{ path: string; contents: string }> {
  return [
    { path: 'player.js', contents: PLAYER_JS },
    { path: 'player.css', contents: PLAYER_CSS },
  ];
}

function fakeWriter(): EmbedAssetWriter & { files: Map<string, string> } {
  const files = new Map<string, string>();
  return {
    files,
    write: async (path, contents) => {
      files.set(path, contents);
    },
  };
}

function fixtureAnchor(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'anchor_one',
    path: 'src/index.ts',
    lines: { start: 1, end: 1 },
    contentHash: hashText(EXCERPT),
    excerpt: EXCERPT,
    label: 'answer',
    language: 'typescript',
    ...overrides,
  };
}

function fixtureTour(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: '1.0.0',
    id: 'tour_fixture',
    title: 'Fixture tour',
    subtitle: 'A small tour used by the export tests',
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
            anchors: [fixtureAnchor()],
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

const OPTIONS = {
  embedApiVersion: '1.0.0',
  generatedAt: '2026-10-17T00:00:00.000Z',
};

describe('embed export pipeline', () => {
  it('writes the player, page, tour, README, and manifest through the writer', async () => {
    const writer = fakeWriter();

    const result = await buildEmbedExport(
      fixtureTour(),
      { ...OPTIONS, assets: fakeAssets() },
      writer,
    );

    expect([...writer.files.keys()]).toEqual([
      'player.js',
      'player.css',
      'embed.html',
      'tour.json',
      'README.md',
      'export-manifest.json',
    ]);
    expect(result.manifest.manifestVersion).toBe(1);
  });

  it('embeds compiled excerpts and highlighted HTML in tour.json', async () => {
    const writer = fakeWriter();

    await buildEmbedExport(fixtureTour(), { ...OPTIONS, assets: fakeAssets() }, writer);

    const tour = JSON.parse(writer.files.get('tour.json') ?? '{}') as {
      chapters: Array<{
        beats: Array<{ anchors: Array<{ excerpt: string; html: string }> }>;
      }>;
    };
    const anchor = tour.chapters[0]?.beats[0]?.anchors[0];
    expect(anchor?.excerpt).toBe(EXCERPT);
    expect(anchor?.html).toContain('shiki');
  });

  it('records file hashes, the revision, and the excerpt hashes in the manifest', async () => {
    const writer = fakeWriter();

    const result = await buildEmbedExport(
      fixtureTour(),
      { ...OPTIONS, assets: fakeAssets() },
      writer,
    );

    const manifest = result.manifest;
    expect(manifest.tour).toEqual({
      id: 'tour_fixture',
      title: 'Fixture tour',
      projectSlug: 'fixture',
      projectName: 'Fixture',
      revision: { commit: 'abc1234', branch: 'main', dirty: false },
    });
    expect(manifest.excerpts.anchors).toEqual([
      {
        id: 'anchor_one',
        path: 'src/index.ts',
        contentHash: hashText(EXCERPT),
        bytes: Buffer.byteLength(EXCERPT, 'utf8'),
      },
    ]);
    expect(manifest.files.map((file) => file.path)).toEqual([
      'player.js',
      'player.css',
      'embed.html',
      'tour.json',
      'README.md',
    ]);
    const playerJs = manifest.files.find((file) => file.path === 'player.js');
    expect(playerJs?.sha256).toBe(
      `sha256:${createHash('sha256').update(PLAYER_JS, 'utf8').digest('hex')}`,
    );
    expect(manifest.privacy.network).toBe('none');
    expect(manifest.embed.customElement).toBe('sothspell-tour');
  });

  it('writes a README with the embed snippet and the shipped files', async () => {
    const writer = fakeWriter();

    await buildEmbedExport(fixtureTour(), { ...OPTIONS, assets: fakeAssets() }, writer);

    const readme = writer.files.get('README.md') ?? '';
    expect(readme).toContain('<sothspell-tour');
    expect(readme).toContain('createIframeEmbed');
    expect(readme).toContain('`player.js`');
    expect(readme).toContain('`tour.json`');
    expect(readme).toContain('sothspell:progress');
    expect(readme).toContain('progress="off"');
  });

  it('writes an iframe page with no inline scripts', async () => {
    const writer = fakeWriter();

    await buildEmbedExport(fixtureTour(), { ...OPTIONS, assets: fakeAssets() }, writer);

    const page = writer.files.get('embed.html') ?? '';
    expect(page).toContain('class="sothspell-iframe"');
    expect(page).toContain('<script type="module" src="./player.js"></script>');
    expect(page).toContain('<link rel="stylesheet" href="./player.css" />');
    expect(page).not.toMatch(/<script(?![^>]*src=)/u);
  });

  it('ships no absolute local paths in any written file', async () => {
    const writer = fakeWriter();

    await buildEmbedExport(fixtureTour(), { ...OPTIONS, assets: fakeAssets() }, writer);

    for (const contents of writer.files.values()) {
      expect(contents).not.toContain('/Users/');
      expect(contents).not.toContain('file://');
    }
  });

  it('keeps an optional translation overlay in tour.json', async () => {
    const writer = fakeWriter();
    const tour = fixtureTour({
      locale: 'en',
      translations: {
        de: {
          title: 'Fixture-Tour',
          chapters: [{ id: 'chapter_one', title: 'Eins' }],
        },
      },
    });

    await buildEmbedExport(tour, { ...OPTIONS, assets: fakeAssets() }, writer);

    const exported = JSON.parse(writer.files.get('tour.json') ?? '{}') as {
      locale?: string;
      translations?: Record<string, { title?: string }>;
    };
    expect(exported.locale).toBe('en');
    expect(exported.translations?.de?.title).toBe('Fixture-Tour');
  });

  it('rejects a tour with a missing anchor excerpt', async () => {
    const writer = fakeWriter();
    const tour = fixtureTour();
    const chapters = tour.chapters as Array<{
      beats: Array<{ anchors: Array<Record<string, unknown>> }>;
    }>;
    delete chapters[0]!.beats[0]!.anchors[0]!.excerpt;

    await expect(
      buildEmbedExport(tour, { ...OPTIONS, assets: fakeAssets() }, writer),
    ).rejects.toThrow(/anchor_one.*excerpt|excerpt.*anchor_one/u);
    expect(writer.files.size).toBe(0);
  });

  it('rejects an anchor whose excerpt no longer matches its hash', async () => {
    const writer = fakeWriter();
    const tour = fixtureTour();
    const chapters = tour.chapters as Array<{
      beats: Array<{ anchors: Array<Record<string, unknown>> }>;
    }>;
    chapters[0]!.beats[0]!.anchors[0]!.excerpt = 'export const answer = 41;\n';

    await expect(
      buildEmbedExport(tour, { ...OPTIONS, assets: fakeAssets() }, writer),
    ).rejects.toThrow(/hash mismatch/u);
  });

  it('rejects an excerpt over the per-anchor ceiling', async () => {
    const writer = fakeWriter();

    await expect(
      buildEmbedExport(
        fixtureTour(),
        { ...OPTIONS, assets: fakeAssets(), maxExcerptBytes: 4 },
        writer,
      ),
    ).rejects.toThrow(/anchor_one/u);
  });

  it('rejects a tour over the total excerpt ceiling', async () => {
    const writer = fakeWriter();
    const tour = fixtureTour();
    const chapters = tour.chapters as Array<{
      beats: Array<{
        anchors: Array<Record<string, unknown>>;
        stage: { anchorIds: string[] };
      }>;
    }>;
    const beat = chapters[0]!.beats[0]!;
    const second = fixtureAnchor({
      id: 'anchor_two',
      path: 'src/other.ts',
      contentHash: hashText('export const other = 7;\n'),
      excerpt: 'export const other = 7;\n',
    });
    beat.anchors.push(second);
    beat.stage.anchorIds.push('anchor_two');

    await expect(
      buildEmbedExport(
        tour,
        { ...OPTIONS, assets: fakeAssets(), maxTotalExcerptBytes: 10 },
        writer,
      ),
    ).rejects.toThrow(/ceiling/u);
    expect(writer.files.size).toBe(0);
  });

  it('rejects secret-shaped values without echoing them', async () => {
    const writer = fakeWriter();
    const secret = `sk-${'a'.repeat(32)}`;
    const excerpt = `const key = "${secret}";\n`;
    const tour = fixtureTour();
    const chapters = tour.chapters as Array<{
      beats: Array<{ anchors: Array<Record<string, unknown>> }>;
    }>;
    const anchor = chapters[0]!.beats[0]!.anchors[0]!;
    anchor.excerpt = excerpt;
    anchor.contentHash = hashText(excerpt);

    const failure = buildEmbedExport(tour, { ...OPTIONS, assets: fakeAssets() }, writer);
    await expect(failure).rejects.toThrow(/OpenAI-style API key/u);
    await expect(failure).rejects.not.toThrow(secret);
  });

  it('rejects machine-specific absolute paths in excerpts', async () => {
    const writer = fakeWriter();
    const excerpt = 'const root = "/Users/alice/project";\n';
    const tour = fixtureTour();
    const chapters = tour.chapters as Array<{
      beats: Array<{ anchors: Array<Record<string, unknown>> }>;
    }>;
    const anchor = chapters[0]!.beats[0]!.anchors[0]!;
    anchor.excerpt = excerpt;
    anchor.contentHash = hashText(excerpt);

    await expect(
      buildEmbedExport(tour, { ...OPTIONS, assets: fakeAssets() }, writer),
    ).rejects.toThrow(/home path/u);
  });

  it('rejects an unsupported schema version', async () => {
    const writer = fakeWriter();

    await expect(
      buildEmbedExport(
        fixtureTour({ schemaVersion: '2.0.0' }),
        { ...OPTIONS, assets: fakeAssets() },
        writer,
      ),
    ).rejects.toThrow(/schema/u);
  });

  it('rejects absolute or escaping asset paths and missing player assets', async () => {
    const writer = fakeWriter();

    await expect(
      buildEmbedExport(
        fixtureTour(),
        { ...OPTIONS, assets: [{ path: '../player.js', contents: PLAYER_JS }] },
        writer,
      ),
    ).rejects.toThrow(/relative/u);

    await expect(
      buildEmbedExport(
        fixtureTour(),
        { ...OPTIONS, assets: [{ path: 'player.js', contents: PLAYER_JS }] },
        writer,
      ),
    ).rejects.toThrow(/player\.css/u);
  });

  it('exports the checked-in golden Bunbun tour', async () => {
    const writer = fakeWriter();
    const golden = JSON.parse(
      await readFile(
        new URL('../../../../examples/bunbun-tour/tour.json', import.meta.url),
        'utf8',
      ),
    ) as unknown;

    const result = await buildEmbedExport(
      golden,
      { ...OPTIONS, assets: fakeAssets() },
      writer,
    );

    expect(result.manifest.tour.id).toBe('tour_bunbun_golden');
    expect(result.manifest.tour.revision.commit).toBe('9fef24d');
    expect(result.manifest.excerpts.count).toBe(20);
    expect(result.manifest.excerpts.totalBytes).toBeGreaterThan(0);
    expect(result.manifest.excerpts.totalBytes).toBeLessThan(
      result.manifest.excerpts.totalCeilingBytes,
    );
    expect(writer.files.size).toBe(6);
  });
});
