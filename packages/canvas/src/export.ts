import { layoutCanvas } from './layout.js';
import type {
  CanvasDiagramCard,
  CanvasRect,
  CanvasRelationConfidence,
  CanvasRelationKind,
  CanvasScene,
} from './types.js';

/**
 * The export model is the artifact description for one board: what it is
 * called, which rectangle it covers, which code containers it includes in
 * reading order, and what a print sheet must contain. PNG and JPG capture the
 * DOM, but their names, bounds, and hidden controls come from here so the menu,
 * the adapter, and the tests agree on one description.
 */
export type CanvasExportScope = 'view' | 'board';
export type CanvasExportFormat = 'png' | 'jpg' | 'pdf';

/** Device scale the image adapter must request from modern-screenshot. */
export const CANVAS_EXPORT_SCALE = 2;

/** Browsers refuse canvases beyond this; the adapter downscales instead. */
export const CANVAS_EXPORT_MAX_DIMENSION = 8192;

/** The deterministic layout width used when the live board is not supplied. */
export const CANVAS_EXPORT_LAYOUT_WIDTH = 1440;

/**
 * Transient UI the image capture hides. The adapter sets
 * `data-canvas-export="image"` on the canvas root and the stylesheet uses these
 * selectors; keeping the list in the model makes the contract testable without
 * a browser.
 */
export const CANVAS_EXPORT_HIDDEN_SELECTORS = [
  '.canvas-controls',
  '.canvas-tray',
  '.canvas-outline',
  '.canvas-notice',
  '.canvas-display',
  '.canvas-fullscreen-hint',
  '.canvas-relation-legend',
] as const;

/** A React Flow viewport, with the board size in CSS pixels. */
export interface CanvasExportViewport {
  x: number;
  y: number;
  zoom: number;
  width: number;
  height: number;
}

/** Entity ids are safe in a file name; everything else collapses to a dash. */
export function exportSlug(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, 64);
  return slug.length > 0 ? slug : 'canvas';
}

export interface CanvasExportTitle {
  tourId: string;
  tourTitle: string;
  projectSlug: string;
  projectName: string;
  revision: string;
  revisionDirty: boolean;
  chapterId: string;
  chapterTitle: string;
  beatId: string;
  beatTitle: string;
  locale: string;
  /** ISO timestamp of the export; null when the caller did not supply a clock. */
  exportedAt: string | null;
}

export interface CanvasExportRelation {
  id: string;
  relation: CanvasRelationKind;
  confidence: CanvasRelationConfidence;
  direction: 'incoming' | 'outgoing';
  counterpartId: string;
  counterpartLabel: string;
}

/** One code container as it appears in the export, in reading order. */
export interface CanvasExportContainer {
  id: string;
  anchorId: string;
  label: string;
  path: string;
  startLine: number;
  endLine: number;
  language: string;
  lineCount: number;
  html: string;
  excerpt: string;
  /** Tour anchors print in full; API relation containers keep their bounded excerpt. */
  source: 'anchor' | 'relation';
  relations: CanvasExportRelation[];
}

export interface CanvasPrintRelationSummary {
  id: string;
  relation: CanvasRelationKind;
  confidence: CanvasRelationConfidence;
  fromId: string;
  fromLabel: string;
  toId: string;
  toLabel: string;
}

export type CanvasPrintSection =
  | { kind: 'diagram'; diagram: CanvasDiagramCard }
  | { kind: 'container'; container: CanvasExportContainer }
  | { kind: 'relations'; relations: CanvasPrintRelationSummary[] };

export interface CanvasPrintModel {
  title: CanvasExportTitle;
  sections: CanvasPrintSection[];
  relations: CanvasPrintRelationSummary[];
  /** Anchors the beat has but the board did not open. */
  hiddenContainerCount: number;
}

interface CanvasExportBase {
  fileName: string;
  title: CanvasExportTitle;
  bounds: CanvasRect;
  containers: CanvasExportContainer[];
  hiddenSelectors: readonly string[];
}

export interface CanvasImageExportModel extends CanvasExportBase {
  kind: 'image';
  scope: 'view' | 'board';
  format: 'png' | 'jpg';
  mimeType: 'image/png' | 'image/jpeg';
  scale: number;
  maxDimension: number;
  print: null;
}

export interface CanvasPrintExportModel extends CanvasExportBase {
  kind: 'print';
  scope: 'board';
  format: 'pdf';
  mimeType: 'application/pdf';
  scale: null;
  maxDimension: null;
  print: CanvasPrintModel;
}

export type CanvasExportModel = CanvasImageExportModel | CanvasPrintExportModel;

export interface BuildCanvasExportOptions {
  scope: CanvasExportScope;
  format: CanvasExportFormat;
  /**
   * The live board transform. A view export reports the visible scene
   * rectangle; without it, the model reports the whole scene so it never
   * invents a smaller area than the capture.
   */
  viewport?: CanvasExportViewport;
  /** Injected so a print heading is deterministic in tests. */
  exportedAt?: string;
  /** Containers the relation adapter added, which print as bounded excerpts. */
  relationContainerIds?: Iterable<string>;
  /** Board width used by the deterministic layout. Default 1440. */
  layoutWidth?: number;
}

export function buildExportModel(
  scene: CanvasScene,
  options: BuildCanvasExportOptions,
): CanvasExportModel {
  // Print is a document over the whole beat; a menu that happens to pass the
  // view scope must not produce a cropped handout.
  const scope: 'view' | 'board' = options.format === 'pdf' ? 'board' : options.scope;
  const layout = layoutCanvas(scene, {
    width: options.layoutWidth ?? CANVAS_EXPORT_LAYOUT_WIDTH,
    height: 900,
  });
  const bounds =
    scope === 'view' && options.viewport !== undefined
      ? visibleBounds(options.viewport, layout.bounds)
      : layout.bounds;
  const title = exportTitle(scene, options.exportedAt);
  const containers = exportContainers(scene, options.relationContainerIds);
  const print = options.format === 'pdf' ? printModel(scene, title, containers) : null;

  const base = {
    fileName: exportFileName(scene, scope, options.format),
    title,
    bounds,
    containers,
    hiddenSelectors: [...CANVAS_EXPORT_HIDDEN_SELECTORS],
  } as const;

  if (options.format === 'pdf') {
    return {
      ...base,
      kind: 'print',
      scope: 'board',
      format: 'pdf',
      mimeType: 'application/pdf',
      scale: null,
      maxDimension: null,
      print: print as CanvasPrintModel,
    };
  }

  return {
    ...base,
    kind: 'image',
    scope,
    format: options.format,
    mimeType: options.format === 'jpg' ? 'image/jpeg' : 'image/png',
    scale: CANVAS_EXPORT_SCALE,
    maxDimension: CANVAS_EXPORT_MAX_DIMENSION,
    print: null,
  };
}

/** The rectangle the viewport shows, in scene coordinates. */
function visibleBounds(viewport: CanvasExportViewport, fallback: CanvasRect): CanvasRect {
  const { x, y, zoom, width, height } = viewport;
  if (
    !Number.isFinite(zoom) ||
    zoom <= 0 ||
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return fallback;
  }
  return {
    x: -x / zoom,
    y: -y / zoom,
    width: width / zoom,
    height: height / zoom,
  };
}

function exportFileName(
  scene: CanvasScene,
  scope: 'view' | 'board',
  format: CanvasExportFormat,
): string {
  const project = exportSlug(scene.metadata?.projectSlug ?? scene.tourId);
  const beat = exportSlug(scene.beatId);
  const suffix = format === 'pdf' ? 'print' : scope;
  const extension = format === 'pdf' ? 'pdf' : format;
  return `sothspell-${project}-${beat}-${suffix}.${extension}`;
}

function exportTitle(
  scene: CanvasScene,
  exportedAt: string | undefined,
): CanvasExportTitle {
  const metadata = scene.metadata;
  return {
    tourId: scene.tourId,
    tourTitle: metadata?.tourTitle ?? scene.tourId,
    projectSlug: metadata?.projectSlug ?? scene.tourId,
    projectName: metadata?.projectName ?? scene.tourId,
    revision: metadata?.revision ?? 'unknown',
    revisionDirty: metadata?.revisionDirty ?? false,
    chapterId: scene.chapterId,
    chapterTitle: metadata?.chapterTitle ?? scene.chapterId,
    beatId: scene.beatId,
    beatTitle: metadata?.beatTitle ?? scene.beatId,
    locale: metadata?.locale ?? 'en',
    exportedAt: exportedAt ?? null,
  };
}

function exportContainers(
  scene: CanvasScene,
  relationContainerIds: Iterable<string> | undefined,
): CanvasExportContainer[] {
  const relationIds = new Set(relationContainerIds ?? []);
  const labels = new Map(
    scene.containers.map((container) => [container.id, container.label] as const),
  );

  const relationText = (
    containerId: string,
    direction: 'incoming' | 'outgoing',
  ): CanvasExportRelation[] => {
    const relations: CanvasExportRelation[] = [];
    for (const link of scene.links) {
      if (link.kind !== 'flow') {
        continue;
      }
      if (direction === 'outgoing' && link.fromContainerId === containerId) {
        relations.push({
          id: link.id,
          relation: link.relation,
          confidence: link.confidence,
          direction,
          counterpartId: link.toContainerId,
          counterpartLabel: labels.get(link.toContainerId) ?? link.toContainerId,
        });
      } else if (direction === 'incoming' && link.toContainerId === containerId) {
        relations.push({
          id: link.id,
          relation: link.relation,
          confidence: link.confidence,
          direction,
          counterpartId: link.fromContainerId,
          counterpartLabel: labels.get(link.fromContainerId) ?? link.fromContainerId,
        });
      }
    }
    return relations;
  };

  return scene.containers.map((container) => ({
    id: container.id,
    anchorId: container.anchorId,
    label: container.label,
    path: container.path,
    startLine: container.startLine,
    endLine: container.endLine,
    language: container.language,
    lineCount: container.excerpt.split('\n').length,
    html: container.html,
    excerpt: container.excerpt,
    // A relation container is added by the web adapter with the `relation:`
    // prefix; the caller may name them explicitly so the package does not have
    // to infer intent from an id in every future adapter.
    source:
      relationIds.has(container.id) || container.id.startsWith('relation:')
        ? 'relation'
        : 'anchor',
    relations: [
      ...relationText(container.id, 'incoming'),
      ...relationText(container.id, 'outgoing'),
    ],
  }));
}

function printModel(
  scene: CanvasScene,
  title: CanvasExportTitle,
  containers: CanvasExportContainer[],
): CanvasPrintModel {
  const labels = new Map(
    containers.map((container) => [container.id, container.label] as const),
  );
  const relations: CanvasPrintRelationSummary[] = scene.links.flatMap((link) =>
    link.kind === 'flow'
      ? [
          {
            id: link.id,
            relation: link.relation,
            confidence: link.confidence,
            fromId: link.fromContainerId,
            fromLabel: labels.get(link.fromContainerId) ?? link.fromContainerId,
            toId: link.toContainerId,
            toLabel: labels.get(link.toContainerId) ?? link.toContainerId,
          },
        ]
      : [],
  );

  const home =
    scene.diagrams.find((diagram) => diagram.home) ??
    scene.diagrams.find((diagram) => diagram.id === scene.homeDiagramId);

  const sections: CanvasPrintSection[] = [];
  if (home !== undefined) {
    sections.push({ kind: 'diagram', diagram: home });
  }
  for (const container of containers) {
    sections.push({ kind: 'container', container });
  }
  if (relations.length > 0) {
    sections.push({ kind: 'relations', relations });
  }

  return {
    title,
    sections,
    relations,
    hiddenContainerCount: scene.hiddenContainerCount,
  };
}
