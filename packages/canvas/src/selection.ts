import type {
  CanvasSelection,
  CanvasSelectionAction,
  CanvasSelectionState,
  CanvasScene,
} from './types.js';

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
  _scene: CanvasScene,
  state: CanvasSelectionState,
  _action: CanvasSelectionAction,
): CanvasSelectionState {
  return state;
}

/** The selection a viewer sees after pressing Escape. */
export function escapeCanvasSelection(
  _scene: CanvasScene,
  state: CanvasSelectionState,
): CanvasSelectionState {
  return state;
}

/** Selection used by the initial outline and by the home control. */
export function homeCanvasSelection(scene: CanvasScene): CanvasSelection {
  return { level: 'canvas', diagramId: scene.homeDiagramId };
}
