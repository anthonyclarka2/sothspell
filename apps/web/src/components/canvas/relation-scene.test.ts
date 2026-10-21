import { describe, expect, it } from 'vitest';
import {
  codeContainerKey,
  type CanvasCodeContainer,
  type CanvasRelationResponse,
  type CanvasScene,
} from '@sothspell/canvas';
import {
  definitionOwnerKey,
  layoutRelationCanvas,
  mergeRelationScene,
  relationContainerId,
  relationOwnerKey,
  relationStatusKey,
  type CanvasRelationUiState,
} from './relation-scene.js';

const SERVICE = 'symbol:apps/api/src/comments/comments.service.ts#CommentsService.create';
const CALLER =
  'symbol:apps/api/src/comments/comments.controller.ts#CommentsController.create';
const PERSIST =
  'symbol:apps/api/src/comments/comments.service.ts#CommentsService.persist';
const SHARED =
  'symbol:apps/api/src/comments/comments.service.ts#CommentsService.validate';

function container(
  id: string,
  symbolId: string | undefined,
  label: string,
): CanvasCodeContainer {
  return {
    id,
    anchorId: id,
    ...(symbolId === undefined ? {} : { symbolId }),
    label,
    path: `src/${id}.ts`,
    startLine: 1,
    endLine: 4,
    language: 'typescript',
    excerpt: 'one\ntwo\nthree\nfour',
    html: '<pre class="shiki"><code>one</code></pre>',
    collapsed: true,
  };
}

function symbol(id: string, name: string) {
  const [path, qualified] = id.replace('symbol:', '').split('#');
  return {
    id,
    name: qualified ?? name,
    qualifiedName: qualified ?? name,
    kind: 'method',
    path: path ?? 'src/file.ts',
    startLine: 1,
    endLine: 4,
    language: 'typescript',
  };
}

function response(
  direction: 'definition' | 'incoming' | 'outgoing',
  source: string,
  related: Array<{ id: string; relation: 'calls' | 'references' | 'imports' }>,
): CanvasRelationResponse {
  const sourceSymbol = symbol(source, 'source');
  return {
    available: true,
    direction,
    symbol: sourceSymbol,
    container: container(relationContainerId(source), source, sourceSymbol.name),
    relations: related.map((item) => {
      const relationSymbol = symbol(item.id, 'related');
      return {
        symbol: relationSymbol,
        relation: item.relation,
        confidence: 'syntax',
        container: container(relationContainerId(item.id), item.id, relationSymbol.name),
      };
    }),
    identifierTargets: [],
    truncated: false,
  };
}

function baseScene(): CanvasScene {
  return {
    tourId: 'tour_fixture',
    beatId: 'beat_write',
    chapterId: 'chapter_write',
    homeDiagramId: 'diagram_write',
    diagrams: [],
    containers: [container('anchor_comments_create', SERVICE, 'CommentsService.create')],
    hiddenContainerCount: 0,
    links: [
      {
        kind: 'evidence',
        id: 'evidence:diagram_write:node_service:anchor_comments_create',
        fromDiagramId: 'diagram_write',
        fromObjectId: 'node_service',
        toContainerId: 'anchor_comments_create',
        toLine: 1,
      },
    ],
  };
}

function state(overrides: Partial<CanvasRelationUiState> = {}): CanvasRelationUiState {
  return {
    activeOwners: new Set(),
    loads: {},
    manualContainerIds: new Set(),
    ...overrides,
  };
}

describe('relation scene adapter', () => {
  it('adds an outgoing container with a stable relation id and a flow link', () => {
    const owner = relationOwnerKey('anchor_comments_create', 'outgoing');
    const build = mergeRelationScene(
      baseScene(),
      state({
        activeOwners: new Set([owner]),
        loads: {
          [owner]: {
            status: 'ready',
            response: response('outgoing', SERVICE, [{ id: PERSIST, relation: 'calls' }]),
          },
        },
      }),
    );

    const related = build.scene.containers.find(
      (entry) => entry.id === relationContainerId(PERSIST),
    );
    expect(related).toMatchObject({
      id: relationContainerId(PERSIST),
      symbolId: PERSIST,
    });
    expect(build.scene.links).toContainEqual({
      kind: 'flow',
      id: expect.stringContaining(owner),
      fromContainerId: 'anchor_comments_create',
      toContainerId: relationContainerId(PERSIST),
      relation: 'calls',
      confidence: 'syntax',
    });
    expect(build.scene.links).toContainEqual(
      expect.objectContaining({ kind: 'evidence' }),
    );
  });

  it('reverses an incoming flow link and keeps the related container', () => {
    const owner = relationOwnerKey('anchor_comments_create', 'incoming');
    const build = mergeRelationScene(
      baseScene(),
      state({
        activeOwners: new Set([owner]),
        loads: {
          [owner]: {
            status: 'ready',
            response: response('incoming', SERVICE, [{ id: CALLER, relation: 'calls' }]),
          },
        },
      }),
    );

    expect(build.scene.links).toContainEqual(
      expect.objectContaining({
        kind: 'flow',
        fromContainerId: relationContainerId(CALLER),
        toContainerId: 'anchor_comments_create',
      }),
    );
  });

  it('reuses a container that already exists in the scene', () => {
    const owner = relationOwnerKey('anchor_comments_create', 'incoming');
    const build = mergeRelationScene(
      baseScene(),
      state({
        activeOwners: new Set([owner]),
        loads: {
          [owner]: {
            status: 'ready',
            response: response('incoming', SERVICE, [{ id: SERVICE, relation: 'calls' }]),
          },
        },
      }),
    );

    expect(
      build.scene.containers.filter((entry) => entry.symbolId === SERVICE),
    ).toHaveLength(1);
    expect(build.scene.links).toContainEqual(
      expect.objectContaining({
        fromContainerId: 'anchor_comments_create',
        toContainerId: 'anchor_comments_create',
      }),
    );
  });

  it('keeps a shared container while any owner is active', () => {
    const incoming = relationOwnerKey('anchor_comments_create', 'incoming');
    const outgoing = relationOwnerKey('anchor_comments_create', 'outgoing');
    const loads = {
      [incoming]: {
        status: 'ready' as const,
        response: response('incoming', SERVICE, [
          { id: CALLER, relation: 'calls' as const },
          { id: SHARED, relation: 'calls' as const },
        ]),
      },
      [outgoing]: {
        status: 'ready' as const,
        response: response('outgoing', SERVICE, [
          { id: SHARED, relation: 'calls' as const },
          { id: PERSIST, relation: 'calls' as const },
        ]),
      },
    };

    const both = mergeRelationScene(
      baseScene(),
      state({ activeOwners: new Set([incoming, outgoing]), loads }),
    );
    expect(
      both.scene.containers.filter((entry) => entry.id === relationContainerId(SHARED)),
    ).toHaveLength(1);

    const outgoingOnly = mergeRelationScene(
      baseScene(),
      state({ activeOwners: new Set([outgoing]), loads }),
    );
    expect(
      outgoingOnly.scene.containers.some(
        (entry) => entry.id === relationContainerId(SHARED),
      ),
    ).toBe(true);
    expect(
      outgoingOnly.scene.containers.some(
        (entry) => entry.id === relationContainerId(CALLER),
      ),
    ).toBe(false);
  });

  it('keeps a relation container that was opened manually after its toggle closes', () => {
    const owner = relationOwnerKey('anchor_comments_create', 'incoming');
    const target = relationContainerId(CALLER);
    const build = mergeRelationScene(
      baseScene(),
      state({
        activeOwners: new Set(),
        manualContainerIds: new Set([target]),
        loads: {
          [owner]: {
            status: 'ready',
            response: response('incoming', SERVICE, [{ id: CALLER, relation: 'calls' }]),
          },
        },
      }),
    );

    expect(build.scene.containers.some((entry) => entry.id === target)).toBe(true);
    expect(build.scene.links.some((link) => link.kind === 'flow')).toBe(false);
  });

  it('includes a manually opened definition and no flow link for it', () => {
    const key = definitionOwnerKey(PERSIST);
    const target = relationContainerId(PERSIST);
    const build = mergeRelationScene(
      baseScene(),
      state({
        manualContainerIds: new Set([target]),
        loads: {
          [key]: {
            status: 'ready',
            response: response('definition', PERSIST, []),
          },
        },
      }),
    );

    expect(build.scene.containers.some((entry) => entry.id === target)).toBe(true);
    expect(build.scene.links.some((link) => link.kind === 'flow')).toBe(false);
  });

  it('omits a definition that was fetched but never opened manually', () => {
    const key = definitionOwnerKey(PERSIST);
    const build = mergeRelationScene(
      baseScene(),
      state({
        loads: {
          [key]: {
            status: 'ready',
            response: response('definition', PERSIST, []),
          },
        },
      }),
    );

    expect(
      build.scene.containers.some((entry) => entry.id === relationContainerId(PERSIST)),
    ).toBe(false);
  });

  it('reports empty and failed relation states as status cards', () => {
    const empty = relationOwnerKey('anchor_comments_create', 'incoming');
    const failed = relationOwnerKey('anchor_comments_create', 'outgoing');
    const build = mergeRelationScene(
      baseScene(),
      state({
        activeOwners: new Set([empty, failed]),
        loads: {
          [empty]: {
            status: 'ready',
            response: response('incoming', SERVICE, []),
          },
          [failed]: { status: 'unavailable', message: 'no source root' },
        },
      }),
    );

    expect(build.statuses).toContainEqual(
      expect.objectContaining({
        ownerKey: empty,
        direction: 'incoming',
        state: 'empty',
        containerId: 'anchor_comments_create',
      }),
    );
    expect(build.statuses).toContainEqual(
      expect.objectContaining({
        ownerKey: failed,
        direction: 'outgoing',
        state: 'unavailable',
        message: 'no source root',
      }),
    );
  });

  it('places incoming cards left and outgoing cards right', () => {
    const incoming = relationOwnerKey('anchor_comments_create', 'incoming');
    const outgoing = relationOwnerKey('anchor_comments_create', 'outgoing');
    const base = baseScene();
    const build = mergeRelationScene(
      base,
      state({
        activeOwners: new Set([incoming, outgoing]),
        loads: {
          [incoming]: {
            status: 'ready',
            response: response('incoming', SERVICE, [{ id: CALLER, relation: 'calls' }]),
          },
          [outgoing]: {
            status: 'ready',
            response: response('outgoing', SERVICE, []),
          },
        },
      }),
    );
    const laidOut = layoutRelationCanvas(base, build, { width: 1440, height: 900 });
    const baseItem = laidOut.items[codeContainerKey('anchor_comments_create')]!;
    const incomingItem = laidOut.items[codeContainerKey(relationContainerId(CALLER))]!;
    const status = build.statuses.find((entry) => entry.ownerKey === outgoing)!;
    const statusItem = laidOut.items[relationStatusKey(status.id)]!;

    expect(incomingItem.x + incomingItem.width).toBeLessThanOrEqual(baseItem.x);
    expect(statusItem.x).toBeGreaterThanOrEqual(baseItem.x + baseItem.width);
  });
});
