import { describe, expect, it } from 'vitest';
import { buildCanvasScene } from './scene.js';
import {
  createCanvasSelection,
  escapeCanvasSelection,
  homeCanvasSelection,
  reduceCanvasSelection,
} from './selection.js';
import {
  anchor,
  beat,
  chapter,
  diagram,
  node,
  requestBeat,
  tour,
  canvasTour,
} from './test-support.js';
import type { CanvasScene, CanvasSelectionState } from './types.js';

function fixtureScene(): CanvasScene {
  return buildCanvasScene(canvasTour(), requestBeat(), {
    openDiagramIds: ['diagram_map'],
  });
}

function select(
  state: CanvasSelectionState,
  action: Parameters<typeof reduceCanvasSelection>[2],
  scene = fixtureScene(),
): CanvasSelectionState {
  return reduceCanvasSelection(scene, state, action);
}

describe('canvas selection transitions', () => {
  it('starts on the home diagram', () => {
    const state = createCanvasSelection(fixtureScene());

    expect(state.selection).toEqual({
      level: 'canvas',
      diagramId: 'diagram_request',
    });
    expect(homeCanvasSelection(fixtureScene())).toEqual(state.selection);
  });

  it('selects a code container and keeps the diagram context', () => {
    const state = select(createCanvasSelection(fixtureScene()), {
      type: 'selectContainer',
      containerId: 'anchor_server',
    });

    expect(state.selection).toEqual({
      level: 'container',
      diagramId: 'diagram_request',
      containerId: 'anchor_server',
    });
  });

  it('ignores an unknown container', () => {
    const initial = createCanvasSelection(fixtureScene());

    expect(
      reduceCanvasSelection(fixtureScene(), initial, {
        type: 'selectContainer',
        containerId: 'anchor_missing',
      }),
    ).toBe(initial);
  });

  it('selects a diagram object and ignores unknown objects', () => {
    const scene = fixtureScene();
    const initial = createCanvasSelection(scene);

    expect(
      reduceCanvasSelection(scene, initial, {
        type: 'selectObject',
        diagramId: 'diagram_request',
        objectId: 'node_app',
      }).selection,
    ).toEqual({
      level: 'canvas',
      diagramId: 'diagram_request',
      objectId: 'node_app',
    });

    expect(
      reduceCanvasSelection(scene, initial, {
        type: 'selectObject',
        diagramId: 'diagram_request',
        objectId: 'node_missing',
      }),
    ).toBe(initial);
  });

  it('enters the container cited by the selected object', () => {
    const scene = fixtureScene();
    const object = select(createCanvasSelection(scene), {
      type: 'selectObject',
      diagramId: 'diagram_request',
      objectId: 'node_app',
    });

    expect(select(object, { type: 'enter' }, scene).selection).toEqual({
      level: 'container',
      diagramId: 'diagram_request',
      containerId: 'anchor_app',
    });
  });

  it('does not enter when the selected object cites no open anchor', () => {
    const scene = fixtureScene();
    const object = select(createCanvasSelection(scene), {
      type: 'selectObject',
      diagramId: 'diagram_request',
      objectId: 'node_store',
    });

    expect(select(object, { type: 'enter' }, scene)).toBe(object);
  });

  it('escapes a container to the home diagram', () => {
    const scene = fixtureScene();
    const container = select(createCanvasSelection(scene), {
      type: 'selectContainer',
      containerId: 'anchor_extra',
    });

    expect(escapeCanvasSelection(scene, container).selection).toEqual(
      homeCanvasSelection(scene),
    );
  });

  it('steps an object back to its diagram and a satellite card back home', () => {
    const scene = fixtureScene();
    const object: CanvasSelectionState = {
      selection: {
        level: 'canvas',
        diagramId: 'diagram_request',
        objectId: 'node_app',
      },
    };
    const satellite: CanvasSelectionState = {
      selection: { level: 'canvas', diagramId: 'diagram_map' },
    };

    expect(escapeCanvasSelection(scene, object).selection).toEqual({
      level: 'canvas',
      diagramId: 'diagram_request',
    });
    expect(escapeCanvasSelection(scene, satellite).selection).toEqual(
      homeCanvasSelection(scene),
    );
    expect(escapeCanvasSelection(scene, createCanvasSelection(scene))).toEqual(
      createCanvasSelection(scene),
    );
  });
});

describe('canvas selection movement', () => {
  it('moves right from home to the nearest container column', () => {
    const state = select(createCanvasSelection(fixtureScene()), {
      type: 'move',
      direction: 'right',
    });

    expect(state.selection).toEqual({
      level: 'container',
      diagramId: 'diagram_request',
      containerId: 'anchor_server',
    });
  });

  it('moves across a row and down a column', () => {
    const scene = fixtureScene();
    const server: CanvasSelectionState = {
      selection: {
        level: 'container',
        diagramId: 'diagram_request',
        containerId: 'anchor_server',
      },
    };

    expect(
      select(server, { type: 'move', direction: 'down' }, scene).selection,
    ).toMatchObject({
      containerId: 'anchor_app',
    });
    expect(
      select(server, { type: 'move', direction: 'right' }, scene).selection,
    ).toMatchObject({
      containerId: 'anchor_store',
    });
    expect(
      select(
        {
          selection: {
            level: 'container',
            diagramId: 'diagram_request',
            containerId: 'anchor_app',
          },
        },
        { type: 'move', direction: 'up' },
        scene,
      ).selection,
    ).toMatchObject({ containerId: 'anchor_server' });
    expect(
      select(
        {
          selection: {
            level: 'container',
            diagramId: 'diagram_request',
            containerId: 'anchor_store',
          },
        },
        { type: 'move', direction: 'left' },
        scene,
      ).selection,
    ).toMatchObject({ containerId: 'anchor_server' });
  });

  it('moves left from the first container to home and down from home to a satellite', () => {
    const scene = fixtureScene();

    expect(
      select(
        {
          selection: {
            level: 'container',
            diagramId: 'diagram_request',
            containerId: 'anchor_server',
          },
        },
        { type: 'move', direction: 'left' },
        scene,
      ).selection,
    ).toEqual(homeCanvasSelection(scene));

    expect(
      select(createCanvasSelection(scene), {
        type: 'move',
        direction: 'down',
      }).selection,
    ).toEqual({ level: 'canvas', diagramId: 'diagram_map' });
  });

  it('does not wrap at the edges or move in an empty direction', () => {
    const scene = fixtureScene();
    const home = createCanvasSelection(scene);
    const extra: CanvasSelectionState = {
      selection: {
        level: 'container',
        diagramId: 'diagram_request',
        containerId: 'anchor_extra',
      },
    };

    expect(select(home, { type: 'move', direction: 'left' }, scene)).toBe(home);
    expect(select(home, { type: 'move', direction: 'up' }, scene)).toBe(home);
    expect(select(extra, { type: 'move', direction: 'right' }, scene)).toBe(extra);
  });

  it('breaks a geometric tie by scene order, independent of option order', () => {
    const tieTour = tour([
      chapter('chapter_tie', {
        diagrams: [
          diagram('diagram_tie_home', {
            title: 'Home',
            width: 464,
            height: 100,
            nodes: [node('node_tie_home')],
          }),
          diagram('diagram_tie_left', {
            title: 'Left',
            width: 200,
            height: 80,
            nodes: [node('node_tie_left')],
          }),
          diagram('diagram_tie_right', {
            title: 'Right',
            width: 200,
            height: 80,
            nodes: [node('node_tie_right')],
          }),
        ],
        beats: [
          beat('beat_tie', {
            anchors: [anchor('anchor_tie')],
            stage: {
              anchorIds: ['anchor_tie'],
              diagramId: 'diagram_tie_home',
              nodeIds: ['node_tie_home'],
              edgeIds: [],
            },
          }),
        ],
      }),
    ]);
    const tieBeat = tieTour.chapters[0]?.beats[0];
    if (!tieBeat) {
      throw new Error('tie fixture must have a beat');
    }

    const first = buildCanvasScene(tieTour, tieBeat, {
      openDiagramIds: ['diagram_tie_right', 'diagram_tie_left'],
      containerLimit: 0,
    });
    const second = buildCanvasScene(tieTour, tieBeat, {
      openDiagramIds: ['diagram_tie_left', 'diagram_tie_right'],
      containerLimit: 0,
    });

    const down = reduceCanvasSelection(first, createCanvasSelection(first), {
      type: 'move',
      direction: 'down',
    });
    expect(down.selection).toEqual({
      level: 'canvas',
      diagramId: 'diagram_tie_left',
    });
    expect(
      reduceCanvasSelection(second, createCanvasSelection(second), {
        type: 'move',
        direction: 'down',
      }).selection,
    ).toEqual(down.selection);
  });

  it('stays put when the scene has nothing to move to', () => {
    const empty: CanvasScene = {
      tourId: 'tour_empty',
      beatId: 'beat_empty',
      chapterId: 'chapter_empty',
      homeDiagramId: null,
      diagrams: [],
      containers: [],
      hiddenContainerCount: 0,
      links: [],
    };
    const state = createCanvasSelection(empty);

    expect(select(state, { type: 'move', direction: 'right' }, empty)).toBe(state);
  });
});
