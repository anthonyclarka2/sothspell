import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { hashText, parseSothspell } from '@sothspell/core';
import { afterAll, describe, expect, it } from 'vitest';
import { analyzeProject } from '@sothspell/analyzer';
import { generateDrilldown } from './drilldown.js';
import { FakeGuideModel } from './fake-model.js';

const roots: string[] = [];
afterAll(async () => {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
});

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'sothspell-drilldown-'));
  roots.push(root);
  await mkdir(path.join(root, 'src'), { recursive: true });
  const text = 'export class Service { run(): void {} }\n';
  await writeFile(path.join(root, 'src', 'service.ts'), text);
  const snapshot = await analyzeProject(root);
  const document = parseSothspell({
    schemaVersion: '1.0.0',
    id: 'tour_drilldown',
    title: 'Drilldown fixture',
    subtitle: 'A fixture for a deeper tour.',
    audience: 'new-contributor',
    project: {
      slug: 'drilldown',
      name: 'Drilldown',
      revision: { commit: 'abcdef1', branch: 'main', dirty: false },
    },
    chapters: [
      {
        id: 'chapter_one',
        title: 'The service',
        summary: 'The service owns the run method.',
        diagrams: [
          {
            id: 'diagram_one',
            kind: 'architecture',
            title: 'Service',
            nodes: [{ id: 'node_service', label: 'Service', type: 'class' }],
            edges: [],
          },
        ],
        beats: [
          {
            id: 'beat_one',
            title: 'The run method',
            narration: 'The service exposes a run method that owns one operation.',
            anchors: [
              {
                id: 'anchor_service',
                path: 'src/service.ts',
                symbol: 'Service',
                lines: { start: 1, end: 1 },
                contentHash: hashText(text.trimEnd()),
                label: 'Service',
                excerpt: text.trimEnd(),
              },
            ],
            stage: {
              anchorIds: ['anchor_service'],
              diagramId: 'diagram_one',
              nodeIds: ['node_service'],
            },
          },
        ],
      },
    ],
  });
  return { root, snapshot, document };
}

describe('generateDrilldown', () => {
  it('produces a valid one-chapter side tour for an anchor', async () => {
    const { root, snapshot, document } = await fixture();
    const model = new FakeGuideModel(() => ({
      title: 'Service in detail',
      summary: 'A closer look at the service declaration.',
      diagram: {
        id: 'diagram_detail',
        kind: 'architecture',
        title: 'Service detail',
        nodes: [
          {
            id: 'node_service',
            label: 'Service',
            type: 'class',
            anchorId: 'anchor_service',
          },
        ],
        edges: [],
      },
      beats: [
        {
          title: 'The class',
          narration:
            'The service class is the entry point for this drilldown. The cited declaration shows the class boundary, and the next beat names the run method inside it without claiming behavior beyond the excerpt.',
          anchorIds: ['anchor_service'],
          nodeIds: ['node_service'],
        },
        {
          title: 'The method',
          narration:
            'The run method is the operation this class exposes. The same anchor covers the declaration, so the drilldown stays within the evidence supplied by the parent tour and can return the reader to that beat when it ends.',
          anchorIds: ['anchor_service'],
          nodeIds: ['node_service'],
        },
      ],
    }));

    const result = await generateDrilldown({
      tour: document,
      anchorId: 'anchor_service',
      snapshot,
      sourceRoot: root,
      model,
    });

    expect(result.document.chapters).toHaveLength(1);
    expect(result.beats).toBe(2);
    expect(result.document.chapters[0]?.beats[0]?.anchors[0]?.path).toBe(
      'src/service.ts',
    );
  });

  it('omits an empty symbol instead of failing schema validation', async () => {
    const { root, snapshot, document } = await fixture();
    const withoutSymbol = structuredClone(document);
    for (const chapter of withoutSymbol.chapters) {
      for (const beat of chapter.beats) {
        for (const anchor of beat.anchors) {
          delete anchor.symbol;
        }
      }
    }

    const model = new FakeGuideModel(() => ({
      title: 'Service in detail',
      summary: 'A closer look at the service declaration.',
      diagram: {
        id: 'diagram_detail',
        kind: 'architecture',
        title: 'Service detail',
        nodes: [
          {
            id: 'node_service',
            label: 'Service',
            type: 'class',
            anchorId: 'anchor_service',
          },
        ],
        edges: [],
      },
      beats: [
        {
          title: 'The class',
          narration:
            'The service class is the entry point for this drilldown. The cited declaration shows the class boundary, and the next beat names the run method inside it without claiming behavior beyond the excerpt.',
          anchorIds: ['anchor_service'],
          nodeIds: ['node_service'],
        },
        {
          title: 'The method',
          narration:
            'The run method is the operation this class exposes. The same anchor covers the declaration, so the drilldown stays within the evidence supplied by the parent tour and can return the reader to that beat when it ends.',
          anchorIds: ['anchor_service'],
          nodeIds: ['node_service'],
        },
      ],
    }));

    const result = await generateDrilldown({
      tour: withoutSymbol,
      anchorId: 'anchor_service',
      snapshot,
      sourceRoot: root,
      model,
    });

    expect(result.document.chapters[0]?.beats[0]?.anchors[0]?.symbol).toBeUndefined();
    expect(result.document.chapters[0]?.beats[0]?.anchors[0]?.path).toBe(
      'src/service.ts',
    );
  });
});
