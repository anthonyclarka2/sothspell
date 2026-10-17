import { useMemo, useState } from 'react';
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { CompiledBeat, CompiledChapter } from '@sothspell/core';
import { SequenceDiagram } from './SequenceDiagram.js';

interface DiagramNodeData extends Record<string, unknown> {
  label: string;
  kind: string;
  focused: boolean;
  dimmed: boolean;
  anchorId?: string;
  onOpen?: (anchorId: string) => void;
}

type DiagramFlowNode = Node<DiagramNodeData, 'sothspell'>;

function DiagramNodeView({ data }: NodeProps<DiagramFlowNode>) {
  return (
    <div
      className="diagram-node"
      data-kind={data.kind}
      data-focused={data.focused}
      data-dimmed={data.dimmed}
      data-anchor-id={data.anchorId}
      role="button"
      tabIndex={0}
      aria-label={`${data.label} — open code`}
      onPointerDown={() => {
        if (data.anchorId) {
          data.onOpen?.(data.anchorId);
        }
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          if (data.anchorId) {
            data.onOpen?.(data.anchorId);
          }
        }
      }}
    >
      {data.label}
      <span className="node-kind">{data.kind}</span>
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </div>
  );
}

const nodeTypes = { sothspell: DiagramNodeView };

export interface DiagramStageProps {
  chapter: CompiledChapter;
  beat: CompiledBeat;
  onOpenAnchor: (anchorId: string) => void;
}

export function DiagramStage({ chapter, beat, onOpenAnchor }: DiagramStageProps) {
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const diagram = chapter.diagrams.find(
    (candidate) => candidate.id === beat.stage.diagramId,
  );

  const { nodes, edges } = useMemo(() => {
    if (!diagram) {
      return { nodes: [] as DiagramFlowNode[], edges: [] as Edge[] };
    }

    const focusedNodes = new Set(beat.stage.nodeIds);
    const focusedEdges = new Set(beat.stage.edgeIds);
    const hasNodeFocus = focusedNodes.size > 0;
    const hasEdgeFocus = focusedEdges.size > 0;

    const flowNodes: DiagramFlowNode[] = diagram.nodes.map((node) => ({
      id: node.id,
      type: 'sothspell',
      position: { x: node.x, y: node.y },
      draggable: false,
      connectable: false,
      selectable: false,
      data: {
        label: node.label,
        kind: node.type,
        focused: focusedNodes.has(node.id) || hoveredNode === node.id,
        dimmed: hasNodeFocus && !focusedNodes.has(node.id),
        ...(node.anchorId === undefined ? {} : { anchorId: node.anchorId }),
        onOpen: onOpenAnchor,
      },
      style: { width: node.width },
    }));

    const flowEdges: Edge[] = diagram.edges.map((edge) => {
      const focused = focusedEdges.has(edge.id);
      return {
        id: edge.id,
        source: edge.from,
        target: edge.to,
        ...(edge.label === undefined ? {} : { label: edge.label }),
        markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14 },
        animated: focused,
        style: {
          opacity: hasEdgeFocus ? (focused ? 1 : 0.22) : 0.7,
          strokeWidth: focused ? 1.8 : 1.1,
        },
      };
    });

    return { nodes: flowNodes, edges: flowEdges };
  }, [beat.stage.edgeIds, beat.stage.nodeIds, diagram, hoveredNode, onOpenAnchor]);

  if (!diagram) {
    return (
      <div className="panel-body" style={{ display: 'grid', placeItems: 'center' }}>
        <p className="notice">This beat has no diagram. The code is the stage.</p>
      </div>
    );
  }

  if (diagram.kind === 'sequence') {
    return (
      <div className="panel-body">
        <SequenceDiagram
          diagram={diagram}
          focusedNodeIds={beat.stage.nodeIds}
          focusedEdgeIds={beat.stage.edgeIds}
          onOpenAnchor={onOpenAnchor}
        />
      </div>
    );
  }

  return (
    <ReactFlow
      className="diagram-canvas"
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable={false}
      onInit={(instance) => {
        void instance.fitView({ padding: 0.2, maxZoom: 1.4 });
      }}
      onNodeClick={(_event, node) => {
        const anchorId = node.data.anchorId;
        if (typeof anchorId === 'string') {
          onOpenAnchor(anchorId);
        }
      }}
      onNodeMouseEnter={(_event, node) => setHoveredNode(node.id)}
      onNodeMouseLeave={() => setHoveredNode(null)}
    >
      <Background gap={18} size={1.2} />
      <Controls showInteractive={false} />
    </ReactFlow>
  );
}
