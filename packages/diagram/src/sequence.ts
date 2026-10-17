import type { DiagramInstruction } from './index.js';

export interface SequenceActor {
  id: string;
  label: string;
  anchorId?: string;
}

export interface SequenceMessage {
  id: string;
  from: string;
  to: string;
  label?: string;
}

export interface SequenceModel {
  actors: SequenceActor[];
  messages: SequenceMessage[];
}

/**
 * Converts a sequence-kind diagram instruction into an ordered actor/message
 * model. The sequence renderer is intentionally simple: actors are columns and
 * messages are rows in edge order, which keeps the diagram deterministic.
 */
export function buildSequenceModel(diagram: DiagramInstruction): SequenceModel | null {
  if (diagram.kind !== 'sequence') {
    return null;
  }
  return {
    actors: diagram.nodes.map((node) => ({
      id: node.id,
      label: node.label,
      ...(node.anchorId === undefined ? {} : { anchorId: node.anchorId }),
    })),
    messages: diagram.edges.map((edge) => ({
      id: edge.id,
      from: edge.from,
      to: edge.to,
      ...(edge.label === undefined ? {} : { label: edge.label }),
    })),
  };
}
