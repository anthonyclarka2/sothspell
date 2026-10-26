import { describe, expect, it } from 'vitest';
import { buildCanvasScene } from './scene.js';
import {
  createCanvasSelection,
  enterCanvasItem,
  escapeCanvasSelection,
  homeCanvasSelection,
  moveCanvasItem,
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

function containerState(
  scene = fixtureScene(),
  containerId = 'anchor_server',
): CanvasSelectionState {
  return select(
    createCanvasSelection(scene),
    { type: 'selectContainer', containerId },
    scene,
  );
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

describe('canvas item navigation', () => {
  const ITEMS = [
    'item_symbol',
    'item_range',
    'item_incoming',
    'item_outgoing',
    'item_code',
    'item_collapse',
  ] as const;

  function itemState(
    scene: CanvasScene,
    containerId = 'anchor_server',
  ): CanvasSelectionState {
    const container = containerState(scene, containerId);
    return enterCanvasItem(scene, container, ITEMS);
  }

  it('enters the first item when the caller supplies the item order', () => {
    const scene = fixtureScene();
    const container = containerState(scene);
    const entered = reduceCanvasSelection(scene, container, { type: 'enter' }, ITEMS);

    expect(entered.selection).toEqual({
      level: 'item',
      diagramId: 'diagram_request',
      containerId: 'anchor_server',
      itemId: 'item_symbol',
    });
    expect(enterCanvasItem(scene, container, ITEMS)).toEqual(entered);
  });

  it('does not guess item order when the caller supplies none', () => {
    const scene = fixtureScene();
    const container = containerState(scene);
    const canvas = createCanvasSelection(scene);

    expect(select(container, { type: 'enter' }, scene)).toBe(container);
    expect(enterCanvasItem(scene, container, [])).toBe(container);
    expect(enterCanvasItem(scene, canvas, ITEMS)).toBe(canvas);
  });

  it('still opens a cited container from a diagram object when items are supplied', () => {
    const scene = fixtureScene();
    const object = select(createCanvasSelection(scene), {
      type: 'selectObject',
      diagramId: 'diagram_request',
      objectId: 'node_app',
    });

    expect(
      reduceCanvasSelection(scene, object, { type: 'enter' }, ITEMS).selection,
    ).toEqual({
      level: 'container',
      diagramId: 'diagram_request',
      containerId: 'anchor_app',
    });
  });

  it('steps next and previous through the order and wraps at both ends', () => {
    const scene = fixtureScene();
    const first = itemState(scene);

    expect(
      reduceCanvasSelection(scene, first, { type: 'moveItem', direction: 'next' }, ITEMS)
        .selection,
    ).toMatchObject({ level: 'item', itemId: 'item_range' });
    expect(moveCanvasItem(scene, first, ITEMS, 'previous').selection).toMatchObject({
      level: 'item',
      itemId: 'item_collapse',
    });

    const last = enterCanvasItem(scene, containerState(scene), ITEMS);
    let cursor = last;
    for (let step = 1; step < ITEMS.length; step += 1) {
      cursor = moveCanvasItem(scene, cursor, ITEMS, 'next');
    }
    expect(cursor.selection.itemId).toBe('item_collapse');
    expect(
      reduceCanvasSelection(scene, cursor, { type: 'moveItem', direction: 'next' }, ITEMS)
        .selection,
    ).toEqual(first.selection);
  });

  it('falls back to the first item when the selected item is gone', () => {
    const scene = fixtureScene();
    const stale: CanvasSelectionState = {
      selection: {
        level: 'item',
        diagramId: 'diagram_request',
        containerId: 'anchor_server',
        itemId: 'item_missing',
      },
    };

    expect(moveCanvasItem(scene, stale, ITEMS, 'next').selection).toEqual({
      level: 'item',
      diagramId: 'diagram_request',
      containerId: 'anchor_server',
      itemId: 'item_symbol',
    });
  });

  it('steps out to its container and then home to the diagram', () => {
    const scene = fixtureScene();
    const item = itemState(scene, 'anchor_extra');
    const steppedOut = escapeCanvasSelection(scene, item);

    expect(steppedOut.selection).toEqual({
      level: 'container',
      diagramId: 'diagram_request',
      containerId: 'anchor_extra',
    });
    expect(escapeCanvasSelection(scene, steppedOut).selection).toEqual(
      homeCanvasSelection(scene),
    );
  });

  it('does nothing when there are no items or the container is unknown', () => {
    const scene = fixtureScene();
    const item = itemState(scene);
    const container = containerState(scene);
    const itemInMissingContainer: CanvasSelectionState = {
      selection: {
        level: 'item',
        diagramId: 'diagram_request',
        containerId: 'anchor_missing',
        itemId: 'item_symbol',
      },
    };

    expect(moveCanvasItem(scene, item, [], 'next')).toBe(item);
    expect(
      reduceCanvasSelection(scene, item, { type: 'moveItem', direction: 'next' }, []),
    ).toBe(item);
    expect(moveCanvasItem(scene, container, ITEMS, 'next')).toBe(container);
    expect(moveCanvasItem(scene, itemInMissingContainer, ITEMS, 'next')).toBe(
      itemInMissingContainer,
    );
    expect(
      enterCanvasItem(scene, containerState(scene, 'anchor_missing'), ITEMS),
    ).toEqual(containerState(scene, 'anchor_missing'));
  });

  it('uses the container geometry when a spatial move starts from an item', () => {
    const scene = fixtureScene();
    const item = itemState(scene, 'anchor_server');

    expect(select(item, { type: 'move', direction: 'down' }, scene).selection).toEqual({
      level: 'container',
      diagramId: 'diagram_request',
      containerId: 'anchor_app',
    });
  });
});
