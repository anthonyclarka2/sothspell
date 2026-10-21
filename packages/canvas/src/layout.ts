import type {
  CanvasLayout,
  CanvasScene,
  CanvasSize,
  CanvasViewport,
} from './types.js';

const VIEWPORT_PADDING = 48;

/**
 * Places cards deterministically. The layout is synchronous; auto-arrange is a
 * separate command that may use a richer engine.
 */
export function layoutCanvas(
  _scene: CanvasScene,
  _viewport: CanvasSize,
): CanvasLayout {
  throw new Error('layoutCanvas is not implemented yet');
}

/** Returns the viewport that frames the whole layout. */
export function viewportFor(
  _bounds: { x: number; y: number; width: number; height: number },
  _viewport: CanvasSize,
  _padding = VIEWPORT_PADDING,
): CanvasViewport {
  throw new Error('viewportFor is not implemented yet');
}
