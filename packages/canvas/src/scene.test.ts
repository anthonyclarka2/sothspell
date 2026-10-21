import { describe, expect, it } from 'vitest';
import { buildCanvasScene } from './scene.js';
import {
  anchor,
  beat,
  canvasTour,
  diagram,
  node,
  requestBeat,
  tour,
} from './test-support.js';

describe('buildCanvasScene diagrams', () => {
  it('uses the beat stage diagram as home even when the chapter lists another first', () => {
    const fixtureTour = canvasTour();
    const scene = buildCanvasScene(fixtureTour, requestBeat());

    expect(scene.tourId).toBe('tour_canvas_fixture');
    expect(scene.beatId).toBe('beat_request');
    expect(scene.chapterId).toBe('chapter_request');
    expect(scene.homeDiagramId).toBe('diagram_request');
    expect(scene.diagrams.map((card) => card.id)).toEqual(['diagram_request']);
    expect(scene.diagrams[0]?.home).toBe(true);
    expect(scene.diagrams[0]?.title).toBe('Request path');
  });

  it('copies diagram nodes as card-relative objects with their anchors', () => {
    const scene = buildCanvasScene(canvasTour(), requestBeat());

    expect(scene.diagrams[0]?.objects).toEqual([
      {
        id: 'node_app',
        label: 'App',
        type: 'module',
        x: 16,
        y: 16,
        width: 176,
        height: 56,
        anchorId: 'anchor_app',
      },
      {
        id: 'node_server',
        label: 'Server',
        type: 'module',
        x: 16,
        y: 96,
        width: 176,
        height: 56,
        anchorId: 'anchor_server',
      },
      {
        id: 'node_store',
        label: 'Store',
        type: 'module',
        x: 208,
        y: 96,
        width: 176,
        height: 56,
      },
    ]);
  });

  it('falls back to the chapter first diagram when the beat has no diagram', () => {
    const fixtureTour = canvasTour();
    const beatWithoutDiagram = {
      ...requestBeat(),
      stage: { anchorIds: ['anchor_server'], nodeIds: [], edgeIds: [] },
    };

    const scene = buildCanvasScene(fixtureTour, beatWithoutDiagram);

    expect(scene.homeDiagramId).toBe('diagram_map');
    expect(scene.diagrams.map((card) => card.id)).toEqual(['diagram_map']);
    expect(scene.diagrams[0]?.home).toBe(true);
  });

  it('adds requested satellites from the same chapter once, after the home card', () => {
    const scene = buildCanvasScene(canvasTour(), requestBeat(), {
      openDiagramIds: ['diagram_map', 'diagram_map', 'diagram_other', 'diagram_missing'],
    });

    expect(scene.diagrams.map((card) => card.id)).toEqual([
      'diagram_request',
      'diagram_map',
    ]);
    expect(scene.diagrams.map((card) => card.home)).toEqual([true, false]);
    expect(scene.diagrams[1]?.objects.map((object) => object.id)).toEqual([
      'node_notes',
      'node_config',
    ]);
  });

  it('is deterministic for the same tour, beat, and options', () => {
    const first = buildCanvasScene(canvasTour(), requestBeat(), {
      openDiagramIds: ['diagram_map'],
    });
    const second = buildCanvasScene(canvasTour(), requestBeat(), {
      openDiagramIds: ['diagram_map'],
    });

    expect(second).toEqual(first);
  });

  it('rejects a beat that is not in the tour', () => {
    expect(() =>
      buildCanvasScene(canvasTour(), { ...requestBeat(), id: 'beat_missing' }),
    ).toThrow('beat beat_missing is not in tour tour_canvas_fixture');
  });
});

describe('buildCanvasScene code containers', () => {
  it('opens the beat anchors in order with label, symbol, or path as the label', () => {
    const scene = buildCanvasScene(canvasTour(), requestBeat());

    expect(scene.containers.map((container) => container.id)).toEqual([
      'anchor_server',
      'anchor_app',
      'anchor_store',
      'anchor_extra',
    ]);
    expect(scene.containers.map((container) => container.label)).toEqual([
      'Server bootstrap',
      'startApp',
      'src/store.ts',
      'loadConfig',
    ]);
    expect(scene.containers[0]).toMatchObject({
      anchorId: 'anchor_server',
      path: 'src/server.ts',
      startLine: 22,
      endLine: 30,
      language: 'typescript',
      excerpt: 'export function createServer() {\n  return app;\n}',
      collapsed: true,
    });
    expect(scene.containers[0]?.html).toContain('createServer');
    expect(scene.hiddenContainerCount).toBe(0);
  });

  it('applies the container limit and counts the anchors it hides', () => {
    const scene = buildCanvasScene(canvasTour(), requestBeat(), {
      containerLimit: 2,
    });

    expect(scene.containers.map((container) => container.id)).toEqual([
      'anchor_server',
      'anchor_app',
    ]);
    expect(scene.hiddenContainerCount).toBe(2);
  });

  it('opens one container when the beat cites one anchor', () => {
    const singleAnchorBeat = beat('beat_single', {
      anchors: [anchor('anchor_only', { path: 'src/only.ts' })],
      stage: {
        anchorIds: ['anchor_only'],
        diagramId: 'diagram_request',
        nodeIds: ['node_app'],
        edgeIds: [],
      },
    });
    const scene = buildCanvasScene(
      tour([
        {
          id: 'chapter_single',
          title: 'Single',
          summary: 'One anchor for the empty and single cases.',
          diagrams: [diagram('diagram_request')],
          beats: [singleAnchorBeat],
        },
      ]),
      singleAnchorBeat,
    );

    expect(scene.containers).toHaveLength(1);
    expect(scene.hiddenContainerCount).toBe(0);
    expect(scene.links).toEqual([]);
  });
});

describe('buildCanvasScene evidence links', () => {
  it('cites each object whose anchor is open, at the anchor start line', () => {
    const scene = buildCanvasScene(canvasTour(), requestBeat());

    expect(scene.links).toEqual([
      {
        kind: 'evidence',
        id: 'evidence:diagram_request:node_app:anchor_app',
        fromDiagramId: 'diagram_request',
        fromObjectId: 'node_app',
        toContainerId: 'anchor_app',
        toLine: 10,
      },
      {
        kind: 'evidence',
        id: 'evidence:diagram_request:node_server:anchor_server',
        fromDiagramId: 'diagram_request',
        fromObjectId: 'node_server',
        toContainerId: 'anchor_server',
        toLine: 22,
      },
    ]);
  });

  it('does not cite an anchor that the container limit hid', () => {
    const scene = buildCanvasScene(canvasTour(), requestBeat(), {
      containerLimit: 1,
    });

    expect(scene.containers.map((container) => container.id)).toEqual(['anchor_server']);
    expect(scene.links.map((link) => link.toContainerId)).toEqual(['anchor_server']);
  });

  it('cites objects from satellite diagrams too and leaves flow links to Phase 18', () => {
    const scene = buildCanvasScene(canvasTour(), requestBeat(), {
      openDiagramIds: ['diagram_map'],
    });

    expect(scene.links.map((link) => link.id)).toEqual([
      'evidence:diagram_request:node_app:anchor_app',
      'evidence:diagram_request:node_server:anchor_server',
      'evidence:diagram_map:node_notes:anchor_app',
    ]);
    expect(scene.links.every((link) => link.kind === 'evidence')).toBe(true);
  });

  it('carries symbol targets when the compiled artefacts provide them', () => {
    const symbolAnchor = {
      ...anchor('anchor_app'),
      symbolId: 'symbol:startApp',
    };
    const symbolNode = {
      ...node('node_app', { anchorId: 'anchor_app' }),
      symbolId: 'symbol:startApp',
    };
    const symbolBeat = beat('beat_symbol', {
      anchors: [symbolAnchor],
      stage: {
        anchorIds: ['anchor_app'],
        diagramId: 'diagram_request',
        nodeIds: ['node_app'],
        edgeIds: [],
      },
    });
    const symbolTour = tour([
      {
        id: 'chapter_symbol',
        title: 'Symbols',
        summary: 'A chapter carrying symbol targets from Phase 18.',
        diagrams: [diagram('diagram_request', { nodes: [symbolNode] })],
        beats: [symbolBeat],
      },
    ]);

    const scene = buildCanvasScene(symbolTour, symbolBeat);

    expect(scene.containers[0]?.symbolId).toBe('symbol:startApp');
    expect(scene.diagrams[0]?.objects[0]?.symbolId).toBe('symbol:startApp');
  });
});
