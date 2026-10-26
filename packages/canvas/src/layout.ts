import type {
  CanvasLayout,
  CanvasLayoutItem,
  CanvasRect,
  CanvasScene,
  CanvasSize,
  CanvasViewport,
} from './types.js';
import { codeContainerKey, diagramCardKey } from './types.js';

const VIEWPORT_PADDING = 48;

/** The board never zooms out past a quarter or in past 1.4×. */
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 1.4;

/**
 * A diagram card wraps the compiled diagram with a header and a small padding.
 * The card, not the diagram, is the canvas node, so a diagram object can own a
 * connector handle without changing the compiled diagram.
 */
const DIAGRAM_CARD_PADDING = 16;
const DIAGRAM_CARD_HEADER = 40;
const DIAGRAM_CARD_BOTTOM_PADDING = 16;

const CARD_GAP = 32;
const SECTION_GAP = 48;
const CONTAINER_GAP = 24;

/**
 * A code container starts collapsed to 24 lines, so its height follows the
 * visible excerpt instead of the full file. The clamp keeps one-line anchors
 * readable and long anchors inside a predictable card.
 */
const CODE_CARD_WIDTH = 420;
const CODE_CARD_CHROME = 104;
const CODE_CARD_LINE_HEIGHT = 18;
const CODE_CARD_MIN_HEIGHT = 220;
const CODE_CARD_MAX_HEIGHT = 560;
const CODE_CARD_VISIBLE_LINES = 24;

/** The home card and two container columns need this much horizontal room. */
const TWO_COLUMN_MIN_VIEWPORT_WIDTH = 1280;

/**
 * Places cards deterministically. The layout is synchronous; auto-arrange is a
 * separate command that may use a richer engine.
 *
 * The sweep is: home at the origin, containers in reading order to the right,
 * and satellite diagrams below the whole top band. Reading order fills a
 * column before starting the next one, so the first containers stay closest to
 * the home card.
 */
export function layoutCanvas(scene: CanvasScene, viewport: CanvasSize): CanvasLayout {
  const items: Record<string, CanvasLayoutItem> = {};
  const home =
    scene.diagrams.find((diagram) => diagram.home) ??
    scene.diagrams.find((diagram) => diagram.id === scene.homeDiagramId) ??
    null;
  const satellites = scene.diagrams.filter((diagram) => diagram.id !== home?.id);

  let homeCard: CanvasLayoutItem | null = null;
  if (home) {
    const size = diagramCardSize(home.diagram);
    homeCard = {
      id: diagramCardKey(home.id),
      x: 0,
      y: 0,
      ...size,
    };
    items[homeCard.id] = homeCard;
  }

  const columns =
    scene.containers.length > 1 && viewport.width >= TWO_COLUMN_MIN_VIEWPORT_WIDTH
      ? 2
      : 1;
  const rowsPerColumn =
    columns > 1 ? Math.ceil(scene.containers.length / columns) : scene.containers.length;
  const containerOriginX = homeCard ? homeCard.x + homeCard.width + CARD_GAP : 0;

  let topBandBottom = homeCard ? homeCard.y + homeCard.height : 0;
  const columnBottoms: number[] = [];

  scene.containers.forEach((container, index) => {
    const column = rowsPerColumn === 0 ? 0 : Math.floor(index / rowsPerColumn);
    const y = columnBottoms[column] ?? 0;
    const height = codeCardHeight(container.excerpt);
    const item: CanvasLayoutItem = {
      id: codeContainerKey(container.id),
      x: containerOriginX + column * (CODE_CARD_WIDTH + CARD_GAP),
      y,
      width: CODE_CARD_WIDTH,
      height,
    };
    items[item.id] = item;
    columnBottoms[column] = y + height + CONTAINER_GAP;
    topBandBottom = Math.max(topBandBottom, y + height);
  });

  const satelliteY = topBandBottom > 0 ? topBandBottom + SECTION_GAP : 0;
  let satelliteX = 0;
  for (const diagram of satellites) {
    const size = diagramCardSize(diagram.diagram);
    const item: CanvasLayoutItem = {
      id: diagramCardKey(diagram.id),
      x: satelliteX,
      y: satelliteY,
      ...size,
    };
    items[item.id] = item;
    satelliteX += size.width + CARD_GAP;
  }

  return { items, bounds: boundsOf(items) };
}

/** Returns the viewport that frames the whole layout. */
export function viewportFor(
  bounds: { x: number; y: number; width: number; height: number },
  viewport: CanvasSize,
  padding = VIEWPORT_PADDING,
): CanvasViewport {
  const inset = Math.max(0, padding);
  const availableWidth = Math.max(0, viewport.width - inset * 2);
  const availableHeight = Math.max(0, viewport.height - inset * 2);

  const fit =
    bounds.width > 0 && bounds.height > 0
      ? Math.min(availableWidth / bounds.width, availableHeight / bounds.height)
      : 1;
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, fit));

  return {
    x: viewport.width / 2 - (bounds.x + bounds.width / 2) * zoom,
    y: viewport.height / 2 - (bounds.y + bounds.height / 2) * zoom,
    zoom,
  };
}

function diagramCardSize(diagram: CanvasSize): CanvasSize {
  return {
    width: Math.ceil(diagram.width) + DIAGRAM_CARD_PADDING * 2,
    height: Math.ceil(diagram.height) + DIAGRAM_CARD_HEADER + DIAGRAM_CARD_BOTTOM_PADDING,
  };
}

function codeCardHeight(excerpt: string): number {
  const visibleLines = Math.min(excerpt.split('\n').length, CODE_CARD_VISIBLE_LINES);
  const height = CODE_CARD_CHROME + visibleLines * CODE_CARD_LINE_HEIGHT;
  return Math.min(CODE_CARD_MAX_HEIGHT, Math.max(CODE_CARD_MIN_HEIGHT, height));
}

function boundsOf(items: Record<string, CanvasLayoutItem>): CanvasRect {
  const values = Object.values(items);
  if (values.length === 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const item of values) {
    minX = Math.min(minX, item.x);
    minY = Math.min(minY, item.y);
    maxX = Math.max(maxX, item.x + item.width);
    maxY = Math.max(maxY, item.y + item.height);
  }

  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}
