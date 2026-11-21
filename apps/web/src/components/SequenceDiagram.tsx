import { DiagramRelations } from './DiagramRelations.js';
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
  return (
    <div className="sequence-diagram" data-testid="sequence-diagram">
      <ul className="sequence-actors" aria-label="Actors">
        {diagram.nodes.map((actor) => (
          <li key={actor.id}>
            <button
              type="button"
              data-focused={focusedNodes.has(actor.id)}
              disabled={!actor.anchorId}
              onClick={() => actor.anchorId && onOpenAnchor(actor.anchorId)}
            >
              {actor.label}
            </button>
          </li>
        ))}
      </ul>
      <DiagramRelations diagram={diagram} focusedIds={focusedEdgeIds} />
    </div>
  );
}
