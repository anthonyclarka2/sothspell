import { memo } from 'react';
import { BaseEdge, getSmoothStepPath, type EdgeProps } from '@xyflow/react';
import type { CanvasEvidenceFlowEdge } from './canvas-flow.js';

/**
 * The Phase 17 link grammar: one citation, one orthogonal path, 8 px rounded
 * corners, and a 1.5 px stroke at 3:1 or better against both themes. Flow links
 * with relation labels arrive in Phase 18; this component only draws evidence.
 */
export const CanvasEvidenceEdge = memo(function CanvasEvidenceEdge({
  id,
  sourceX,
  sourceY,
  sourcePosition,
  targetX,
  targetY,
  targetPosition,
  markerEnd,
}: EdgeProps<CanvasEvidenceFlowEdge>) {
  const [path] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 8,
  });

  return (
    <g data-testid="canvas-evidence-edge">
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        interactionWidth={12}
        style={{
          strokeWidth: 'var(--canvas-evidence-width, 1.5px)',
          stroke: 'var(--canvas-edge)',
        }}
      />
    </g>
  );
});
