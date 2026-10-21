import type { CanvasDirection } from '@sothspell/canvas';

/**
 * The board's focus is a small state machine layered over the Phase 17
 * selection reducer. Keeping the item steps pure means the keyboard contract is
 * tested without React Flow, and the DOM adapter only has to focus the element
 * the state names.
 */
export type CanvasFocusLevel = 'root' | 'diagram' | 'container' | 'item';

export interface CanvasFocusState {
  level: CanvasFocusLevel;
  diagramId: string | null;
  containerId?: string;
  itemIndex?: number;
}

export function rootCanvasFocus(): CanvasFocusState {
  return { level: 'root', diagramId: null };
}

export function diagramCanvasFocus(diagramId: string | null): CanvasFocusState {
  return { level: 'diagram', diagramId };
}

export function containerCanvasFocus(
  containerId: string,
  diagramId: string | null,
): CanvasFocusState {
  return { level: 'container', diagramId, containerId };
}

export function itemCanvasFocus(
  containerId: string,
  diagramId: string | null,
  itemIndex: number,
  itemCount: number,
): CanvasFocusState {
  if (itemCount <= 0) {
    return containerCanvasFocus(containerId, diagramId);
  }
  return {
    level: 'item',
    diagramId,
    containerId,
    itemIndex: clampIndex(itemIndex, itemCount),
  };
}

/** Diagram objects are roving items too, but have no code container. */
export function diagramItemCanvasFocus(
  diagramId: string,
  itemIndex: number,
  itemCount: number,
): CanvasFocusState {
  if (itemCount <= 0) {
    return diagramCanvasFocus(diagramId);
  }
  return {
    level: 'item',
    diagramId,
    itemIndex: clampIndex(itemIndex, itemCount),
  };
}

export function clampIndex(index: number, count: number): number {
  if (count <= 0) {
    return 0;
  }
  return Math.min(count - 1, Math.max(0, index));
}

/**
 * Escape steps out one level at a time: item → container → home diagram.
 * A diagram focus is already the top of the board; Escape leaves it there so
 * the player's own Escape handling is never swallowed by an empty step.
 */
export function escapeCanvasFocus(
  state: CanvasFocusState,
  homeDiagramId: string | null,
): CanvasFocusState {
  if (state.level === 'item' && state.containerId !== undefined) {
    return containerCanvasFocus(state.containerId, state.diagramId);
  }
  if (state.level === 'item') {
    return diagramCanvasFocus(state.diagramId);
  }
  if (state.level === 'container') {
    return diagramCanvasFocus(homeDiagramId);
  }
  if (state.level === 'diagram') {
    return diagramCanvasFocus(state.diagramId ?? homeDiagramId);
  }
  return state;
}

/** Moves within one container's focusable actions, clamped at both ends. */
export function moveCanvasItemFocus(
  state: CanvasFocusState,
  delta: number,
  itemCount: number,
): CanvasFocusState {
  if (state.level !== 'item') {
    return state;
  }
  return {
    ...state,
    itemIndex: clampIndex((state.itemIndex ?? 0) + delta, itemCount),
  };
}

/**
 * Arrow keys and HJKL share one direction map. Shift is reserved by the
 * shortcut sheet (`Shift+H` home, `Shift+A` auto-arrange), so shifted letters
 * are not movement.
 */
export function directionForKey(key: string, shiftKey = false): CanvasDirection | null {
  if (shiftKey) {
    return null;
  }
  switch (key) {
    case 'ArrowUp':
      return 'up';
    case 'ArrowDown':
      return 'down';
    case 'ArrowLeft':
      return 'left';
    case 'ArrowRight':
      return 'right';
    case 'h':
    case 'H':
      return 'left';
    case 'j':
    case 'J':
      return 'down';
    case 'k':
    case 'K':
      return 'up';
    case 'l':
    case 'L':
      return 'right';
    default:
      return null;
  }
}

/** Item movement uses the vertical reading order for all four directions. */
export function itemDeltaForKey(key: string): number | null {
  switch (key) {
    case 'ArrowUp':
    case 'ArrowLeft':
    case 'h':
    case 'H':
    case 'k':
    case 'K':
      return -1;
    case 'ArrowDown':
    case 'ArrowRight':
    case 'j':
    case 'J':
    case 'l':
    case 'L':
      return 1;
    default:
      return null;
  }
}

export function isBoardLevelFocus(state: CanvasFocusState): boolean {
  return state.level !== 'item';
}
