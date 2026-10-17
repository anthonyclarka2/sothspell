import type { JSX } from 'react';
import type {
  PositionedDiagram,
  PositionedEdge,
  PositionedNode,
} from '@sothspell/diagram';

export interface DiagramViewProps {
  diagram: PositionedDiagram | null;
  focusedNodeIds: string[];
  focusedEdgeIds: string[];
  onOpenAnchor: (anchorId: string) => void;
}

const LABEL_LINE_LENGTH = 24;

function labelLines(label: string): [string] | [string, string] {
  if (label.length <= LABEL_LINE_LENGTH) {
    return [label];
  }
  const words = label.split(' ');
  let first = '';
  let rest: string[] = [];
  for (const word of words) {
    if (rest.length === 0 && `${first} ${word}`.trim().length <= LABEL_LINE_LENGTH) {
      first = `${first} ${word}`.trim();
    } else {
      rest = [...rest, word];
    }
  }
  if (rest.length === 0) {
    return [label];
  }
  let second = rest.join(' ');
  if (second.length > LABEL_LINE_LENGTH) {
    second = `${second.slice(0, LABEL_LINE_LENGTH - 1).trimEnd()}…`;
  }
  return [first, second];
}

function edgePath(
  edge: PositionedEdge,
  nodes: Map<string, PositionedNode>,
): string | null {
  const from = nodes.get(edge.from);
  const to = nodes.get(edge.to);
  if (!from || !to) {
    return null;
  }
  const fromX = from.x + from.width / 2;
  const fromBottom = from.y + from.height;
  const toX = to.x + to.width / 2;
  const toTop = to.y;

  if (toTop >= fromBottom) {
    const middle = (fromBottom + toTop) / 2;
    return `M ${fromX} ${fromBottom} L ${fromX} ${middle} L ${toX} ${middle} L ${toX} ${toTop}`;
  }

  // A backward edge routes around the side so it never crosses its nodes.
  const side =
    fromX <= toX
      ? Math.min(from.x, to.x) - 20
      : Math.max(from.x + from.width, to.x + to.width) + 20;
  const fromMiddle = from.y + from.height / 2;
  const toMiddle = to.y + to.height / 2;
  return `M ${fromX} ${fromMiddle} L ${side} ${fromMiddle} L ${side} ${toMiddle} L ${toX} ${toMiddle}`;
}

function EdgeShape({
  edge,
  nodes,
  focused,
  dimmed,
}: {
  edge: PositionedEdge;
  nodes: Map<string, PositionedNode>;
  focused: boolean;
  dimmed: boolean;
}): JSX.Element | null {
  const path = edgePath(edge, nodes);
  const from = nodes.get(edge.from);
  const to = nodes.get(edge.to);
  if (!path || !from || !to) {
    return null;
  }
  const labelX = (from.x + from.width / 2 + to.x + to.width / 2) / 2;
  const labelY = from.y + from.height + 12;

  return (
    <g>
      <path
        className="diagram-edge"
        d={path}
        data-focused={focused ? 'true' : undefined}
        data-dimmed={dimmed ? 'true' : undefined}
      />
      {edge.label ? (
        <text className="diagram-edge-label" x={labelX} y={labelY} textAnchor="middle">
          {edge.label}
        </text>
      ) : null}
    </g>
  );
}

function NodeShape({
  node,
  focused,
  dimmed,
  onOpenAnchor,
}: {
  node: PositionedNode;
  focused: boolean;
  dimmed: boolean;
  onOpenAnchor: (anchorId: string) => void;
}): JSX.Element {
  const [first, second] = labelLines(node.label);
  // The accessible name repeats the exact visible text so screen readers and
  // the `label-content-name-mismatch` rule agree. The kind label sits outside
  // the interactive group: it is decorative and must not join the name.
  const visibleText = second ? `${first} ${second}` : first;
  const centerX = node.x + node.width / 2;
  const anchorId = node.anchorId;
  const interactive = anchorId !== undefined;
  const open = (): void => {
    if (anchorId) {
      onOpenAnchor(anchorId);
    }
  };

  return (
    <g
      className="diagram-node"
      data-focused={focused ? 'true' : undefined}
      data-dimmed={dimmed ? 'true' : undefined}
      data-clickable={interactive ? 'true' : undefined}
    >
      <g
        className="diagram-node-button"
        role={interactive ? 'button' : undefined}
        tabIndex={interactive ? 0 : undefined}
        aria-label={interactive ? `${visibleText} — show code` : undefined}
        onClick={open}
        onKeyDown={(event) => {
          if (interactive && (event.key === 'Enter' || event.key === ' ')) {
            event.preventDefault();
            open();
          }
        }}
      >
        <rect x={node.x} y={node.y} width={node.width} height={node.height} />
        <text
          className="diagram-node-label"
          x={centerX}
          y={node.y + 22}
          textAnchor="middle"
        >
          {first}
          {second ? ' ' : ''}
        </text>
        {second ? (
          <text
            className="diagram-node-label"
            x={centerX}
            y={node.y + 36}
            textAnchor="middle"
          >
            {second}
          </text>
        ) : null}
      </g>
      <text
        className="diagram-node-kind"
        x={centerX}
        y={node.y + node.height - 8}
        textAnchor="middle"
        aria-hidden="true"
      >
        {node.type}
      </text>
    </g>
  );
}

/**
 * The embed renders the same positioned diagrams the compiler laid out, as
 * plain SVG. There is no layout engine and no diagram package in the bundle:
 * positions were computed at export time, and a beat only changes which nodes
 * and edges are emphasized.
 */
export function DiagramView({
  diagram,
  focusedNodeIds,
  focusedEdgeIds,
  onOpenAnchor,
}: DiagramViewProps) {
  if (!diagram) {
    return (
      <div className="panel-empty">This beat has no diagram. The code is the stage.</div>
    );
  }

  const nodes = new Map(diagram.nodes.map((node) => [node.id, node]));
  const focusedNodes = new Set(focusedNodeIds);
  const focusedEdges = new Set(focusedEdgeIds);
  const hasNodeFocus = focusedNodes.size > 0;
  const hasEdgeFocus = focusedEdges.size > 0;

  return (
    <div className="diagram-scroll">
      <svg
        className="diagram-canvas"
        viewBox={`0 0 ${diagram.width} ${diagram.height}`}
        width={diagram.width}
        height={diagram.height}
        role="group"
        aria-label={diagram.title}
      >
        <defs>
          <marker
            id="sothspell-arrow"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="7"
            markerHeight="7"
            orient="auto-start-reverse"
          >
            <path className="diagram-arrow" d="M 0 0 L 10 5 L 0 10 z" />
          </marker>
        </defs>
        {diagram.edges.map((edge) => (
          <EdgeShape
            key={edge.id}
            edge={edge}
            nodes={nodes}
            focused={focusedEdges.has(edge.id)}
            dimmed={hasEdgeFocus && !focusedEdges.has(edge.id)}
          />
        ))}
        {diagram.nodes.map((node) => (
          <NodeShape
            key={node.id}
            node={node}
            focused={focusedNodes.has(node.id)}
            dimmed={hasNodeFocus && !focusedNodes.has(node.id)}
            onOpenAnchor={onOpenAnchor}
          />
        ))}
      </svg>
    </div>
  );
}
