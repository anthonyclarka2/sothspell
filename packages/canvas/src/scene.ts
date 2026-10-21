import type { CompiledAnchor, CompiledBeat, CompiledTour } from '@sothspell/core';
import type { PositionedDiagram } from '@sothspell/diagram';
import type {
  BuildCanvasSceneOptions,
  CanvasCodeContainer,
  CanvasDiagramCard,
  CanvasDiagramObject,
  CanvasEvidenceLink,
  CanvasScene,
} from './types.js';

/** The beat anchors a scene opens before the viewer asks for the rest. */
const DEFAULT_CONTAINER_LIMIT = 6;

/**
 * Builds the scene for one beat. This is the public seam the renderer uses; it
 * must stay pure and deterministic.
 */
export function buildCanvasScene(
  tour: CompiledTour,
  beat: CompiledBeat,
  options: BuildCanvasSceneOptions = {},
): CanvasScene {
  const chapter = tour.chapters.find((candidate) =>
    candidate.beats.some((chapterBeat) => chapterBeat.id === beat.id),
  );
  if (!chapter) {
    throw new Error(`beat ${beat.id} is not in tour ${tour.id}`);
  }

  const stageDiagram = beat.stage.diagramId
    ? chapter.diagrams.find((diagram) => diagram.id === beat.stage.diagramId)
    : undefined;
  const homeDiagram = stageDiagram ?? chapter.diagrams[0] ?? null;

  const openDiagramIds = new Set(options.openDiagramIds ?? []);
  const diagrams: CanvasDiagramCard[] = [];
  if (homeDiagram) {
    diagrams.push(diagramCard(homeDiagram, true));
  }
  for (const diagram of chapter.diagrams) {
    if (diagram.id !== homeDiagram?.id && openDiagramIds.has(diagram.id)) {
      diagrams.push(diagramCard(diagram, false));
    }
  }

  const containerLimit = normalizeContainerLimit(options.containerLimit);
  const containers = beat.anchors.slice(0, containerLimit).map(codeContainer);
  const containerById = new Map(
    containers.map((container) => [container.anchorId, container] as const),
  );

  const links: CanvasEvidenceLink[] = [];
  for (const card of diagrams) {
    for (const object of card.objects) {
      const container = object.anchorId ? containerById.get(object.anchorId) : undefined;
      if (!container) {
        continue;
      }
      links.push({
        kind: 'evidence',
        id: `evidence:${card.id}:${object.id}:${container.id}`,
        fromDiagramId: card.id,
        fromObjectId: object.id,
        toContainerId: container.id,
        toLine: container.startLine,
      });
    }
  }

  return {
    tourId: tour.id,
    beatId: beat.id,
    chapterId: chapter.id,
    homeDiagramId: homeDiagram?.id ?? null,
    diagrams,
    containers,
    hiddenContainerCount: beat.anchors.length - containers.length,
    links,
  };
}

/**
 * A limit of zero is meaningful (the viewer asked for no code yet), so only a
 * missing limit falls back to the default.
 */
function normalizeContainerLimit(limit: number | undefined): number {
  if (limit === undefined || Number.isNaN(limit)) {
    return DEFAULT_CONTAINER_LIMIT;
  }
  return Math.max(0, Math.floor(limit));
}

function codeContainer(anchor: CompiledAnchor): CanvasCodeContainer {
  const symbolId =
    anchor.symbolId ??
    (anchor.symbol === undefined ? undefined : `legacy:${anchor.path}#${anchor.symbol}`);
  return {
    id: anchor.id,
    anchorId: anchor.id,
    label: anchor.label ?? anchor.symbol ?? anchor.path,
    path: anchor.path,
    startLine: anchor.startLine,
    endLine: anchor.endLine,
    language: anchor.language,
    excerpt: anchor.excerpt,
    html: anchor.html,
    collapsed: true,
    ...(symbolId === undefined ? {} : { symbolId }),
  };
}

function diagramCard(diagram: PositionedDiagram, home: boolean): CanvasDiagramCard {
  return {
    id: diagram.id,
    title: diagram.title,
    kind: diagram.kind,
    home,
    diagram,
    objects: diagram.nodes.map(canvasObject),
  };
}

function canvasObject(node: PositionedDiagram['nodes'][number]): CanvasDiagramObject {
  return {
    id: node.id,
    label: node.label,
    type: node.type,
    x: node.x,
    y: node.y,
    width: node.width,
    height: node.height,
    ...(node.anchorId === undefined ? {} : { anchorId: node.anchorId }),
    ...optionalSymbolId(node),
  };
}

/**
 * Symbol targets arrive with schema 1.2.0 in Phase 18. Reading the field now
 * keeps the scene contract stable when the compiled node starts carrying it.
 */
function optionalSymbolId(value: unknown): { symbolId?: string } {
  if (typeof value !== 'object' || value === null) {
    return {};
  }
  const symbolId = (value as { symbolId?: unknown }).symbolId;
  return typeof symbolId === 'string' && symbolId.length > 0 ? { symbolId } : {};
}
