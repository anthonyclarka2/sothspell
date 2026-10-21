import type {
  CompiledAnchor,
  CompiledBeat,
  CompiledChapter,
  CompiledTour,
} from '@sothspell/core';
import type { PositionedDiagram, PositionedNode } from '@sothspell/diagram';

/**
 * Builders for the canvas tests. The fixtures are compiled artefacts, not
 * schema documents, so they use real line ranges, hashes, and excerpts while
 * staying small enough to read.
 */
export const CONTENT_HASH = `sha256:${'a'.repeat(64)}`;

export function anchor(
  id: string,
  overrides: Partial<CompiledAnchor> = {},
): CompiledAnchor {
  return {
    id,
    path: `src/${id.replace(/^anchor_/u, '')}.ts`,
    startLine: 10,
    endLine: 14,
    language: 'typescript',
    contentHash: CONTENT_HASH,
    excerpt: 'export const value = 1;',
    html: '<pre><code>export const value = 1;</code></pre>',
    ...overrides,
  };
}

export function node(
  id: string,
  overrides: Partial<PositionedNode> = {},
): PositionedNode {
  return {
    id,
    label: id,
    type: 'module',
    x: 16,
    y: 16,
    width: 176,
    height: 56,
    ...overrides,
  };
}

export function diagram(
  id: string,
  overrides: Partial<PositionedDiagram> = {},
): PositionedDiagram {
  return {
    id,
    kind: 'architecture',
    title: id,
    width: 400,
    height: 200,
    nodes: [],
    edges: [],
    ...overrides,
  };
}

export function beat(id: string, overrides: Partial<CompiledBeat> = {}): CompiledBeat {
  return {
    id,
    title: id,
    narration: 'A short narration passage for the canvas test fixture.',
    durationMs: 6000,
    anchors: [],
    stage: { anchorIds: [], nodeIds: [], edgeIds: [] },
    suggestedQuestions: [],
    ...overrides,
  };
}

export function chapter(
  id: string,
  overrides: Partial<CompiledChapter> = {},
): CompiledChapter {
  return {
    id,
    title: id,
    summary: 'A chapter summary for the canvas test fixture.',
    diagrams: [],
    beats: [],
    ...overrides,
  };
}

export function tour(
  chapters: CompiledChapter[],
  overrides: Partial<CompiledTour> = {},
): CompiledTour {
  return {
    schemaVersion: '1.1.0',
    id: 'tour_canvas_fixture',
    title: 'Canvas fixture',
    subtitle: 'Two diagrams and four code anchors.',
    audience: 'new-contributor',
    project: {
      slug: 'fixture',
      name: 'Fixture',
      revision: { commit: '9fef24d', branch: 'main', dirty: false },
    },
    locale: 'en',
    sourceLocale: 'en',
    availableLocales: ['en'],
    estimatedDurationMs: 12000,
    chapters,
    ...overrides,
  };
}

export function requestDiagram(): PositionedDiagram {
  return diagram('diagram_request', {
    title: 'Request path',
    width: 400,
    height: 200,
    nodes: [
      node('node_app', { label: 'App', x: 16, y: 16, anchorId: 'anchor_app' }),
      node('node_server', {
        label: 'Server',
        x: 16,
        y: 96,
        anchorId: 'anchor_server',
      }),
      node('node_store', { label: 'Store', x: 208, y: 96 }),
    ],
  });
}

export function mapDiagram(): PositionedDiagram {
  return diagram('diagram_map', {
    kind: 'tree',
    title: 'Repository map',
    width: 360,
    height: 160,
    nodes: [
      node('node_notes', { label: 'Notes', x: 16, y: 16, anchorId: 'anchor_app' }),
      node('node_config', { label: 'Config', x: 208, y: 16 }),
    ],
  });
}

export function requestBeat(): CompiledBeat {
  return beat('beat_request', {
    title: 'The request reaches the server',
    anchors: [
      anchor('anchor_server', {
        path: 'src/server.ts',
        symbol: 'createServer',
        label: 'Server bootstrap',
        startLine: 22,
        endLine: 30,
        excerpt: 'export function createServer() {\n  return app;\n}',
        html: '<pre><code>export function createServer() {\n  return app;\n}</code></pre>',
      }),
      anchor('anchor_app', {
        path: 'src/app.ts',
        symbol: 'startApp',
        startLine: 10,
        endLine: 14,
      }),
      anchor('anchor_store', {
        path: 'src/store.ts',
        startLine: 5,
        endLine: 8,
      }),
      anchor('anchor_extra', {
        path: 'src/config.ts',
        symbol: 'loadConfig',
        startLine: 40,
        endLine: 46,
      }),
    ],
    stage: {
      anchorIds: ['anchor_server'],
      diagramId: 'diagram_request',
      nodeIds: ['node_server'],
      edgeIds: [],
    },
  });
}

export function canvasTour(): CompiledTour {
  return tour([
    chapter('chapter_request', {
      diagrams: [mapDiagram(), requestDiagram()],
      beats: [requestBeat()],
    }),
    chapter('chapter_other', {
      diagrams: [
        diagram('diagram_other', {
          title: 'Other chapter map',
          width: 320,
          height: 140,
          nodes: [node('node_other', { label: 'Other' })],
        }),
      ],
      beats: [
        beat('beat_other', {
          anchors: [anchor('anchor_other', { path: 'src/other.ts' })],
          stage: {
            anchorIds: ['anchor_other'],
            diagramId: 'diagram_other',
            nodeIds: ['node_other'],
            edgeIds: [],
          },
        }),
      ],
    }),
  ]);
}
