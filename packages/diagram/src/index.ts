import { z } from 'zod';
import ELK from 'elkjs/lib/elk.bundled.js';

/**
 * The controlled vocabulary for diagrams. The model may choose a kind, labels,
 * and relationships; it may not choose coordinates, colors, or sizes. Those are
 * derived here and in the renderer so every tour shares one visual grammar.
 */
export const DiagramKindSchema = z.enum([
  'architecture',
  'dependency',
  'flow',
  'tree',
  'sequence',
]);

export const DiagramNodeTypeSchema = z.enum([
  'module',
  'service',
  'store',
  'client',
  'queue',
  'external',
  'file',
  'class',
  'function',
  'note',
]);

export const DiagramEdgeKindSchema = z.enum([
  'calls',
  'reads',
  'writes',
  'emits',
  'renders',
  'depends',
  'contains',
]);

export const DiagramNodeSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1).max(48),
  type: DiagramNodeTypeSchema,
  anchorId: z.string().min(1).optional(),
  /** The analyzer symbol ID this object opens, when one is known. */
  symbolId: z.string().min(1).optional(),
});

export const DiagramEdgeSchema = z.object({
  id: z.string().min(1),
  from: z.string().min(1),
  to: z.string().min(1),
  kind: DiagramEdgeKindSchema,
  label: z.string().min(1).max(32).optional(),
});

export const DiagramInstructionSchema = z
  .object({
    id: z.string().min(1),
    kind: DiagramKindSchema,
    title: z.string().min(1).max(96),
    nodes: z.array(DiagramNodeSchema).min(1).max(16),
    edges: z.array(DiagramEdgeSchema).max(24),
  })
  .superRefine((diagram, context) => {
    const nodeIds = new Set<string>();
    for (const node of diagram.nodes) {
      if (nodeIds.has(node.id)) {
        context.addIssue({
          code: 'custom',
          message: `duplicate diagram node id: ${node.id}`,
          path: ['nodes'],
        });
      }
      nodeIds.add(node.id);
    }

    const edgeIds = new Set<string>();
    for (const edge of diagram.edges) {
      if (edgeIds.has(edge.id)) {
        context.addIssue({
          code: 'custom',
          message: `duplicate diagram edge id: ${edge.id}`,
          path: ['edges'],
        });
      }
      edgeIds.add(edge.id);

      if (!nodeIds.has(edge.from)) {
        context.addIssue({
          code: 'custom',
          message: `diagram edge ${edge.id} references unknown node ${edge.from}`,
          path: ['edges'],
        });
      }
      if (!nodeIds.has(edge.to)) {
        context.addIssue({
          code: 'custom',
          message: `diagram edge ${edge.id} references unknown node ${edge.to}`,
          path: ['edges'],
        });
      }
      if (edge.from === edge.to) {
        context.addIssue({
          code: 'custom',
          message: `diagram edge ${edge.id} points at itself`,
          path: ['edges'],
        });
      }
    }
  });

export type DiagramInstruction = z.infer<typeof DiagramInstructionSchema>;
export type DiagramNode = z.infer<typeof DiagramNodeSchema>;
export type DiagramEdge = z.infer<typeof DiagramEdgeSchema>;
export type DiagramKind = z.infer<typeof DiagramKindSchema>;
export type DiagramNodeType = z.infer<typeof DiagramNodeTypeSchema>;
export type DiagramEdgeKind = z.infer<typeof DiagramEdgeKindSchema>;

export interface PositionedNode {
  id: string;
  label: string;
  type: DiagramNodeType;
  x: number;
  y: number;
  width: number;
  height: number;
  anchorId?: string;
  symbolId?: string;
}

export interface PositionedEdge {
  id: string;
  from: string;
  to: string;
  kind: DiagramEdgeKind;
  label?: string;
}

export interface PositionedDiagram {
  id: string;
  kind: DiagramKind;
  title: string;
  width: number;
  height: number;
  nodes: PositionedNode[];
  edges: PositionedEdge[];
}

const NODE_WIDTH = 176;
const NODE_HEIGHT = 56;

const elk = new ELK();

/**
 * Lays out a validated diagram with a deterministic layered algorithm. The
 * diagram is small by contract; if the model needs a larger picture, it should
 * split the idea across chapters instead of crowding a single canvas.
 */
export async function layoutDiagram(
  diagram: DiagramInstruction,
): Promise<PositionedDiagram> {
  const graph = {
    id: `diagram_${diagram.id}`,
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'DOWN',
      'elk.edgeRouting': 'ORTHOGONAL',
      'elk.spacing.nodeNode': '36',
      'elk.layered.spacing.nodeNodeBetweenLayers': '64',
      'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
    },
    children: diagram.nodes.map((node) => ({
      id: node.id,
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
      layoutOptions: { 'elk.portConstraints': 'FIXED_SIDE' },
    })),
    edges: diagram.edges.map((edge) => ({
      id: edge.id,
      sources: [edge.from],
      targets: [edge.to],
    })),
  };

  const result = await elk.layout(graph);
  const positions = new Map(
    (result.children ?? []).map((node) => [node.id, node] as const),
  );

  const nodes = diagram.nodes.map((node) => {
    const positioned = positions.get(node.id);
    return {
      id: node.id,
      label: node.label,
      type: node.type,
      x: positioned?.x ?? 0,
      y: positioned?.y ?? 0,
      width: positioned?.width ?? NODE_WIDTH,
      height: positioned?.height ?? NODE_HEIGHT,
      ...(node.anchorId === undefined ? {} : { anchorId: node.anchorId }),
      ...(node.symbolId === undefined ? {} : { symbolId: node.symbolId }),
    } satisfies PositionedNode;
  });

  const width = Math.max(320, ...nodes.map((node) => node.x + node.width + 32));
  const height = Math.max(200, ...nodes.map((node) => node.y + node.height + 32));

  return {
    id: diagram.id,
    kind: diagram.kind,
    title: diagram.title,
    width,
    height,
    nodes,
    edges: diagram.edges.map((edge) => ({
      id: edge.id,
      from: edge.from,
      to: edge.to,
      kind: edge.kind,
      ...(edge.label === undefined ? {} : { label: edge.label }),
    })),
  };
}

export {
  buildSequenceModel,
  type SequenceActor,
  type SequenceMessage,
  type SequenceModel,
} from './sequence.js';
