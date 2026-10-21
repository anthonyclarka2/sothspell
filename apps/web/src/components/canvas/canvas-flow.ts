import { MarkerType, type Edge, type Node } from '@xyflow/react';
import {
  codeContainerKey,
  diagramCardKey,
  type CanvasCodeContainer,
  type CanvasDiagramObject,
  type CanvasEvidenceLink,
  type CanvasLayout,
  type CanvasScene,
} from '@sothspell/canvas';
import type { DiagramKind, PositionedEdge } from '@sothspell/diagram';

/**
 * The canvas factory maps the pure scene onto React Flow. It owns no scene or
 * layout decisions: positions come from `layoutCanvas`, links come from
 * `buildCanvasScene`, and this module only adds the presentation fields React
 * Flow needs.
 */

export const CANVAS_DIAGRAM_NODE = 'canvasDiagram';
export const CANVAS_OBJECT_NODE = 'canvasObject';
export const CANVAS_CODE_NODE = 'canvasCode';
export const CANVAS_EVIDENCE_EDGE = 'canvasEvidence';

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
  resolved: boolean;
  focused: boolean;
  onActivate: (diagramId: string, objectId: string) => void;
}

export interface CanvasCodeContainerData extends Record<string, unknown> {
  container: CanvasCodeContainer;
  collapsed: boolean;
  focused: boolean;
  linkedLines: number[];
  projectSlug: string;
  beatId: string;
  onFocus: (containerId: string) => void;
  onToggleCollapse: (containerId: string) => void;
}

export interface CanvasEvidenceData extends Record<string, unknown> {
  objectLabel: string;
  path: string;
  line: number;
}

export type CanvasDiagramNode = Node<CanvasDiagramCardData, typeof CANVAS_DIAGRAM_NODE>;
export type CanvasObjectNode = Node<CanvasObjectData, typeof CANVAS_OBJECT_NODE>;
export type CanvasCodeNode = Node<CanvasCodeContainerData, typeof CANVAS_CODE_NODE>;
export type CanvasFlowNode = CanvasDiagramNode | CanvasObjectNode | CanvasCodeNode;
export type CanvasEvidenceFlowEdge = Edge<
  CanvasEvidenceData,
  typeof CANVAS_EVIDENCE_EDGE
>;

export interface CanvasFlowState {
  selectedObjectId: string | null;
  focusedContainerId: string | null;
  /** Per-container override; the scene's own collapse flag is the default. */
  collapsed: Record<string, boolean>;
  projectSlug: string;
  beatId: string;
}

export interface CanvasFlowActions {
  activateObject: (diagramId: string, objectId: string) => void;
  focusContainer: (containerId: string) => void;
  toggleContainer: (containerId: string) => void;
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
        diagramWidth: diagram.diagram.width,
        diagramHeight: diagram.diagram.height,
        objects: diagram.objects,
        wires: diagram.diagram.edges,
      },
    });

    const insetX = Math.max(0, (item.width - diagram.diagram.width) / 2);
    const insetY = Math.max(0, item.height - diagram.diagram.height - insetX);
    for (const object of diagram.objects) {
      const resolved =
        object.anchorId !== undefined && resolvedAnchorIds.has(object.anchorId);
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
          resolved,
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
        beatId: state.beatId,
        onFocus: actions.focusContainer,
        onToggleCollapse: actions.toggleContainer,
      },
    });
  }

  return nodes;
}

/** One edge per citation the scene proved, and no edge without one. */
export function buildCanvasEdges(scene: CanvasScene): CanvasEvidenceFlowEdge[] {
  const containersById = new Map(
    scene.containers.map((container) => [container.id, container] as const),
  );
  const diagramsById = new Map(
    scene.diagrams.map((diagram) => [diagram.id, diagram] as const),
  );
  const edges: CanvasEvidenceFlowEdge[] = [];

  for (const link of scene.links) {
    if (link.kind !== 'evidence') {
      continue;
    }
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
  }

  return edges;
}
