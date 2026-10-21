import { memo } from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  type EdgeProps,
} from '@xyflow/react';
import type { CanvasRelationFlowEdge } from './canvas-flow.js';

const DASH: Record<'calls' | 'references' | 'imports', string | undefined> = {
  calls: undefined,
  references: '9 5',
  imports: '2 5',
};

/**
 * The relation grammar: 4 px, lighter than evidence, orthogonal with rounded
 * corners, and a labelled kind. The label is the kind the analyzer proved, not
 * a generic "link".
 */
export const CanvasFlowEdge = memo(function CanvasFlowEdge({
  id,
  sourceX,
  sourceY,
  sourcePosition,
  targetX,
  targetY,
  targetPosition,
  markerEnd,
  data,
}: EdgeProps<CanvasRelationFlowEdge>) {
  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 10,
  });
  const relation = data?.relation ?? 'calls';

  return (
    <g
      data-testid="canvas-flow-edge"
      data-relation-kind={relation}
      data-confidence={data?.confidence}
    >
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        interactionWidth={18}
        style={{
          strokeWidth: 4,
          stroke: 'var(--canvas-flow-edge)',
          ...(DASH[relation] === undefined ? {} : { strokeDasharray: DASH[relation] }),
        }}
      />
      <EdgeLabelRenderer>
        <span
          className="canvas-flow-edge-label"
          data-testid="canvas-flow-edge-label"
          data-relation-kind={relation}
          title={data?.confidence}
          style={{
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
          }}
        >
          {relation}
        </span>
      </EdgeLabelRenderer>
    </g>
  );
});
