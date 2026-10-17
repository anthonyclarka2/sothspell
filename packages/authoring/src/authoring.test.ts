import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { compileSothspell } from '@sothspell/core';
import { analyzeProject, buildProjectBrief } from '@sothspell/analyzer';
import {
  authorTour,
  buildContextPack,
  createFixtureGuideModel,
  FakeGuideModel,
  type ChapterDraft,
  type TourPlan,
} from './index.js';

const roots: string[] = [];

async function makeProject(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'sothspell-authoring-'));
  roots.push(root);
  await mkdir(path.join(root, 'src'), { recursive: true });
  await writeFile(
    path.join(root, 'package.json'),
    JSON.stringify({ name: 'authoring-fixture' }),
  );
  await writeFile(
    path.join(root, 'README.md'),
    '# Authoring Fixture\n\nA small project used to exercise tour authoring.\n',
  );
  await writeFile(
    path.join(root, 'src', 'service.ts'),
    [
      'export class Service {',
      '  run(value: string): string {',
      '    return value;',
      '  }',
      '}',
      'export function bootstrap(): void {}',
    ].join('\n'),
  );
  await writeFile(
    path.join(root, 'src', 'store.ts'),
    'export class Store { save(): void {} }\n',
  );
  await writeFile(
    path.join(root, 'src', 'secret.ts'),
    "export const apiKey = 'sk-test-0123456789abcdefghijklmnop';\n",
  );
  return root;
}

async function buildInput(): Promise<{
  root: string;
  snapshot: Awaited<ReturnType<typeof analyzeProject>>;
  context: Awaited<ReturnType<typeof buildContextPack>>;
}> {
  const root = await makeProject();
  const snapshot = await analyzeProject(root);
  const brief = buildProjectBrief(snapshot);
  const context = await buildContextPack(snapshot, brief, {
    sourceRoot: root,
    maxCandidates: 12,
  });
  return { root, snapshot, context };
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe('authoring context', () => {
  it('builds deterministic candidates with excerpts and hashes', async () => {
    const { context } = await buildInput();

    expect(context.candidates.length).toBeGreaterThan(0);
    expect(context.candidates[0]?.id).toMatch(/^symbol:/);
    expect(context.candidates[0]?.excerpt.length).toBeGreaterThan(0);
    expect(context.candidates[0]?.contentHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(context.estimatedTokens).toBeGreaterThan(0);
  });

  it('never includes a redacted file in the evidence pack', async () => {
    const { context } = await buildInput();

    expect(
      context.candidates.some((candidate) => candidate.path === 'src/secret.ts'),
    ).toBe(false);
    expect(JSON.stringify(context)).not.toContain('sk-test-0123456789');
  });
});

describe('authorTour', () => {
  it('produces a valid compiled tour from the fixture model', async () => {
    const { root, snapshot, context } = await buildInput();
    const result = await authorTour(snapshot, createFixtureGuideModel(context), {
      sourceRoot: root,
      contextPack: context,
    });

    expect(result.document.chapters).toHaveLength(4);
    expect(result.document.chapters.flatMap((chapter) => chapter.beats)).toHaveLength(8);
    expect(result.quality.modelCalls).toBe(5);
    expect(result.quality.anchors).toBe(8);
    expect(result.quality.droppedChapters).toBe(0);

    const compiled = await compileSothspell(result.document);
    expect(compiled.chapters).toHaveLength(4);
    expect(compiled.chapters[0]?.beats[0]?.anchors[0]?.html).toContain('shiki');
  });

  it('reuses model calls from the authoring cache', async () => {
    const { root, snapshot, context } = await buildInput();
    const cacheDirectory = path.join(
      root,
      '..',
      `authoring-cache-${path.basename(root)}`,
    );
    roots.push(cacheDirectory);

    const first = await authorTour(snapshot, createFixtureGuideModel(context), {
      sourceRoot: root,
      contextPack: context,
      cacheDirectory,
    });
    const second = await authorTour(snapshot, createFixtureGuideModel(context), {
      sourceRoot: root,
      contextPack: context,
      cacheDirectory,
    });

    expect(first.quality.modelCalls).toBe(5);
    expect(second.quality.modelCalls).toBe(0);
    expect(second.quality.cacheHits).toBeGreaterThanOrEqual(5);
    expect(second.document.id).toBe(first.document.id);
  });

  it('repairs an invalid chapter before assembling it', async () => {
    const { root, snapshot, context } = await buildInput();
    const plan: TourPlan = {
      title: 'Repair fixture',
      subtitle: 'A deterministic repair test.',
      audience: 'new-contributor',
      chapters: [
        {
          title: 'Chapter one',
          summary: 'One chapter with one invalid beat.',
          goal: 'Prove that an unknown anchor is repaired.',
          beatBudget: 2,
          coverage: ['the first anchor'],
        },
        {
          title: 'Chapter two',
          summary: 'A second chapter.',
          goal: 'Keep the tour shippable.',
          beatBudget: 2,
          coverage: ['the second anchor'],
        },
        {
          title: 'Chapter three',
          summary: 'A third chapter.',
          goal: 'Keep the tour shippable.',
          beatBudget: 2,
          coverage: ['the third anchor'],
        },
        {
          title: 'Chapter four',
          summary: 'A fourth chapter.',
          goal: 'Reach the minimum plan size.',
          beatBudget: 2,
          coverage: ['the fourth anchor'],
        },
      ],
    };

    const first = context.candidates[0]!;
    const second = context.candidates[1] ?? first;
    const validChapter: ChapterDraft = {
      title: 'Chapter one',
      summary: 'One chapter with one invalid beat.',
      diagram: {
        id: 'diagram_repair',
        kind: 'architecture',
        title: 'Repair',
        nodes: [
          { id: 'node_one', label: 'One', type: 'class', anchorId: first.id },
          { id: 'node_two', label: 'Two', type: 'module', anchorId: second.id },
        ],
        edges: [{ id: 'edge_one', from: 'node_one', to: 'node_two', kind: 'calls' }],
      },
      beats: [
        {
          title: 'The first beat',
          narration:
            'The first beat explains the declaration and its boundary. The cited excerpt is the evidence for the claim, and the narration stays close to what the code shows without inventing behavior beyond it.',
          anchorIds: [first.id],
          nodeIds: ['node_one'],
        },
        {
          title: 'The second beat',
          narration:
            'The second beat moves to the neighbouring declaration. The excerpt is the evidence for the hand-off, and the diagram focus shows where the two responsibilities meet in the chapter map.',
          anchorIds: [second.id],
          nodeIds: ['node_two'],
          edgeIds: ['edge_one'],
        },
      ],
    };
    const invalidChapter: ChapterDraft = {
      ...validChapter,
      beats: validChapter.beats.map((beat, index) =>
        index === 0 ? { ...beat, anchorIds: ['symbol:not-a-candidate'] } : beat,
      ),
    };

    let chapterCall = 0;
    const model = new FakeGuideModel(({ schemaName }) => {
      if (schemaName === 'TourPlan') {
        return plan;
      }
      chapterCall += 1;
      if (chapterCall === 1) {
        return invalidChapter;
      }
      if (chapterCall === 2) {
        return validChapter;
      }
      return {
        ...validChapter,
        title: `Chapter ${chapterCall}`,
      };
    });

    const result = await authorTour(snapshot, model, {
      sourceRoot: root,
      contextPack: context,
      maxRepairAttempts: 2,
    });

    expect(result.quality.modelCalls).toBeGreaterThan(5);
    expect(result.quality.droppedChapters).toBe(0);
    expect(result.document.chapters).toHaveLength(4);
  });
});
