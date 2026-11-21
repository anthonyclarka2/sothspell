import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { compileSothspell } from './compiler.js';
import { hashText } from './source.js';
import type { SothspellDocument, TourTranslation } from './schema.js';

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

  it('compiles an optional learning check with cited evidence and source locale fallback', async () => {
    const document = makeDocument();
    const beat = document.chapters[0]!.beats[0]!;
    expect(
      (await compileSothspell(document)).chapters[0]?.beats[0]?.learningCheck,
    ).toBeUndefined();

    beat.learningCheck = {
      id: 'check_module',
      prompt: 'What value does the module export?',
      explanation: 'It exports answer, which the declaration sets to 42.',
      anchorIds: ['anchor_module'],
    };
    const translatedBeat = {
      id: beat.id,
      title: 'Le module',
      narration: 'Ce module exporte une réponse dont la valeur est visible dans le code.',
    };
    const translation: TourTranslation = {
      locale: 'fr',
      sourceLocale: 'en',
      title: 'Le test',
      subtitle: 'Une visite du module',
      chapters: [
        {
          id: 'chapter_one',
          title: 'Un module',
          summary: 'La présentation du module.',
          diagrams: [{ id: 'diagram_one', title: 'Un module' }],
          beats: [translatedBeat],
        },
      ],
    };
    document.translations = { fr: translation };
    const fallback = await compileSothspell(document, { locale: 'fr' });
    expect(fallback.chapters[0]?.beats[0]?.learningCheck).toEqual({
      ...beat.learningCheck,
      locale: 'en',
    });

    translation.chapters[0]!.beats = [
      {
        ...translatedBeat,
        learningCheck: {
          id: 'check_module',
          prompt: 'Quelle valeur le module exporte-t-il ?',
          explanation: 'Le module exporte la réponse 42.',
        },
      },
    ];
    const localized = await compileSothspell(document, { locale: 'fr' });
    expect(localized.chapters[0]?.beats[0]?.learningCheck).toMatchObject({
      prompt: 'Quelle valeur le module exporte-t-il ?',
      anchorIds: ['anchor_module'],
      locale: 'fr',
    });

    translation.chapters[0]!.beats[0]!.learningCheck!.id = 'unknown_check';
    await expect(compileSothspell(document, { locale: 'fr' })).rejects.toThrow(
      /unknown learning check/,
    );
  });

  it('rejects learning checks that cite missing or stale evidence', async () => {
    const document = makeDocument({ contentHash: hashText('stale') });
    const beat = document.chapters[0]!.beats[0]!;
    beat.learningCheck = {
      id: 'check_module',
      prompt: 'What value does the module export?',
      explanation: 'It exports answer, which the declaration sets to 42.',
      anchorIds: ['missing_anchor'],
    };

    await expect(compileSothspell(document)).rejects.toThrow(
      /check_module.*missing_anchor/,
    );
    beat.learningCheck.anchorIds = ['anchor_module'];
    await expect(compileSothspell(document)).rejects.toThrow(
      /anchor_module hash mismatch/,
    );
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
