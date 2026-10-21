import type { Page } from '@playwright/test';
import type {
  CanvasCodeContainer,
  CanvasRelationDirection,
  CanvasRelationItem,
  CanvasRelationResponse,
  CanvasSymbolRef,
} from '@sothspell/canvas';

/**
 * Route fakes for the Phase 18 canvas UI. The specs exercise the browser
 * contract against bounded payloads, so they never depend on the relation
 * service or a project source root being present in the worktree.
 */

export const CANVAS_SYMBOLS = {
  service: 'symbol:apps/api/src/comments/comments.service.ts#CommentsService.create',
  caller: 'symbol:apps/api/src/comments/comments.controller.ts#CommentsController.create',
  persist: 'symbol:apps/api/src/comments/comments.service.ts#CommentsService.persist',
  shared: 'symbol:apps/api/src/comments/comments.service.ts#CommentsService.validate',
  pds: 'symbol:README.md#ATProtoPDS',
  bootstrap: 'symbol:apps/api/src/main.ts#bootstrap',
} as const;

type Behavior = 'ok' | 'empty' | 'unavailable' | 'error';
type BehaviorMap = Record<string, Behavior>;

export interface FakeCanvasRelationOptions {
  /** Mutable so a spec can make a retry succeed after the first failure. */
  behaviors?: BehaviorMap;
  delayMs?: number;
}

export interface CanvasRelationRequestRecord {
  tourId: string;
  symbolId: string;
  direction: CanvasRelationDirection;
  limit: string | null;
  offset: string | null;
}

export interface FakeCanvasRelations {
  requests: CanvasRelationRequestRecord[];
}

export function behaviorKey(
  symbolId: string,
  direction: CanvasRelationDirection,
): string {
  return `${symbolId}|${direction}`;
}

interface SymbolFixture {
  symbol: CanvasSymbolRef;
  excerpt: string;
}

function symbol(
  id: string,
  name: string,
  qualifiedName: string,
  kind: string,
  path: string,
  startLine: number,
  excerpt: string,
): SymbolFixture {
  return {
    symbol: {
      id,
      name,
      qualifiedName,
      kind,
      path,
      startLine,
      endLine: startLine + excerpt.split('\n').length - 1,
      language: 'typescript',
    },
    excerpt,
  };
}

const SYMBOLS: Record<string, SymbolFixture> = {
  [CANVAS_SYMBOLS.service]: symbol(
    CANVAS_SYMBOLS.service,
    'create',
    'CommentsService.create',
    'method',
    'apps/api/src/comments/comments.service.ts',
    12,
    [
      'async create(input: CreateCommentInput) {',
      '  const comment = await this.writer.create(input);',
      '  this.index.apply(comment);',
      '  return comment;',
      '}',
    ].join('\n'),
  ),
  [CANVAS_SYMBOLS.caller]: symbol(
    CANVAS_SYMBOLS.caller,
    'create',
    'CommentsController.create',
    'method',
    'apps/api/src/comments/comments.controller.ts',
    24,
    [
      '@Post()',
      'async create(@Body() input: CreateCommentInput) {',
      '  return this.comments.create(input);',
      '}',
    ].join('\n'),
  ),
  [CANVAS_SYMBOLS.persist]: symbol(
    CANVAS_SYMBOLS.persist,
    'persist',
    'CommentsService.persist',
    'method',
    'apps/api/src/comments/comments.service.ts',
    40,
    [
      'private async persist(comment: Comment) {',
      '  await this.repository.save(comment);',
      '  return comment;',
      '}',
    ].join('\n'),
  ),
  [CANVAS_SYMBOLS.shared]: symbol(
    CANVAS_SYMBOLS.shared,
    'validate',
    'CommentsService.validate',
    'method',
    'apps/api/src/comments/comments.service.ts',
    58,
    [
      'private validate(input: CreateCommentInput) {',
      '  if (input.text.trim().length === 0) {',
      '    throw new Error("empty comment");',
      '  }',
      '}',
    ].join('\n'),
  ),
  [CANVAS_SYMBOLS.pds]: symbol(
    CANVAS_SYMBOLS.pds,
    'ATProtoPDS',
    'ATProtoPDS',
    'class',
    'README.md',
    12,
    [
      '# Bunbun',
      '',
      'Bunbun stores comments in an ATProto PDS and indexes them locally.',
      'The PDS owns the public record; the local index serves reads.',
    ].join('\n'),
  ),
  [CANVAS_SYMBOLS.bootstrap]: symbol(
    CANVAS_SYMBOLS.bootstrap,
    'bootstrap',
    'bootstrap',
    'function',
    'apps/api/src/main.ts',
    8,
    [
      'export async function bootstrap() {',
      '  const app = await NestFactory.create(AppModule);',
      '  await app.listen(4319);',
      '}',
    ].join('\n'),
  ),
};

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function htmlFor(fixture: SymbolFixture): string {
  const lines = fixture.excerpt.split('\n');
  const start = fixture.symbol.startLine;
  return (
    '<pre class="shiki" tabindex="0"><code>' +
    lines
      .map(
        (line, index) =>
          `<span class="line" data-line="${start + index}">${escapeHtml(line)}</span>`,
      )
      .join('\n') +
    '</code></pre>'
  );
}

function containerFor(fixture: SymbolFixture): CanvasCodeContainer {
  return {
    id: `relation:${fixture.symbol.id}`,
    anchorId: `anchor_fixture_${fixture.symbol.name}`,
    symbolId: fixture.symbol.id,
    label: fixture.symbol.qualifiedName,
    path: fixture.symbol.path,
    startLine: fixture.symbol.startLine,
    endLine: fixture.symbol.endLine,
    language: fixture.symbol.language,
    excerpt: fixture.excerpt,
    html: htmlFor(fixture),
    collapsed: true,
  };
}

function relationItem(
  id: string,
  relation: CanvasRelationItem['relation'],
): CanvasRelationItem | null {
  const fixture = SYMBOLS[id];
  if (!fixture) {
    return null;
  }
  return {
    symbol: fixture.symbol,
    relation,
    confidence: relation === 'calls' ? 'syntax' : 'import',
    container: containerFor(fixture),
  };
}

const RELATIONS: Record<string, CanvasRelationItem[]> = {
  [CANVAS_SYMBOLS.service]: [
    relationItem(CANVAS_SYMBOLS.caller, 'calls'),
    relationItem(CANVAS_SYMBOLS.shared, 'calls'),
    relationItem(CANVAS_SYMBOLS.persist, 'calls'),
  ].filter((item): item is CanvasRelationItem => item !== null),
};

const OUTGOING: Record<string, CanvasRelationItem[]> = {
  [CANVAS_SYMBOLS.service]: [
    relationItem(CANVAS_SYMBOLS.shared, 'references'),
    relationItem(CANVAS_SYMBOLS.persist, 'calls'),
  ].filter((item): item is CanvasRelationItem => item !== null),
};

const INCOMING: Record<string, CanvasRelationItem[]> = {
  [CANVAS_SYMBOLS.service]: [
    relationItem(CANVAS_SYMBOLS.caller, 'calls'),
    relationItem(CANVAS_SYMBOLS.shared, 'calls'),
  ].filter((item): item is CanvasRelationItem => item !== null),
};

function responseFor(
  fixture: SymbolFixture,
  direction: CanvasRelationDirection,
  behavior: Behavior,
  limit: number,
  offset: number,
): CanvasRelationResponse {
  const source =
    direction === 'incoming'
      ? (INCOMING[fixture.symbol.id] ?? RELATIONS[fixture.symbol.id] ?? [])
      : direction === 'outgoing'
        ? (OUTGOING[fixture.symbol.id] ?? RELATIONS[fixture.symbol.id] ?? [])
        : [];
  const relations = behavior === 'empty' ? [] : source.slice(offset, offset + limit);
  return {
    available: true,
    direction,
    symbol: fixture.symbol,
    container: containerFor(fixture),
    relations,
    identifierTargets: [],
    truncated: source.length > offset + relations.length,
  };
}

function emptyResponse(direction: CanvasRelationDirection, symbolId: string) {
  return {
    available: true as const,
    direction,
    symbol: {
      id: symbolId,
      name: symbolId.split('#')[1] ?? symbolId,
      qualifiedName: symbolId.split('#')[1] ?? symbolId,
      kind: 'unknown',
      path: symbolId.replace('symbol:', '').split('#')[0] ?? '',
      startLine: 1,
      endLine: 1,
      language: 'typescript',
    },
    container: {
      id: `relation:${symbolId}`,
      anchorId: `relation:${symbolId}`,
      symbolId,
      label: symbolId,
      path: symbolId.replace('symbol:', '').split('#')[0] ?? '',
      startLine: 1,
      endLine: 1,
      language: 'typescript',
      excerpt: '',
      html: '',
      collapsed: true,
    },
    relations: [],
    identifierTargets: [],
    truncated: false,
  };
}

/**
 * Intercepts only the definition/relation endpoints. Everything else, including
 * the compiled tour, still comes from the running API.
 */
export function installFakeCanvasRelations(
  page: Page,
  options: FakeCanvasRelationOptions = {},
): FakeCanvasRelations {
  const requests: CanvasRelationRequestRecord[] = [];
  const behaviors = options.behaviors ?? {};
  const delayMs = options.delayMs ?? 0;

  void page.route(
    /\/api\/tours\/([^/]+)\/canvas\/(symbol|relations)(?:\?.*)?$/,
    async (route) => {
      const url = new URL(route.request().url());
      const match = url.pathname.match(
        /\/api\/tours\/([^/]+)\/canvas\/(symbol|relations)$/,
      );
      if (!match) {
        await route.continue();
        return;
      }
      const tourId = decodeURIComponent(match[1]!);
      const endpoint = match[2];
      const symbolId = url.searchParams.get('symbolId') ?? '';
      const direction: CanvasRelationDirection =
        endpoint === 'symbol'
          ? 'definition'
          : ((url.searchParams.get('direction') as CanvasRelationDirection | null) ??
            'incoming');
      const limit = Number(url.searchParams.get('limit') ?? '8');
      const offset = Number(url.searchParams.get('offset') ?? '0');
      requests.push({
        tourId,
        symbolId,
        direction,
        limit: url.searchParams.get('limit'),
        offset: url.searchParams.get('offset'),
      });

      if (delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }

      const behavior = behaviors[behaviorKey(symbolId, direction)] ?? 'ok';
      if (behavior === 'unavailable') {
        await route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: JSON.stringify({
            error: 'relations need a project source root',
            code: 'relations_unavailable',
          }),
        });
        return;
      }
      if (behavior === 'error') {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'relation service failed' }),
        });
        return;
      }

      const fixture = SYMBOLS[symbolId];
      if (!fixture) {
        await route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'unknown symbol' }),
        });
        return;
      }

      const response = responseFor(fixture, direction, behavior, limit, offset);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(response),
      });
    },
  );

  return { requests };
}

export interface CanvasSymbolTargets {
  /** Symbol IDs added to beat anchors; the container header can open them. */
  anchors?: Record<string, string>;
  /** Symbol IDs added to diagram nodes; `anchorId: null` removes the anchor. */
  nodes?: Record<string, { symbolId: string; anchorId?: string | null }>;
}

interface MutableAnchor {
  id: string;
  symbolId?: string;
}

interface MutableNode {
  id: string;
  anchorId?: string;
  symbolId?: string;
}

interface MutableTour {
  chapters: Array<{
    beats: Array<{ anchors: MutableAnchor[] }>;
    diagrams: Array<{ nodes: MutableNode[] }>;
  }>;
}

/** Adds schema 1.2.0 symbol targets to the golden tour in the browser only. */
export function installCanvasSymbolTargets(
  page: Page,
  targets: CanvasSymbolTargets,
): void {
  void page.route(/\/api\/tours\/tour_bunbun_golden(?:\?.*)?$/, async (route) => {
    const response = await route.fetch();
    const tour = (await response.json()) as MutableTour;
    for (const chapter of tour.chapters) {
      for (const beat of chapter.beats) {
        for (const anchor of beat.anchors) {
          const symbolId = targets.anchors?.[anchor.id];
          if (symbolId !== undefined) {
            anchor.symbolId = symbolId;
          }
        }
      }
      for (const diagram of chapter.diagrams) {
        for (const node of diagram.nodes) {
          const target = targets.nodes?.[node.id];
          if (!target) {
            continue;
          }
          node.symbolId = target.symbolId;
          if (target.anchorId === null) {
            delete node.anchorId;
          } else if (target.anchorId !== undefined) {
            node.anchorId = target.anchorId;
          }
        }
      }
    }
    await route.fulfill({ response, json: tour });
  });
}

export { emptyResponse };
