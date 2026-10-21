import { describe, expect, it } from 'vitest';
import {
  clampIndex,
  containerCanvasFocus,
  diagramCanvasFocus,
  diagramItemCanvasFocus,
  directionForKey,
  escapeCanvasFocus,
  itemCanvasFocus,
  itemDeltaForKey,
  moveCanvasItemFocus,
  rootCanvasFocus,
} from './canvas-focus.js';

describe('canvas focus state', () => {
  it('maps arrows and HJKL to the same directions', () => {
    expect(directionForKey('ArrowUp')).toBe('up');
    expect(directionForKey('ArrowDown')).toBe('down');
    expect(directionForKey('ArrowLeft')).toBe('left');
    expect(directionForKey('ArrowRight')).toBe('right');
    expect(directionForKey('h')).toBe('left');
    expect(directionForKey('j')).toBe('down');
    expect(directionForKey('k')).toBe('up');
    expect(directionForKey('l')).toBe('right');
  });

  it('leaves shifted letters for the shortcut sheet', () => {
    expect(directionForKey('H', true)).toBeNull();
    expect(directionForKey('A', true)).toBeNull();
    expect(directionForKey('x')).toBeNull();
  });

  it('steps an item out to its container and the container to home', () => {
    const item = itemCanvasFocus('code_a', 'diagram_home', 2, 5);

    const container = escapeCanvasFocus(item, 'diagram_home');
    expect(container).toEqual({
      level: 'container',
      diagramId: 'diagram_home',
      containerId: 'code_a',
    });

    const home = escapeCanvasFocus(container, 'diagram_home');
    expect(home).toEqual({ level: 'diagram', diagramId: 'diagram_home' });
    expect(escapeCanvasFocus(home, 'diagram_home')).toEqual(home);
  });

  it('does not leave a root focus on Escape', () => {
    expect(escapeCanvasFocus(rootCanvasFocus(), 'diagram_home')).toEqual(
      rootCanvasFocus(),
    );
  });

  it('clamps item movement at both ends and keeps the container', () => {
    const first = itemCanvasFocus('code_a', 'diagram_home', 0, 3);
    const last = itemCanvasFocus('code_a', 'diagram_home', 2, 3);

    expect(moveCanvasItemFocus(first, -1, 3)).toEqual(first);
    expect(moveCanvasItemFocus(first, 1, 3)).toMatchObject({ itemIndex: 1 });
    expect(moveCanvasItemFocus(last, 1, 3)).toEqual(last);
    expect(moveCanvasItemFocus(containerCanvasFocus('code_a', 'd'), 1, 3)).toEqual(
      containerCanvasFocus('code_a', 'd'),
    );
    expect(itemDeltaForKey('ArrowDown')).toBe(1);
    expect(itemDeltaForKey('k')).toBe(-1);
    expect(itemDeltaForKey('Enter')).toBeNull();
  });

  it('moves diagram objects without a code container and escapes to the diagram', () => {
    const first = diagramItemCanvasFocus('diagram_home', 0, 2);
    const last = diagramItemCanvasFocus('diagram_home', 1, 2);

    expect(moveCanvasItemFocus(first, 1, 2)).toMatchObject({ itemIndex: 1 });
    expect(moveCanvasItemFocus(last, 1, 2)).toEqual(last);
    expect(escapeCanvasFocus(first, 'diagram_home')).toEqual(
      diagramCanvasFocus('diagram_home'),
    );
    expect(diagramItemCanvasFocus('diagram_home', 0, 0)).toEqual(
      diagramCanvasFocus('diagram_home'),
    );
  });

  it('falls back to the container when it has no focusable items', () => {
    expect(itemCanvasFocus('code_a', 'diagram_home', 0, 0)).toEqual(
      containerCanvasFocus('code_a', 'diagram_home'),
    );
    expect(clampIndex(99, 4)).toBe(3);
    expect(clampIndex(-1, 4)).toBe(0);
    expect(clampIndex(1, 0)).toBe(0);
  });

  it('keeps a satellite diagram focus rather than inventing a home jump', () => {
    expect(escapeCanvasFocus(diagramCanvasFocus('diagram_map'), 'diagram_home')).toEqual(
      diagramCanvasFocus('diagram_map'),
    );
  });
});
