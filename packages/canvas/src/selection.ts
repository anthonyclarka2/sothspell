import { layoutCanvas } from './layout.js';
import type {
  CanvasDirection,
  CanvasItemDirection,
  CanvasLayoutItem,
  CanvasSelection,
  CanvasSelectionAction,
  CanvasSelectionState,
  CanvasScene,
} from './types.js';
import { codeContainerKey, diagramCardKey } from './types.js';

/**
 * Movement uses the deterministic layout at the reference viewport. The board
 * can be panned and zoomed without changing card geometry, and Phase 19 can
 * replace this with measured positions once cards are draggable.
 */
const MOVEMENT_VIEWPORT = { width: 1440, height: 900 };

interface MoveTarget {
  kind: 'diagram' | 'container';
  id: string;
}

interface MoveNode {
  key: string;
  rect: CanvasLayoutItem;
  target: MoveTarget;
  order: number;
}

/** Starts on the home diagram, which is the canvas selection home. */
export function createCanvasSelection(scene: CanvasScene): CanvasSelectionState {
  return {
    selection: {
      level: 'canvas',
      diagramId: scene.homeDiagramId,
    },
  };
}

/** Selection transitions are pure so the keyboard model can be tested alone. */
export function reduceCanvasSelection(
  scene: CanvasScene,
  state: CanvasSelectionState,
  action: CanvasSelectionAction,
  items: readonly string[] = [],
): CanvasSelectionState {
  switch (action.type) {
    case 'selectContainer':
      return selectContainer(scene, state, action.containerId);
    case 'selectObject':
      return selectObject(scene, state, action.diagramId, action.objectId);
    case 'enter':
      return enterSelection(scene, state, items);
    case 'escape':
      return escapeCanvasSelection(scene, state);
    case 'move':
      return moveSelection(scene, state, action.direction);
    case 'moveItem':
      return moveCanvasItem(scene, state, items, action.direction);
  }
}

/** The selection a viewer sees after pressing Escape. */
export function escapeCanvasSelection(
  scene: CanvasScene,
  state: CanvasSelectionState,
): CanvasSelectionState {
  const { selection } = state;

  if (selection.level === 'item') {
    const containerId = selection.containerId;
    if (containerId !== undefined && hasContainer(scene, containerId)) {
      return {
        selection: {
          level: 'container',
          diagramId: diagramContext(scene, selection),
          containerId,
        },
      };
    }
    return { selection: homeCanvasSelection(scene) };
  }
  if (selection.level === 'container') {
    return { selection: homeCanvasSelection(scene) };
  }
  if (selection.objectId !== undefined) {
    return { selection: { level: 'canvas', diagramId: selection.diagramId } };
  }
  if (selection.diagramId !== scene.homeDiagramId) {
    return { selection: homeCanvasSelection(scene) };
  }
  return state;
}

/**
 * Enters the first item of the selected container. The scene has no item model:
 * symbols, line links, relation toggles, and actions belong to the renderer, so
 * the caller passes the visible order and this reducer never invents an id.
 */
export function enterCanvasItem(
  scene: CanvasScene,
  state: CanvasSelectionState,
  itemIds: readonly string[],
): CanvasSelectionState {
  const { selection } = state;
  const containerId = selection.containerId;
  if (
    selection.level !== 'container' ||
    containerId === undefined ||
    !hasContainer(scene, containerId)
  ) {
    return state;
  }

  const itemId = usableItemIds(itemIds)[0];
  if (itemId === undefined) {
    return state;
  }

  return {
    selection: {
      level: 'item',
      diagramId: diagramContext(scene, selection),
      containerId,
      itemId,
    },
  };
}

/**
 * Moves through the caller's item order. Item lists wrap at both ends because
 * the order is short and the viewer should not need a second key to reverse
 * direction. A stale item id, such as one removed by a relation reload, restarts
 * at the first item instead of escaping the container.
 */
export function moveCanvasItem(
  scene: CanvasScene,
  state: CanvasSelectionState,
  itemIds: readonly string[],
  direction: CanvasItemDirection,
): CanvasSelectionState {
  const { selection } = state;
  const containerId = selection.containerId;
  if (
    selection.level !== 'item' ||
    containerId === undefined ||
    !hasContainer(scene, containerId)
  ) {
    return state;
  }

  const items = usableItemIds(itemIds);
  if (items.length === 0) {
    return state;
  }

  const currentIndex =
    selection.itemId === undefined ? -1 : items.indexOf(selection.itemId);
  const step = direction === 'next' ? 1 : -1;
  const nextIndex =
    currentIndex === -1 ? 0 : (currentIndex + step + items.length) % items.length;
  const itemId = items[nextIndex];
  if (itemId === undefined || itemId === selection.itemId) {
    return state;
  }

  return {
    selection: {
      level: 'item',
      diagramId: selection.diagramId,
      containerId,
      itemId,
    },
  };
}

/** Selection used by the initial outline and by the home control. */
export function homeCanvasSelection(scene: CanvasScene): CanvasSelection {
  return { level: 'canvas', diagramId: scene.homeDiagramId };
}

function selectContainer(
  scene: CanvasScene,
  state: CanvasSelectionState,
  containerId: string,
): CanvasSelectionState {
  const container = scene.containers.find((candidate) => candidate.id === containerId);
  if (!container) {
    return state;
  }
  return {
    selection: {
      level: 'container',
      diagramId: diagramContext(scene, state.selection),
      containerId: container.id,
    },
  };
}

function selectObject(
  scene: CanvasScene,
  state: CanvasSelectionState,
  diagramId: string,
  objectId: string,
): CanvasSelectionState {
  const diagram = scene.diagrams.find((candidate) => candidate.id === diagramId);
  const object = diagram?.objects.find((candidate) => candidate.id === objectId);
  if (!diagram || !object) {
    return state;
  }
  return {
    selection: {
      level: 'canvas',
      diagramId: diagram.id,
      objectId: object.id,
    },
  };
}

/**
 * Enter activates the selected diagram object. In Phase 18 the same action will
 * also open a symbol definition when the object has no current-beat anchor.
 */
function enterSelection(
  scene: CanvasScene,
  state: CanvasSelectionState,
  items: readonly string[],
): CanvasSelectionState {
  const { selection } = state;
  if (selection.level === 'container') {
    return enterCanvasItem(scene, state, items);
  }
  if (
    selection.level !== 'canvas' ||
    selection.diagramId === null ||
    selection.objectId === undefined
  ) {
    return state;
  }

  const diagram = scene.diagrams.find(
    (candidate) => candidate.id === selection.diagramId,
  );
  const object = diagram?.objects.find(
    (candidate) => candidate.id === selection.objectId,
  );
  if (!object?.anchorId) {
    return state;
  }

  const container = scene.containers.find(
    (candidate) => candidate.anchorId === object.anchorId,
  );
  return container ? selectContainer(scene, state, container.id) : state;
}

function moveSelection(
  scene: CanvasScene,
  state: CanvasSelectionState,
  direction: CanvasDirection,
): CanvasSelectionState {
  const nodes = movementNodes(scene);
  if (nodes.length === 0) {
    return state;
  }

  const current = currentNode(scene, state.selection, nodes);
  if (!current) {
    return state;
  }

  let best: MoveNode | null = null;
  for (const candidate of nodes) {
    if (candidate.key === current.key) {
      continue;
    }
    if (!isInDirection(current.rect, candidate.rect, direction)) {
      continue;
    }
    if (
      best === null ||
      compareCandidates(direction, current.rect, candidate, best) < 0
    ) {
      best = candidate;
    }
  }

  if (!best) {
    return state;
  }
  if (best.target.kind === 'diagram') {
    return {
      selection: { level: 'canvas', diagramId: best.target.id },
    };
  }
  return selectContainer(scene, state, best.target.id);
}

function movementNodes(scene: CanvasScene): MoveNode[] {
  const layout = layoutCanvas(scene, MOVEMENT_VIEWPORT);
  const nodes: MoveNode[] = [];
  const containerOrder = scene.diagrams.length;

  scene.diagrams.forEach((diagram, index) => {
    const rect = layout.items[diagramCardKey(diagram.id)];
    if (rect) {
      nodes.push({
        key: rect.id,
        rect,
        target: { kind: 'diagram', id: diagram.id },
        order: index,
      });
    }
  });

  scene.containers.forEach((container, index) => {
    const rect = layout.items[codeContainerKey(container.id)];
    if (rect) {
      nodes.push({
        key: rect.id,
        rect,
        target: { kind: 'container', id: container.id },
        order: containerOrder + index,
      });
    }
  });

  return nodes;
}

function currentNode(
  scene: CanvasScene,
  selection: CanvasSelection,
  nodes: MoveNode[],
): MoveNode | null {
  const key =
    (selection.level === 'container' || selection.level === 'item') &&
    selection.containerId !== undefined
      ? codeContainerKey(selection.containerId)
      : selection.diagramId !== null
        ? diagramCardKey(selection.diagramId)
        : null;

  const exact = key === null ? undefined : nodes.find((node) => node.key === key);
  if (exact) {
    return exact;
  }

  const fallbackDiagramId = selection.diagramId ?? scene.diagrams[0]?.id;
  return (
    nodes.find(
      (node) => node.target.kind === 'diagram' && node.target.id === fallbackDiagramId,
    ) ?? null
  );
}

/**
 * Candidates must sit inside a 45-degree cone around the requested direction.
 * A diagonal neighbour outside the cone stays reachable with two moves, which
 * keeps arrow navigation predictable on a grid.
 */
function isInDirection(
  from: CanvasLayoutItem,
  to: CanvasLayoutItem,
  direction: CanvasDirection,
): boolean {
  const dx = centerX(to) - centerX(from);
  const dy = centerY(to) - centerY(from);

  switch (direction) {
    case 'right':
      return dx > 0 && Math.abs(dy) <= dx;
    case 'left':
      return dx < 0 && Math.abs(dy) <= -dx;
    case 'down':
      return dy > 0 && Math.abs(dx) <= dy;
    case 'up':
      return dy < 0 && Math.abs(dx) <= -dy;
  }
}

function compareCandidates(
  direction: CanvasDirection,
  from: CanvasLayoutItem,
  a: MoveNode,
  b: MoveNode,
): number {
  const gap = edgeGap(direction, from, a.rect) - edgeGap(direction, from, b.rect);
  if (gap !== 0) {
    return gap;
  }

  const perpendicular =
    perpendicularDistance(direction, from, a.rect) -
    perpendicularDistance(direction, from, b.rect);
  if (perpendicular !== 0) {
    return perpendicular;
  }

  const axis =
    axisDistance(direction, from, a.rect) - axisDistance(direction, from, b.rect);
  if (axis !== 0) {
    return axis;
  }

  return a.order - b.order;
}

function edgeGap(
  direction: CanvasDirection,
  from: CanvasLayoutItem,
  to: CanvasLayoutItem,
): number {
  switch (direction) {
    case 'right':
      return Math.max(0, to.x - (from.x + from.width));
    case 'left':
      return Math.max(0, from.x - (to.x + to.width));
    case 'down':
      return Math.max(0, to.y - (from.y + from.height));
    case 'up':
      return Math.max(0, from.y - (to.y + to.height));
  }
}

function perpendicularDistance(
  direction: CanvasDirection,
  from: CanvasLayoutItem,
  to: CanvasLayoutItem,
): number {
  return direction === 'left' || direction === 'right'
    ? Math.abs(centerY(to) - centerY(from))
    : Math.abs(centerX(to) - centerX(from));
}

function axisDistance(
  direction: CanvasDirection,
  from: CanvasLayoutItem,
  to: CanvasLayoutItem,
): number {
  return direction === 'left' || direction === 'right'
    ? Math.abs(centerX(to) - centerX(from))
    : Math.abs(centerY(to) - centerY(from));
}

function centerX(rect: CanvasLayoutItem): number {
  return rect.x + rect.width / 2;
}

function centerY(rect: CanvasLayoutItem): number {
  return rect.y + rect.height / 2;
}

function diagramContext(scene: CanvasScene, selection: CanvasSelection): string | null {
  const diagramId = selection.diagramId;
  return diagramId !== null && scene.diagrams.some((diagram) => diagram.id === diagramId)
    ? diagramId
    : scene.homeDiagramId;
}

function hasContainer(scene: CanvasScene, containerId: string): boolean {
  return scene.containers.some((container) => container.id === containerId);
}

function usableItemIds(itemIds: readonly string[]): string[] {
  return itemIds.filter((itemId) => itemId.length > 0);
}
