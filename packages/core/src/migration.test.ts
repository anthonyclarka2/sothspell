import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LOCALE,
  SCHEMA_VERSION,
  migrateSothspell,
  parseSothspell,
  type SothspellDocument,
} from './schema.js';

const hash = `sha256:${'a'.repeat(64)}`;

function documentAt(version: string): Record<string, unknown> {
  return {
    schemaVersion: version,
    id: 'tour_migration_test',
    title: 'Migration test',
    subtitle: 'A fixture used to exercise the schema migration chain',
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
        summary: 'One chapter used to exercise schema migrations.',
        diagrams: [
          {
            id: 'diagram_one',
            kind: 'architecture',
            title: 'One box',
            nodes: [
              {
                id: 'node_module',
                label: 'AppModule',
                type: 'class',
                anchorId: 'symbol:src/app.module.ts#AppModule',
              },
            ],
            edges: [],
          },
        ],
        beats: [
          {
            id: 'beat_one',
            title: 'The module',
            narration: 'The module wires the application together for the request path.',
            durationMs: 12000,
            anchors: [
              {
                id: 'anchor_one',
                path: 'src/app.module.ts',
                symbol: 'AppModule',
                lines: { start: 1, end: 3 },
                contentHash: hash,
                label: 'AppModule',
                excerpt: 'export class AppModule {}',
              },
            ],
            stage: {
              anchorIds: ['anchor_one'],
              diagramId: 'diagram_one',
              nodeIds: ['node_module'],
              edgeIds: [],
            },
          },
        ],
      },
    ],
  };
}

function firstNode(document: SothspellDocument) {
  return document.chapters[0]?.diagrams[0]?.nodes[0];
}

describe('schema migration chain', () => {
  it('migrates a 1.0.0 tour through the locale step to the current version', () => {
    const document = parseSothspell(documentAt('1.0.0'));

    expect(document.schemaVersion).toBe(SCHEMA_VERSION);
    expect(document.schemaVersion).toBe('1.2.0');
    expect(document.locale).toBe(DEFAULT_LOCALE);
  });

  it('migrates a 1.1.0 tour and preserves its locale', () => {
    const document = parseSothspell({
      ...documentAt('1.1.0'),
      locale: 'de',
    });

    expect(document.schemaVersion).toBe(SCHEMA_VERSION);
    expect(document.locale).toBe('de');
  });

  it('accepts a 1.2.0 tour with symbol IDs on anchors and nodes', () => {
    const source = documentAt('1.2.0');
    const anchors = (source.chapters as Array<Record<string, unknown>>)[0]!
      .beats as Array<Record<string, unknown>>;
    const anchor = (anchors[0]!.anchors as Array<Record<string, unknown>>)[0]!;
    anchor.symbolId = 'symbol:src/app.module.ts#AppModule';
    const diagrams = (source.chapters as Array<Record<string, unknown>>)[0]!
      .diagrams as Array<Record<string, unknown>>;
    const node = (diagrams[0]!.nodes as Array<Record<string, unknown>>)[0]!;
    node.symbolId = 'symbol:src/app.module.ts#AppModule';
    delete node.anchorId;

    const document = parseSothspell(source);

    expect(document.chapters[0]?.beats[0]?.anchors[0]?.symbolId).toBe(
      'symbol:src/app.module.ts#AppModule',
    );
    expect(firstNode(document)?.symbolId).toBe('symbol:src/app.module.ts#AppModule');
  });

  it('repairs a generated-tour diagram node whose anchorId is a symbol ID', () => {
    const document = parseSothspell(documentAt('1.1.0'));

    expect(firstNode(document)?.symbolId).toBe('symbol:src/app.module.ts#AppModule');
    expect(firstNode(document)?.anchorId).toBeUndefined();
  });

  it('preserves an explicit anchor ID on a diagram node', () => {
    const source = documentAt('1.1.0');
    const diagrams = (source.chapters as Array<Record<string, unknown>>)[0]!
      .diagrams as Array<Record<string, unknown>>;
    const node = (diagrams[0]!.nodes as Array<Record<string, unknown>>)[0]!;
    node.anchorId = 'anchor_one';

    const document = parseSothspell(source);

    expect(firstNode(document)?.anchorId).toBe('anchor_one');
    expect(firstNode(document)?.symbolId).toBeUndefined();
  });

  it('preserves a symbol-shaped ID when an anchor really has that ID', () => {
    const source = documentAt('1.1.0');
    const chapters = source.chapters as Array<Record<string, unknown>>;
    const beat = (chapters[0]!.beats as Array<Record<string, unknown>>)[0]!;
    const anchor = (beat.anchors as Array<Record<string, unknown>>)[0]!;
    anchor.id = 'symbol:src/app.module.ts#AppModule';
    const stage = beat.stage as Record<string, unknown>;
    stage.anchorIds = ['symbol:src/app.module.ts#AppModule'];

    const document = parseSothspell(source);

    expect(firstNode(document)?.anchorId).toBe('symbol:src/app.module.ts#AppModule');
    expect(firstNode(document)?.symbolId).toBeUndefined();
  });

  it('repairs a 1.0.0 generated tour through the full chain', () => {
    const document = parseSothspell(documentAt('1.0.0'));

    expect(firstNode(document)?.symbolId).toBe('symbol:src/app.module.ts#AppModule');
    expect(firstNode(document)?.anchorId).toBeUndefined();
  });

  it('does not mutate the input while migrating', () => {
    const source = documentAt('1.1.0');

    migrateSothspell(source);

    const diagrams = (source.chapters as Array<Record<string, unknown>>)[0]!
      .diagrams as Array<Record<string, unknown>>;
    const node = (diagrams[0]!.nodes as Array<Record<string, unknown>>)[0]!;
    expect(node.anchorId).toBe('symbol:src/app.module.ts#AppModule');
    expect(node.symbolId).toBeUndefined();
  });
});
