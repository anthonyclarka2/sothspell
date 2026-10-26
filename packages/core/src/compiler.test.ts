import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { compileSothspell } from './compiler.js';
import { hashText } from './source.js';
import type { SothspellDocument } from './schema.js';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

function makeDocument(overrides?: {
  contentHash?: string;
  excerpt?: string;
  withExcerpt?: boolean;
}): SothspellDocument {
  const excerpt = overrides?.excerpt ?? 'const answer = 42;\nexport { answer };';
  const withExcerpt = overrides?.withExcerpt ?? true;

  return {
    schemaVersion: '1.0.0',
    id: 'tour_compiler_test',
    title: 'Compiler test',
    subtitle: 'Exercises anchor resolution and layout',
    audience: 'new-contributor',
    project: {
      slug: 'test',
      name: 'Test',
      revision: { commit: 'abc1234', branch: 'main', dirty: false },
    },
    chapters: [
      {
        id: 'chapter_one',
        title: 'One module',
        summary: 'A single module with one beat.',
        diagrams: [
          {
            id: 'diagram_one',
            kind: 'architecture',
            title: 'One module',
            nodes: [
              {
                id: 'node_module',
                label: 'Module',
                type: 'module',
                symbolId: 'symbol:src/module.ts#answer',
              },
              { id: 'node_store', label: 'Store', type: 'store' },
            ],
            edges: [
              {
                id: 'edge_module_store',
                from: 'node_module',
                to: 'node_store',
                kind: 'writes',
              },
            ],
          },
        ],
        beats: [
          {
            id: 'beat_one',
            title: 'The module',
            narration:
              'The module owns one responsibility and hands its result to the store.',
            anchors: [
              {
                id: 'anchor_module',
                path: 'src/module.ts',
                symbol: 'answer',
                symbolId: 'symbol:src/module.ts#answer',
                lines: { start: 1, end: 2 },
                contentHash: overrides?.contentHash ?? hashText(excerpt),
                language: 'typescript',
                ...(withExcerpt ? { excerpt } : {}),
              },
            ],
            stage: {
              anchorIds: ['anchor_module'],
              diagramId: 'diagram_one',
              nodeIds: ['node_module'],
              edgeIds: ['edge_module_store'],
            },
          },
        ],
      },
    ],
  };
}

describe('compileSothspell', () => {
  it('resolves an embedded excerpt and compiles a playable tour', async () => {
    const compiled = await compileSothspell(makeDocument());

    const beat = compiled.chapters[0]?.beats[0];
    const anchor = beat?.anchors[0];
    const diagram = compiled.chapters[0]?.diagrams[0];

    expect(compiled.id).toBe('tour_compiler_test');
    expect(anchor?.html).toContain('shiki');
    expect(anchor?.excerpt).toContain('const answer = 42;');
    expect(anchor?.symbolId).toBe('symbol:src/module.ts#answer');
    expect(beat?.durationMs).toBeGreaterThan(0);
    expect(diagram?.nodes[0]?.x).toBeTypeOf('number');
    expect(diagram?.nodes[0]?.y).toBeTypeOf('number');
    expect(diagram?.nodes[0]?.symbolId).toBe('symbol:src/module.ts#answer');
    expect(diagram?.edges[0]?.from).toBe('node_module');
  });

  it('refuses an excerpt whose hash does not match', async () => {
    await expect(
      compileSothspell(
        makeDocument({
          contentHash: hashText('different content'),
        }),
      ),
    ).rejects.toThrow(/hash/i);
  });

  it('reads from a project root when the anchor has no embedded excerpt', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'sothspell-compiler-'));
    roots.push(root);
    await mkdir(path.join(root, 'src'), { recursive: true });
    await writeFile(
      path.join(root, 'src', 'module.ts'),
      'const answer = 42;\nexport { answer };\n',
    );

    const document = makeDocument({ withExcerpt: false });
    const compiled = await compileSothspell(document, { sourceRoot: root });

    expect(compiled.chapters[0]?.beats[0]?.anchors[0]?.excerpt).toBe(
      'const answer = 42;\nexport { answer };',
    );
  });
});
