import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { CanvasDiagramObject } from '@sothspell/canvas';
import { useLocale } from '../../i18n/locale.js';
import type { CanvasDiagramNode, CanvasObjectNode } from './canvas-flow.js';

interface Wire {
  id: string;
  d: string;
  label: string | undefined;
  labelX: number;
  labelY: number;
}

function wiresFor(
  objects: CanvasDiagramObject[],
  edges: CanvasDiagramNode['data']['wires'],
): Wire[] {
  const byId = new Map(objects.map((object) => [object.id, object] as const));
  const wires: Wire[] = [];

  for (const edge of edges) {
    const from = byId.get(edge.from);
    const to = byId.get(edge.to);
    if (!from || !to) {
      continue;
    }
    const x1 = from.x + from.width;
    const y1 = from.y + from.height / 2;
    const x2 = to.x;
    const y2 = to.y + to.height / 2;
    const mid = (x1 + x2) / 2;
    wires.push({
      id: edge.id,
      d: `M ${x1} ${y1} H ${mid} V ${y2} H ${x2}`,
      label: edge.label,
      labelX: mid + 6,
      labelY: (y1 + y2) / 2 - 4,
    });
  }

  return wires;
}

/**
 * The diagram card is a React Flow parent node. Its objects are separate child
 * nodes so each one can own a source handle; this card draws only the compiled
 * diagram's internal wires, header, and background.
 */
export const CanvasDiagramCard = memo(function CanvasDiagramCard({
  data,
}: NodeProps<CanvasDiagramNode>) {
  const { t } = useLocale();
  const wires = wiresFor(data.objects, data.wires);
  const markerId = `canvas-wire-arrow-${data.id}`;

  return (
    <article
      className="canvas-card canvas-diagram-card"
      data-testid="canvas-diagram-card"
      data-diagram-id={data.id}
      data-canvas-diagram="true"
      data-home={data.home}
      tabIndex={-1}
    >
      <header className="canvas-diagram-header">
        <span className="canvas-card-kicker">
          {data.home ? t('canvas.homeDiagram') : t('canvas.satelliteDiagram')}
        </span>
        <h3>{data.title}</h3>
      </header>
      <div className="canvas-diagram-body">
        <svg
          className="canvas-diagram-wires"
          width={data.diagramWidth}
          height={data.diagramHeight}
          viewBox={`0 0 ${data.diagramWidth} ${data.diagramHeight}`}
          aria-hidden="true"
          focusable="false"
        >
          <defs>
            <marker
              id={markerId}
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" className="canvas-wire-arrow" />
            </marker>
          </defs>
          {wires.map((wire) => (
            <g key={wire.id}>
              <path d={wire.d} className="canvas-wire" markerEnd={`url(#${markerId})`} />
              {wire.label === undefined ? null : (
                <text x={wire.labelX} y={wire.labelY} className="canvas-wire-label">
                  {wire.label}
                </text>
              )}
            </g>
          ))}
        </svg>
      </div>
    </article>
  );
});

/**
 * Objects are real buttons, not clickable divs: Tab reaches them and Enter and
 * Space activate them. The connector handle is painted from the same node so
 * an evidence edge starts at the object that cites it.
 */
export const CanvasObjectCard = memo(function CanvasObjectCard({
  data,
}: NodeProps<CanvasObjectNode>) {
  const { t } = useLocale();
  const hintId = `canvas-object-hint-${data.diagramId}-${data.objectId}`;
  const bridgeId = `canvas-object-bridge-${data.diagramId}-${data.objectId}`;
  const explanation = t('canvas.objectUnavailable', { label: data.label });
  const describedBy =
    [data.resolved ? null : hintId, data.bridge ? bridgeId : null]
      .filter((value) => value !== null)
      .join(' ') || undefined;

  return (
    <div
      className="canvas-object-node"
      data-focused={data.focused}
      data-resolved={data.resolved}
      data-target={data.target ?? 'none'}
      data-bridge={data.bridge}
    >
      <button
        type="button"
        className="canvas-object nodrag"
        data-testid="canvas-object"
        data-object-id={data.objectId}
        data-diagram-id={data.diagramId}
        data-canvas-item="object"
        tabIndex={-1}
        disabled={!data.resolved}
        aria-current={data.focused ? 'true' : undefined}
        aria-describedby={describedBy}
        title={
          data.resolved
            ? data.bridge
              ? t('canvas.sharedSymbolHint')
              : undefined
            : explanation
        }
        onClick={() => data.onActivate(data.diagramId, data.objectId)}
      >
        <span className="canvas-object-label">{data.label}</span>
        <span className="canvas-object-kind">{data.kind}</span>
        {data.bridge ? (
          <span className="canvas-object-bridge" data-testid="canvas-object-bridge">
            {t('canvas.sharedSymbol')}
          </span>
        ) : null}
      </button>
      {data.resolved ? null : (
        <span id={hintId} className="visually-hidden">
          {explanation}
        </span>
      )}
      {data.bridge ? (
        <span id={bridgeId} className="visually-hidden">
          {t('canvas.sharedSymbolHint')}
        </span>
      ) : null}
      <Handle
        type="source"
        position={Position.Right}
        id="object"
        isConnectable={false}
        className="canvas-object-handle"
      />
    </div>
  );
});
