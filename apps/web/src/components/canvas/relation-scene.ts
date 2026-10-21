import {
  codeContainerKey,
  diagramCardKey,
  layoutCanvas,
  type CanvasCodeContainer,
  type CanvasFlowLink,
  type CanvasLayout,
  type CanvasLayoutItem,
  type CanvasRect,
  type CanvasRelationDirection,
  type CanvasRelationResponse,
  type CanvasScene,
  type CanvasSize,
} from '@sothspell/canvas';

/**
 * The web adapter that merges bounded relation payloads into the pure Phase 17
 * scene. The package still owns node identity and evidence; this module owns
 * only relation ownership, reuse, and the extra columns.
 */

export type CanvasRelationToggleDirection = 'incoming' | 'outgoing';

/** Loads are keyed by an owner so two toggles can share one container. */
export type CanvasRelationLoad =
  | { status: 'loading' }
  | { status: 'ready'; response: CanvasRelationResponse }
  | { status: 'unavailable'; message: string }
  | { status: 'error'; message: string };

export interface CanvasRelationUiState {
  activeOwners: ReadonlySet<string>;
  loads: Readonly<Record<string, CanvasRelationLoad>>;
  manualContainerIds: ReadonlySet<string>;
}

export interface CanvasRelationMeta {
  symbolId: string;
  relation?: 'calls' | 'references' | 'imports';
  confidence?: 'syntax' | 'import';
  definition: boolean;
  directions: CanvasRelationToggleDirection[];
}

export interface CanvasRelationStatusCard {
  id: string;
  ownerKey: string;
  direction: CanvasRelationDirection;
  state: 'loading' | 'empty' | 'unavailable' | 'error';
  message?: string;
  containerId?: string;
  symbolId?: string;
}

export interface CanvasRelationScene {
  scene: CanvasScene;
  relationMeta: Record<string, CanvasRelationMeta>;
  statuses: CanvasRelationStatusCard[];
}

export interface CanvasRelationLayout extends CanvasLayout {
  statusItems: Record<string, CanvasLayoutItem>;
}

const CODE_CARD_WIDTH = 420;
const CODE_CARD_CHROME = 104;
const CODE_CARD_LINE_HEIGHT = 18;
const CODE_CARD_MIN_HEIGHT = 220;
const CODE_CARD_MAX_HEIGHT = 560;
const CODE_CARD_VISIBLE_LINES = 24;
const STATUS_CARD_HEIGHT = 132;
const COLUMN_GAP = 32;
const CARD_GAP = 24;

export function relationContainerId(symbolId: string): string {
  return `relation:${symbolId}`;
}

export function relationOwnerKey(
  containerId: string,
  direction: CanvasRelationToggleDirection,
): string {
  return `toggle:${containerId}:${direction}`;
}

export function parseRelationOwnerKey(
  key: string,
): { containerId: string; direction: CanvasRelationToggleDirection } | null {
  if (!key.startsWith('toggle:')) {
    return null;
  }
  const rest = key.slice('toggle:'.length);
  const separator = rest.lastIndexOf(':');
  if (separator < 1) {
    return null;
  }
  const direction = rest.slice(separator + 1);
  if (direction !== 'incoming' && direction !== 'outgoing') {
    return null;
  }
  return { containerId: rest.slice(0, separator), direction };
}

export function definitionOwnerKey(symbolId: string): string {
  return `definition:${symbolId}`;
}

export function definitionSymbolId(key: string): string | null {
  return key.startsWith('definition:') ? key.slice('definition:'.length) : null;
}

export function relationStatusKey(statusId: string): string {
  return `relationStatus:${statusId}`;
}

/**
 * A relation container keeps one stable id even when incoming and outgoing both
 * point at it. Manual definitions are included only after the viewer opens one.
 */
export function mergeRelationScene(
  base: CanvasScene,
  state: CanvasRelationUiState,
): CanvasRelationScene {
  const containers = [...base.containers];
  const byId = new Map(containers.map((container) => [container.id, container] as const));
  const bySymbol = new Map<string, CanvasCodeContainer>();
  for (const container of containers) {
    if (container.symbolId !== undefined) {
      bySymbol.set(container.symbolId, container);
    }
  }

  const relationMeta: Record<string, CanvasRelationMeta> = {};
  const links: CanvasFlowLink[] = [];
  const linkIds = new Set<string>();
  const catalog = new Map<string, { container: CanvasCodeContainer; symbolId: string }>();
  for (const load of Object.values(state.loads)) {
    if (load.status !== 'ready') {
      continue;
    }
    catalog.set(relationContainerId(load.response.symbol.id), {
      container: load.response.container,
      symbolId: load.response.symbol.id,
    });
    for (const item of load.response.relations) {
      catalog.set(relationContainerId(item.symbol.id), {
        container: item.container,
        symbolId: item.symbol.id,
      });
    }
  }

  const ensureContainer = (
    candidate: CanvasCodeContainer,
    symbolId: string,
    directions: CanvasRelationToggleDirection[],
  ): CanvasCodeContainer => {
    const existing = bySymbol.get(symbolId) ?? byId.get(relationContainerId(symbolId));
    if (existing) {
      rememberMeta(relationMeta, existing.id, symbolId, undefined, undefined, directions);
      return existing;
    }
    const id = relationContainerId(symbolId);
    const container: CanvasCodeContainer = {
      ...candidate,
      id,
      anchorId: candidate.anchorId.length > 0 ? candidate.anchorId : id,
      symbolId,
      label: candidate.label.length > 0 ? candidate.label : symbolId,
      collapsed: true,
    };
    containers.push(container);
    byId.set(container.id, container);
    bySymbol.set(symbolId, container);
    rememberMeta(relationMeta, container.id, symbolId, undefined, undefined, directions);
    return container;
  };

  const activeOwners = [...state.activeOwners].toSorted();
  for (const ownerKey of activeOwners) {
    const owner = parseRelationOwnerKey(ownerKey);
    const load = state.loads[ownerKey];
    if (!owner || load?.status !== 'ready') {
      continue;
    }
    const source = byId.get(owner.containerId);
    if (!source) {
      continue;
    }

    for (const item of load.response.relations) {
      const related = ensureContainer(item.container, item.symbol.id, [owner.direction]);
      rememberMeta(
        relationMeta,
        related.id,
        item.symbol.id,
        item.relation,
        item.confidence,
        [owner.direction],
      );

      const fromContainerId = owner.direction === 'incoming' ? related.id : source.id;
      const toContainerId = owner.direction === 'incoming' ? source.id : related.id;
      const id = `flow:${ownerKey}:${related.id}`;
      if (linkIds.has(id)) {
        continue;
      }
      linkIds.add(id);
      links.push({
        kind: 'flow',
        id,
        fromContainerId,
        toContainerId,
        relation: item.relation,
        confidence: item.confidence,
      });
    }
  }

  for (const [ownerKey, load] of Object.entries(state.loads)) {
    const symbolId = definitionSymbolId(ownerKey);
    if (symbolId === null || load.status !== 'ready') {
      continue;
    }
    const target = relationContainerId(load.response.symbol.id);
    if (!state.manualContainerIds.has(target)) {
      continue;
    }
    ensureContainer(load.response.container, load.response.symbol.id, []);
    rememberMeta(
      relationMeta,
      relationContainerId(load.response.symbol.id),
      load.response.symbol.id,
      undefined,
      undefined,
      [],
    );
    const container = bySymbol.get(load.response.symbol.id);
    if (container) {
      relationMeta[container.id] = {
        ...relationMeta[container.id]!,
        definition: true,
      };
    }
  }

  // A definition opened from a relation container marks that container manual.
  // If its toggle later closes, the cached payload keeps the card on the board.
  for (const containerId of state.manualContainerIds) {
    if (byId.has(containerId)) {
      continue;
    }
    const entry = catalog.get(containerId);
    if (entry) {
      ensureContainer(entry.container, entry.symbolId, []);
    }
  }

  const statuses: CanvasRelationStatusCard[] = [];
  for (const ownerKey of [...state.activeOwners].toSorted()) {
    const owner = parseRelationOwnerKey(ownerKey);
    if (!owner) {
      continue;
    }
    const load = state.loads[ownerKey];
    const source = byId.get(owner.containerId);
    if (!source) {
      continue;
    }
    const card = statusFor(ownerKey, {
      direction: owner.direction,
      load,
      containerId: owner.containerId,
      symbolId: source?.symbolId,
    });
    if (card) {
      statuses.push(card);
    }
  }
  for (const ownerKey of Object.keys(state.loads).toSorted()) {
    const symbolId = definitionSymbolId(ownerKey);
    if (symbolId === null) {
      continue;
    }
    const load = state.loads[ownerKey];
    if (load?.status === 'ready') {
      continue;
    }
    const card = statusFor(ownerKey, {
      direction: 'definition',
      load,
      symbolId,
    });
    if (card) {
      statuses.push(card);
    }
  }

  return {
    scene: {
      ...base,
      containers,
      links: [...base.links, ...links],
    },
    relationMeta,
    statuses,
  };
}

function statusFor(
  ownerKey: string,
  input: {
    direction: CanvasRelationDirection;
    load: CanvasRelationLoad | undefined;
    containerId?: string;
    symbolId?: string;
  },
): CanvasRelationStatusCard | null {
  if (!input.load) {
    return null;
  }
  const base = {
    id: `relation-status:${ownerKey}`,
    ownerKey,
    direction: input.direction,
    ...(input.containerId === undefined ? {} : { containerId: input.containerId }),
    ...(input.symbolId === undefined ? {} : { symbolId: input.symbolId }),
  };
  switch (input.load.status) {
    case 'loading':
      return { ...base, state: 'loading' };
    case 'unavailable':
      return { ...base, state: 'unavailable', message: input.load.message };
    case 'error':
      return { ...base, state: 'error', message: input.load.message };
    case 'ready':
      return input.load.response.relations.length === 0
        ? { ...base, state: 'empty' }
        : null;
    default:
      return null;
  }
}

function rememberMeta(
  meta: Record<string, CanvasRelationMeta>,
  containerId: string,
  symbolId: string,
  relation: CanvasRelationMeta['relation'],
  confidence: CanvasRelationMeta['confidence'],
  directions: CanvasRelationToggleDirection[],
): void {
  const current = meta[containerId];
  if (!current) {
    meta[containerId] = {
      symbolId,
      definition: false,
      directions: [...new Set(directions)],
      ...(relation === undefined ? {} : { relation }),
      ...(confidence === undefined ? {} : { confidence }),
    };
    return;
  }
  for (const direction of directions) {
    if (!current.directions.includes(direction)) {
      current.directions.push(direction);
    }
  }
  if (current.relation === undefined && relation !== undefined) {
    current.relation = relation;
  }
  if (current.confidence === undefined && confidence !== undefined) {
    current.confidence = confidence;
  }
}

/**
 * Relation columns sit outside the Phase 17 board: incoming on the left and
 * outgoing (or a definition status) on the right. Base cards keep their
 * positions, so opening a relation never reflows the diagram the viewer knows.
 */
export function layoutRelationCanvas(
  base: CanvasScene,
  build: CanvasRelationScene,
  viewport: CanvasSize,
  textScale = 1,
): CanvasRelationLayout {
  const baseLayout = layoutCanvas(base, viewport);
  const items: Record<string, CanvasLayoutItem> = { ...baseLayout.items };
  const statusItems: Record<string, CanvasLayoutItem> = {};
  const baseIds = new Set(base.containers.map((container) => container.id));
  const extensions = build.scene.containers.filter(
    (container) => !baseIds.has(container.id),
  );

  const left: Array<
    | { kind: 'container'; id: string; height: number }
    | {
        kind: 'status';
        id: string;
        status: CanvasRelationStatusCard;
      }
  > = [];
  const right: typeof left = [];

  for (const status of build.statuses) {
    const target = status.direction === 'incoming' ? left : right;
    target.push({ kind: 'status', id: relationStatusKey(status.id), status });
  }
  for (const container of extensions) {
    const directions = build.relationMeta[container.id]?.directions ?? [];
    const target = directions.includes('outgoing') ? right : left;
    target.push({
      kind: 'container',
      id: codeContainerKey(container.id),
      height: relationCardHeight(container.excerpt),
    });
  }

  const leftSorted = left.toSorted((a, b) => a.id.localeCompare(b.id));
  const rightSorted = right.toSorted((a, b) => a.id.localeCompare(b.id));

  const leftX = baseLayout.bounds.x - CODE_CARD_WIDTH - COLUMN_GAP;
  const rightX = baseLayout.bounds.x + baseLayout.bounds.width + COLUMN_GAP;

  const leftBottom = placeColumn(
    leftSorted,
    leftX,
    baseLayout.bounds.y,
    items,
    statusItems,
  );
  const rightBottom = placeColumn(
    rightSorted,
    rightX,
    baseLayout.bounds.y,
    items,
    statusItems,
  );

  // A tall relation column must not run under the satellite diagram row.
  const home = base.diagrams.find((diagram) => diagram.home);
  const satelliteIds = base.diagrams
    .filter((diagram) => diagram.id !== home?.id)
    .map((diagram) => diagramCardKey(diagram.id));
  const satelliteTops = satelliteIds
    .map((id) => items[id]?.y)
    .filter((y): y is number => y !== undefined);
  if (satelliteTops.length > 0) {
    const satelliteTop = Math.min(...satelliteTops);
    const relationBottom = Math.max(leftBottom, rightBottom);
    const shift = Math.max(0, relationBottom + COLUMN_GAP - satelliteTop);
    if (shift > 0) {
      for (const id of satelliteIds) {
        const item = items[id];
        if (item) {
          items[id] = { ...item, y: item.y + shift };
        }
      }
    }
  }

  return scaleLayout({ items, bounds: boundsOf(items), statusItems }, textScale);
}

/**
 * Text scale scales the card geometry with the type. The browser then renders
 * both a larger card and larger text, so a 200% preference never squeezes the
 * excerpt into a fixed 420 px box. The saved viewport still uses unscaled
 * world coordinates via React Flow.
 */
function scaleLayout(layout: CanvasRelationLayout, scale: number): CanvasRelationLayout {
  if (!Number.isFinite(scale) || scale <= 0 || scale === 1) {
    return layout;
  }
  const scaleItem = (item: CanvasLayoutItem): CanvasLayoutItem => ({
    ...item,
    x: item.x * scale,
    y: item.y * scale,
    width: item.width * scale,
    height: item.height * scale,
  });
  const items: Record<string, CanvasLayoutItem> = {};
  const statusItems: Record<string, CanvasLayoutItem> = {};
  for (const [key, item] of Object.entries(layout.items)) {
    items[key] = scaleItem(item);
  }
  for (const [key, item] of Object.entries(layout.statusItems)) {
    statusItems[key] = items[key] ?? scaleItem(item);
  }
  return {
    items,
    statusItems,
    bounds: {
      x: layout.bounds.x * scale,
      y: layout.bounds.y * scale,
      width: layout.bounds.width * scale,
      height: layout.bounds.height * scale,
    },
  };
}

function placeColumn(
  column: Array<
    | { kind: 'container'; id: string; height: number }
    | {
        kind: 'status';
        id: string;
        status: CanvasRelationStatusCard;
      }
  >,
  x: number,
  startY: number,
  items: Record<string, CanvasLayoutItem>,
  statusItems: Record<string, CanvasLayoutItem>,
): number {
  let y = startY;
  for (const entry of column) {
    const height = entry.kind === 'status' ? STATUS_CARD_HEIGHT : entry.height;
    const item: CanvasLayoutItem = {
      id: entry.id,
      x,
      y,
      width: CODE_CARD_WIDTH,
      height,
    };
    items[entry.id] = item;
    if (entry.kind === 'status') {
      statusItems[entry.id] = item;
    }
    y += height + CARD_GAP;
  }
  return column.length === 0 ? startY : y - CARD_GAP;
}

function relationCardHeight(excerpt: string): number {
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
