import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { analyzeProject, buildProjectBrief } from '@sothspell/analyzer';
import { assembleDocument } from './assemble.js';
import { buildContextPack } from './context.js';
import type { ChapterDraft, TourPlan } from './schemas.js';

const roots: string[] = [];

async function buildFixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'sothspell-assemble-'));
  roots.push(root);
  await mkdir(path.join(root, 'src'), { recursive: true });
  await writeFile(
    path.join(root, 'package.json'),
    JSON.stringify({ name: 'assemble-fixture' }),
  );
  await writeFile(
    path.join(root, 'src', 'app.module.ts'),
    ['export class AppModule {', '  bootstrap(): void {}', '}'].join('\n'),
  );
  await writeFile(
    path.join(root, 'src', 'service.ts'),
    [
      'export class Service {',
      '  run(value: string): string {',
      '    return value;',
      '  }',
      '}',
    ].join('\n'),
  );

  const snapshot = await analyzeProject(root);
  const context = await buildContextPack(snapshot, buildProjectBrief(snapshot), {
    sourceRoot: root,
    maxCandidates: 12,
  });
  return { snapshot, context };
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe('assembleDocument symbol targets', () => {
  it('carries candidate symbol IDs into anchors and diagram nodes', async () => {
    const { snapshot, context } = await buildFixture();
    const candidate = context.candidates.find(
      (entry) => entry.id === 'symbol:src/app.module.ts#AppModule',
    );
    expect(candidate).toBeDefined();
    const moduleCandidate = candidate!;

    const plan: TourPlan = {
      title: 'Assembly fixture',
      subtitle: 'A deterministic assembly test.',
      audience: 'new-contributor',
      chapters: [
        {
          title: 'The module',
          summary: 'One chapter used to exercise assembly.',
          goal: 'Prove that symbol targets survive assembly.',
          beatBudget: 2,
          coverage: ['the module'],
        },
      ],
    };

    const draft: ChapterDraft = {
      title: 'The module',
      summary: 'One chapter used to exercise assembly.',
      diagram: {
        id: 'diagram_draft',
        kind: 'architecture',
        title: 'Module',
        nodes: [
          {
            id: 'node_module',
            label: 'AppModule',
            type: 'class',
            anchorId: moduleCandidate.id,
          },
          {
            id: 'node_service',
            label: 'Service',
            type: 'class',
            anchorId: 'anchor_real_evidence',
          },
          {
            id: 'node_target',
            label: 'Target',
            type: 'class',
            symbolId: moduleCandidate.id,
          },
        ],
        edges: [
          {
            id: 'edge_one',
            from: 'node_module',
            to: 'node_service',
            kind: 'depends',
          },
        ],
      },
      beats: [
        {
          title: 'The module',
          narration:
            'The module wires the application together and is the first anchor in the chapter.',
          anchorIds: [moduleCandidate.id],
          nodeIds: ['node_module'],
        },
        {
          title: 'The service',
          narration:
            'The service receives the call from the module and returns the value it was given.',
          anchorIds: [moduleCandidate.id],
          nodeIds: ['node_service'],
          edgeIds: ['edge_one'],
        },
      ],
    };

    const document = assembleDocument({
      plan,
      chapters: [{ plan: plan.chapters[0]!, draft }],
      candidates: context.candidates,
      snapshot,
    });

    const beat = document.chapters[0]!.beats[0]!;
    expect(beat.anchors[0]?.symbolId).toBe('symbol:src/app.module.ts#AppModule');
    expect(beat.anchors[0]?.symbol).toBe(moduleCandidate.symbol);

    const nodes = document.chapters[0]!.diagrams[0]!.nodes;
    const moduleNode = nodes.find((node) => node.id === 'node_module');
    const serviceNode = nodes.find((node) => node.id === 'node_service');
    const targetNode = nodes.find((node) => node.id === 'node_target');

    expect(moduleNode?.symbolId).toBe('symbol:src/app.module.ts#AppModule');
    expect(moduleNode).not.toHaveProperty('anchorId');
    expect(serviceNode?.anchorId).toBe('anchor_real_evidence');
    expect(serviceNode?.symbolId).toBeUndefined();
    expect(targetNode?.symbolId).toBe('symbol:src/app.module.ts#AppModule');
  });
});
