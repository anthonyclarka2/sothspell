import { MarkerType, type Edge, type Node } from '@xyflow/react';
import {
  codeContainerKey,
  diagramCardKey,
  type CanvasCodeContainer,
  type CanvasDiagramObject,
  type CanvasEvidenceLink,
  type CanvasLayout,
  type CanvasRelationConfidence,
  type CanvasRelationKind,
  type CanvasScene,
} from '@sothspell/canvas';
import type { DiagramKind, PositionedEdge } from '@sothspell/diagram';
import {
  relationOwnerKey,
  relationStatusKey,
  type CanvasRelationMeta,
  type CanvasRelationStatusCard,
  type CanvasRelationToggleDirection,
  type CanvasRelationUiState,
} from './relation-scene.js';

/**
 * The canvas factory maps the pure scene onto React Flow. It owns no scene or
 * layout decisions: positions come from `layoutCanvas`, links come from
 * `buildCanvasScene`, and this module only adds the presentation fields React
 * Flow needs.
 */

export const CANVAS_DIAGRAM_NODE = 'canvasDiagram';
export const CANVAS_OBJECT_NODE = 'canvasObject';
export const CANVAS_CODE_NODE = 'canvasCode';
export const CANVAS_RELATION_STATUS_NODE = 'canvasRelationStatus';
export const CANVAS_EVIDENCE_EDGE = 'canvasEvidence';
export const CANVAS_FLOW_EDGE = 'canvasFlow';

/**
 * The card's chrome is derived from the layout item rather than hard-coded:
 * the package already owns the card size, so the object coordinates stay in
 * sync when the chrome changes.
 */

export interface CanvasDiagramCardData extends Record<string, unknown> {
  id: string;
  title: string;
  kind: DiagramKind;
  home: boolean;
  width: number;
  height: number;
  diagramWidth: number;
  diagramHeight: number;
  objects: CanvasDiagramObject[];
  wires: PositionedEdge[];
}

export interface CanvasObjectData extends Record<string, unknown> {
  diagramId: string;
  objectId: string;
  label: string;
  kind: string;
  /** An anchor wins when both targets exist; null means neither is usable. */
  target: 'anchor' | 'definition' | null;
  resolved: boolean;
  bridge: boolean;
  focused: boolean;
  onActivate: (diagramId: string, objectId: string) => void;
}

export interface CanvasRelationToggleView {
  active: boolean;
  loading: boolean;
  disabled: boolean;
}

export interface CanvasCodeContainerData extends Record<string, unknown> {
  container: CanvasCodeContainer;
  collapsed: boolean;
  focused: boolean;
  linkedLines: number[];
  projectSlug: string;
  tourId: string;
  beatId: string;
  symbolId: string | undefined;
  relation: { kind: CanvasRelationKind; confidence: CanvasRelationConfidence } | null;
  incoming: CanvasRelationToggleView;
  outgoing: CanvasRelationToggleView;
  /** Re-measures line handles when the canvas text scale changes. */
  textScale: number;
  onFocus: (containerId: string) => void;
  onToggleCollapse: (containerId: string) => void;
  onToggleRelation: (
    containerId: string,
    direction: CanvasRelationToggleDirection,
  ) => void;
  onOpenDefinition: (symbolId: string, sourceContainerId?: string) => void;
}

export interface CanvasRelationStatusData extends Record<string, unknown> {
  status: CanvasRelationStatusCard;
  onRetry: (status: CanvasRelationStatusCard) => void;
}

export interface CanvasEvidenceData extends Record<string, unknown> {
  objectLabel: string;
  path: string;
  line: number;
}

export interface CanvasFlowData extends Record<string, unknown> {
  relation: CanvasRelationKind;
  confidence: CanvasRelationConfidence;
  fromLabel: string;
  toLabel: string;
}

export type CanvasDiagramNode = Node<CanvasDiagramCardData, typeof CANVAS_DIAGRAM_NODE>;
export type CanvasObjectNode = Node<CanvasObjectData, typeof CANVAS_OBJECT_NODE>;
export type CanvasCodeNode = Node<CanvasCodeContainerData, typeof CANVAS_CODE_NODE>;
export type CanvasRelationStatusNode = Node<
  CanvasRelationStatusData,
  typeof CANVAS_RELATION_STATUS_NODE
>;
export type CanvasFlowNode =
  CanvasDiagramNode | CanvasObjectNode | CanvasCodeNode | CanvasRelationStatusNode;
export type CanvasEvidenceFlowEdge = Edge<
  CanvasEvidenceData,
  typeof CANVAS_EVIDENCE_EDGE
>;
export type CanvasRelationFlowEdge = Edge<CanvasFlowData, typeof CANVAS_FLOW_EDGE>;
export type CanvasFlowEdge = CanvasEvidenceFlowEdge | CanvasRelationFlowEdge;

export interface CanvasFlowState {
  selectedObjectId: string | null;
  focusedContainerId: string | null;
  /** Per-container override; the scene's own collapse flag is the default. */
  collapsed: Record<string, boolean>;
  projectSlug: string;
  tourId: string;
  beatId: string;
  sharedSymbolIds: ReadonlySet<string>;
  relationState: CanvasRelationUiState;
  relationMeta: Record<string, CanvasRelationMeta>;
  textScale: number;
}

export interface CanvasFlowActions {
  activateObject: (diagramId: string, objectId: string) => void;
  focusContainer: (containerId: string) => void;
  toggleContainer: (containerId: string) => void;
  toggleRelation: (containerId: string, direction: CanvasRelationToggleDirection) => void;
  openDefinition: (symbolId: string, sourceContainerId?: string) => void;
  retryRelation: (status: CanvasRelationStatusCard) => void;
}

/** Child nodes need their own stable key; the layout keys only the card. */
export function canvasObjectKey(diagramId: string, objectId: string): string {
  return `object:${diagramId}:${objectId}`;
}

/** Each visible code line owns a target handle for its evidence links. */
export function canvasCodeLineHandle(line: number): string {
  return `line-${line}`;
}

/**
 * Parent nodes are emitted before their object children, which React Flow
 * requires for relative positioning. Node order is then stable for a given
 * scene, so memoized custom nodes are not rebuilt by a viewport change.
 */
export function buildCanvasNodes(
  scene: CanvasScene,
  layout: CanvasLayout,
  state: CanvasFlowState,
  actions: CanvasFlowActions,
): CanvasFlowNode[] {
  const nodes: CanvasFlowNode[] = [];
  const resolvedAnchorIds = new Set(
    scene.containers.map((container) => container.anchorId),
  );

  for (const diagram of scene.diagrams) {
    const item = layout.items[diagramCardKey(diagram.id)];
    if (!item) {
      continue;
    }
    const scale = state.textScale / 100;
    const diagramWidth = diagram.diagram.width * scale;
    const diagramHeight = diagram.diagram.height * scale;
    const objects = diagram.objects.map((object) => ({
      ...object,
      x: object.x * scale,
      y: object.y * scale,
      width: object.width * scale,
      height: object.height * scale,
    }));

    nodes.push({
      id: item.id,
      type: CANVAS_DIAGRAM_NODE,
      position: { x: item.x, y: item.y },
      width: item.width,
      height: item.height,
      style: { width: item.width, height: item.height },
      draggable: false,
      selectable: false,
      connectable: false,
      deletable: false,
      focusable: false,
      ariaRole: 'group',
      ariaLabel: diagram.title,
      data: {
        id: diagram.id,
        title: diagram.title,
        kind: diagram.kind,
        home: diagram.home,
        width: item.width,
        height: item.height,
        diagramWidth,
        diagramHeight,
        objects,
        wires: diagram.diagram.edges,
      },
    });

    const insetX = Math.max(0, (item.width - diagramWidth) / 2);
    const insetY = Math.max(0, item.height - diagramHeight - insetX);
    for (const object of objects) {
      const anchorResolved =
        object.anchorId !== undefined && resolvedAnchorIds.has(object.anchorId);
      const target: CanvasObjectData['target'] = anchorResolved
        ? 'anchor'
        : object.symbolId !== undefined
          ? 'definition'
          : null;
      nodes.push({
        id: canvasObjectKey(diagram.id, object.id),
        type: CANVAS_OBJECT_NODE,
        parentId: item.id,
        extent: 'parent',
        position: {
          x: object.x + insetX,
          y: object.y + insetY,
        },
        width: object.width,
        height: object.height,
        style: { width: object.width, height: object.height },
        draggable: false,
        selectable: false,
        connectable: false,
        deletable: false,
        focusable: false,
        zIndex: 2,
        data: {
          diagramId: diagram.id,
          objectId: object.id,
          label: object.label,
          kind: object.type,
          target,
          resolved: target !== null,
          bridge:
            object.symbolId !== undefined && state.sharedSymbolIds.has(object.symbolId),
          focused: state.selectedObjectId === object.id,
          onActivate: actions.activateObject,
        },
      });
    }
  }

  for (const container of scene.containers) {
    const item = layout.items[codeContainerKey(container.id)];
    if (!item) {
      continue;
    }
    const collapsed = state.collapsed[container.id] ?? container.collapsed;
    const meta = state.relationMeta[container.id];
    const toggle = (
      direction: CanvasRelationToggleDirection,
    ): CanvasRelationToggleView => {
      const owner = relationOwnerKey(container.id, direction);
      const active = state.relationState.activeOwners.has(owner);
      return {
        active,
        loading: active && state.relationState.loads[owner]?.status === 'loading',
        disabled: container.symbolId === undefined,
      };
    };
    nodes.push({
      id: item.id,
      type: CANVAS_CODE_NODE,
      position: { x: item.x, y: item.y },
      width: item.width,
      height: item.height,
      style: { width: item.width, height: item.height },
      draggable: false,
      selectable: false,
      connectable: false,
      deletable: false,
      focusable: false,
      ariaRole: 'group',
      ariaLabel: `${container.label}, ${container.path}:${container.startLine}-${container.endLine}`,
      data: {
        container,
        collapsed,
        focused: state.focusedContainerId === container.id,
        linkedLines: scene.links
          .filter(
            (link): link is CanvasEvidenceLink =>
              link.kind === 'evidence' && link.toContainerId === container.id,
          )
          .map((link) => link.toLine),
        projectSlug: state.projectSlug,
        tourId: state.tourId,
        beatId: state.beatId,
        symbolId: container.symbolId,
        relation:
          meta?.relation === undefined
            ? null
            : {
                kind: meta.relation,
                confidence: meta.confidence ?? 'syntax',
              },
        incoming: toggle('incoming'),
        outgoing: toggle('outgoing'),
        textScale: state.textScale,
        onFocus: actions.focusContainer,
        onToggleCollapse: actions.toggleContainer,
        onToggleRelation: actions.toggleRelation,
        onOpenDefinition: actions.openDefinition,
      },
    });
  }

  return nodes;
}

/** Status cards are not code; they occupy the same relation columns. */
export function buildCanvasRelationStatusNodes(
  statuses: CanvasRelationStatusCard[],
  layout: CanvasLayout,
  actions: CanvasFlowActions,
): CanvasRelationStatusNode[] {
  const nodes: CanvasRelationStatusNode[] = [];
  for (const status of statuses) {
    const item = layout.items[relationStatusKey(status.id)];
    if (!item) {
      continue;
    }
    nodes.push({
      id: item.id,
      type: CANVAS_RELATION_STATUS_NODE,
      position: { x: item.x, y: item.y },
      width: item.width,
      height: item.height,
      style: { width: item.width, height: item.height },
      draggable: false,
      selectable: false,
      connectable: false,
      deletable: false,
      focusable: false,
      ariaRole: 'group',
      ariaLabel: 'Relation status',
      data: {
        status,
        onRetry: actions.retryRelation,
      },
    });
  }
  return nodes;
}

/** One edge per citation or relation the scene proved, and no edge without one. */
export function buildCanvasEdges(scene: CanvasScene): CanvasFlowEdge[] {
  const containersById = new Map(
    scene.containers.map((container) => [container.id, container] as const),
  );
  const diagramsById = new Map(
    scene.diagrams.map((diagram) => [diagram.id, diagram] as const),
  );
  const edges: CanvasFlowEdge[] = [];

  for (const link of scene.links) {
    if (link.kind === 'evidence') {
      const container = containersById.get(link.toContainerId);
      const object = diagramsById
        .get(link.fromDiagramId)
        ?.objects.find((candidate) => candidate.id === link.fromObjectId);
      if (!container || !object) {
        continue;
      }

      edges.push({
        id: link.id,
        type: CANVAS_EVIDENCE_EDGE,
        source: canvasObjectKey(link.fromDiagramId, link.fromObjectId),
        target: codeContainerKey(link.toContainerId),
        sourceHandle: 'object',
        targetHandle: canvasCodeLineHandle(link.toLine),
        selectable: false,
        deletable: false,
        focusable: false,
        ariaLabel: `${object.label} → ${container.path}:${link.toLine}`,
        data: {
          objectLabel: object.label,
          path: container.path,
          line: link.toLine,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 14,
          height: 14,
          color: 'var(--canvas-edge)',
        },
      });
      continue;
    }

    const from = containersById.get(link.fromContainerId);
    const to = containersById.get(link.toContainerId);
    if (!from || !to) {
      continue;
    }

    edges.push({
      id: link.id,
      type: CANVAS_FLOW_EDGE,
      source: codeContainerKey(from.id),
      target: codeContainerKey(to.id),
      sourceHandle: 'flow-right',
      targetHandle: 'flow-left',
      selectable: false,
      deletable: false,
      focusable: false,
      ariaLabel: `${from.label} ${link.relation} ${to.label}`,
      data: {
        relation: link.relation,
        confidence: link.confidence,
        fromLabel: from.label,
        toLabel: to.label,
      },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: 18,
        height: 18,
        color: 'var(--canvas-relation-color, var(--canvas-flow-edge))',
      },
    });
  }

  return edges;
}
