import type { DiagramKind, PositionedDiagram } from '@sothspell/diagram';

/** One object inside a diagram card. Coordinates are relative to the card. */
export interface CanvasDiagramObject {
  id: string;
  label: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  anchorId?: string;
  symbolId?: string;
}

/** A diagram rendered as a card on the canvas. */
export interface CanvasDiagramCard {
  id: string;
  title: string;
  kind: DiagramKind;
  home: boolean;
  diagram: PositionedDiagram;
  objects: CanvasDiagramObject[];
}

/** A code excerpt or definition rendered as a card. */
export interface CanvasCodeContainer {
  id: string;
  anchorId: string;
  symbolId?: string;
  label: string;
  path: string;
  startLine: number;
  endLine: number;
  language: string;
  excerpt: string;
  html: string;
  collapsed: boolean;
}

/** A citation from one diagram object to one code line. */
export interface CanvasEvidenceLink {
  kind: 'evidence';
  id: string;
  fromDiagramId: string;
  fromObjectId: string;
  toContainerId: string;
  toLine: number;
}

export type CanvasRelationKind = 'calls' | 'references' | 'imports';
export type CanvasRelationConfidence = 'syntax' | 'import';

/** A relationship between two code containers. Phase 18 fills this. */
export interface CanvasFlowLink {
  kind: 'flow';
  id: string;
  fromContainerId: string;
  toContainerId: string;
  relation: CanvasRelationKind;
  confidence: CanvasRelationConfidence;
}

export type CanvasLink = CanvasEvidenceLink | CanvasFlowLink;

/** The pure data model of one canvas view. */
export interface CanvasScene {
  tourId: string;
  beatId: string;
  chapterId: string;
  homeDiagramId: string | null;
  diagrams: CanvasDiagramCard[];
  containers: CanvasCodeContainer[];
  /** Anchors that exist on the beat but were not opened by the limit. */
  hiddenContainerCount: number;
  links: CanvasLink[];
}

export interface BuildCanvasSceneOptions {
  /** Diagram IDs from the beat's chapter to show in addition to the home card. */
  openDiagramIds?: string[];
  /** Maximum code containers opened initially. Default 6. */
  containerLimit?: number;
}

export interface CanvasPoint {
  x: number;
  y: number;
}

export interface CanvasSize {
  width: number;
  height: number;
}

export interface CanvasRect extends CanvasPoint, CanvasSize {}

export interface CanvasViewport extends CanvasPoint {
  zoom: number;
}

export interface CanvasLayoutItem extends CanvasRect {
  id: string;
}

export interface CanvasLayout {
  items: Record<string, CanvasLayoutItem>;
  bounds: CanvasRect;
}

/** Where a relation request starts: a definition, callers, or callees. */
export type CanvasRelationDirection = 'definition' | 'incoming' | 'outgoing';

/** The identity of one analyzer symbol. */
export interface CanvasSymbolRef {
  id: string;
  name: string;
  qualifiedName: string;
  kind: string;
  path: string;
  startLine: number;
  endLine: number;
  language: string;
}

/** One exact identifier the excerpt can link without sending the snapshot. */
export interface CanvasIdentifierTarget {
  text: string;
  symbolId: string;
  path: string;
}

/** One related symbol and its bounded excerpt. */
export interface CanvasRelationItem {
  symbol: CanvasSymbolRef;
  relation: CanvasRelationKind;
  confidence: CanvasRelationConfidence;
  container: CanvasCodeContainer;
}

/** The bounded payload behind a definition or relation expansion. */
export interface CanvasRelationResponse {
  available: true;
  direction: CanvasRelationDirection;
  symbol: CanvasSymbolRef;
  container: CanvasCodeContainer;
  relations: CanvasRelationItem[];
  identifierTargets: CanvasIdentifierTarget[];
  truncated: boolean;
}

export type CanvasDirection = 'up' | 'down' | 'left' | 'right';

export type CanvasSelectionLevel = 'canvas' | 'container';

export interface CanvasSelection {
  level: CanvasSelectionLevel;
  /** The home diagram is the selection home. */
  diagramId: string | null;
  containerId?: string;
  objectId?: string;
}

export interface CanvasSelectionState {
  selection: CanvasSelection;
}

export type CanvasSelectionAction =
  | { type: 'selectContainer'; containerId: string }
  | { type: 'selectObject'; diagramId: string; objectId: string }
  | { type: 'enter' }
  | { type: 'escape' }
  | { type: 'move'; direction: CanvasDirection };

export function diagramCardKey(id: string): string {
  return `diagram:${id}`;
}

export function codeContainerKey(id: string): string {
  return `code:${id}`;
}
