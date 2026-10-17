import { describe, expect, it } from 'vitest';
import { parseSothspell } from './schema.js';

const validDocument = {
  schemaVersion: '1.0.0',
  id: 'tour_test',
  title: 'Test tour',
  subtitle: 'A small fixture',
  audience: 'new-contributor',
  project: {
    slug: 'test',
    name: 'Test',
    revision: { commit: 'abc1234', branch: 'main', dirty: false },
  },
  chapters: [
    {
      id: 'chapter_one',
      title: 'The shape',
      summary: 'A single chapter used to exercise the schema.',
      diagrams: [
        {
          id: 'diagram_one',
          kind: 'architecture',
          title: 'One box',
          nodes: [{ id: 'node_api', label: 'API', type: 'service' }],
          edges: [],
        },
      ],
      beats: [
        {
          id: 'beat_one',
          title: 'The API',
          narration: 'The API is the boundary between the browser and the records.',
          durationMs: 12000,
          anchors: [
            {
              id: 'anchor_one',
              path: 'src/api.ts',
              lines: { start: 1, end: 3 },
              contentHash: `sha256:${'a'.repeat(64)}`,
              label: 'API boundary',
            },
          ],
          stage: {
            anchorIds: ['anchor_one'],
            diagramId: 'diagram_one',
            nodeIds: ['node_api'],
            edgeIds: [],
          },
        },
      ],
    },
  ],
};

describe('Sóþspell document schema', () => {
  it('accepts a valid document', () => {
    const document = parseSothspell(validDocument);

    expect(document.id).toBe('tour_test');
    expect(document.chapters[0]?.beats[0]?.anchors[0]?.path).toBe('src/api.ts');
  });

  it('rejects duplicate IDs across the document', () => {
    const duplicate = structuredClone(validDocument);
    duplicate.chapters[0]!.diagrams[0]!.id = 'beat_one';

    expect(() => parseSothspell(duplicate)).toThrow(/duplicate/i);
  });

  it('rejects a stage anchor that the beat does not declare', () => {
    const missingAnchor = structuredClone(validDocument);
    missingAnchor.chapters[0]!.beats[0]!.stage.anchorIds = ['anchor_missing'];

    expect(() => parseSothspell(missingAnchor)).toThrow(/anchor_missing/);
  });

  it('rejects a stage node that the diagram does not declare', () => {
    const missingNode = structuredClone(validDocument);
    missingNode.chapters[0]!.beats[0]!.stage.nodeIds = ['node_missing'];

    expect(() => parseSothspell(missingNode)).toThrow(/node_missing/);
  });

  it('rejects a beat without code evidence', () => {
    const noEvidence = structuredClone(validDocument);
    noEvidence.chapters[0]!.beats[0]!.anchors = [];

    expect(() => parseSothspell(noEvidence)).toThrow();
  });
});
