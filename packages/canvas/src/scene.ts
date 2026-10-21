import type { CompiledBeat, CompiledTour } from '@sothspell/core';
import type { CanvasScene, BuildCanvasSceneOptions } from './types.js';

/**
 * Builds the scene for one beat. This is the public seam the renderer uses; it
 * must stay pure and deterministic.
 */
export function buildCanvasScene(
  _tour: CompiledTour,
  _beat: CompiledBeat,
  _options: BuildCanvasSceneOptions = {},
): CanvasScene {
  throw new Error('buildCanvasScene is not implemented yet');
}
