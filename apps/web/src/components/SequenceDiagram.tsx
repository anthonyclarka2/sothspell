import type { PositionedDiagram } from '@sothspell/diagram';

export interface SequenceDiagramProps {
  diagram: PositionedDiagram;
  focusedNodeIds: string[];
  focusedEdgeIds: string[];
  onOpenAnchor: (anchorId: string) => void;
}

export function SequenceDiagram({
  diagram,
  focusedNodeIds,
  focusedEdgeIds,
  onOpenAnchor,
}: SequenceDiagramProps) {
  const focusedNodes = new Set(focusedNodeIds);
  const focusedEdges = new Set(focusedEdgeIds);
  const actorLabel = (id: string) =>
    diagram.nodes.find((node) => node.id === id)?.label ?? id;

  return (
    <div className="sequence-diagram" data-testid="sequence-diagram">
      <div className="sequence-actors" role="list" aria-label="Actors">
        {diagram.nodes.map((actor) => (
          <button
            key={actor.id}
            type="button"
            role="listitem"
            data-focused={focusedNodes.has(actor.id)}
            disabled={!actor.anchorId}
            onClick={() => actor.anchorId && onOpenAnchor(actor.anchorId)}
          >
            {actor.label}
          </button>
        ))}
      </div>
      <ol className="sequence-messages">
        {diagram.edges.map((message) => (
          <li key={message.id} data-focused={focusedEdges.has(message.id)}>
            <span className="sequence-arrow" aria-hidden="true">
              {actorLabel(message.from)} → {actorLabel(message.to)}
            </span>
            <span>{message.label ?? message.kind}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
