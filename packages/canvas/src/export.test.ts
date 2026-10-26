import { describe, expect, it } from 'vitest';
import { buildExportModel } from './export.js';
import { buildCanvasScene } from './scene.js';
import { anchor, canvasTour, requestBeat } from './test-support.js';
import type { CanvasCodeContainer, CanvasFlowLink, CanvasScene } from './types.js';

function fixtureScene() {
  return buildCanvasScene(canvasTour(), requestBeat(), {
    openDiagramIds: ['diagram_map'],
  });
}

function withRelation(scene: CanvasScene): {
  scene: CanvasScene;
  relationContainerId: string;
} {
  const relationContainer: CanvasCodeContainer = {
    id: 'relation:symbol:apps/api/src/comments/caller.ts#call',
    anchorId: 'symbol:apps/api/src/comments/caller.ts#call',
    symbolId: 'symbol:apps/api/src/comments/caller.ts#call',
    label: 'CommentsController.create',
    path: 'apps/api/src/comments/caller.ts',
    startLine: 12,
    endLine: 18,
    language: 'typescript',
    excerpt: 'await this.service.create(input);',
    html: '<pre class="shiki"><code>await this.service.create(input);</code></pre>',
    collapsed: true,
  };
  const flow: CanvasFlowLink = {
    kind: 'flow',
    id: 'flow:call',
    fromContainerId: relationContainer.id,
    toContainerId: 'anchor_server',
    relation: 'calls',
    confidence: 'syntax',
  };
  return {
    relationContainerId: relationContainer.id,
    scene: {
      ...scene,
      containers: [...scene.containers, relationContainer],
      links: [...scene.links, flow],
    },
  };
}

describe('buildExportModel file names', () => {
  it('names image exports from the project, beat, scope, and format', () => {
    const scene = fixtureScene();

    expect(buildExportModel(scene, { scope: 'view', format: 'png' }).fileName).toBe(
      'sothspell-fixture-beat-request-view.png',
    );
    expect(buildExportModel(scene, { scope: 'board', format: 'png' }).fileName).toBe(
      'sothspell-fixture-beat-request-board.png',
    );
    expect(buildExportModel(scene, { scope: 'view', format: 'jpg' }).fileName).toBe(
      'sothspell-fixture-beat-request-view.jpg',
    );
    expect(buildExportModel(scene, { scope: 'board', format: 'jpg' }).fileName).toBe(
      'sothspell-fixture-beat-request-board.jpg',
    );
  });

  it('always names the print export print.pdf, whatever scope the menu sends', () => {
    const scene = fixtureScene();

    const print = buildExportModel(scene, { scope: 'view', format: 'pdf' });

    expect(print.fileName).toBe('sothspell-fixture-beat-request-print.pdf');
    expect(print.kind).toBe('print');
    expect(print.scope).toBe('board');
  });

  it('sanitizes unsafe ids instead of trusting them in a download name', () => {
    const scene: CanvasScene = {
      ...fixtureScene(),
      tourId: 'tour/../../etc',
      beatId: 'Beat Request: 01?',
      metadata: {
        tourTitle: 'Unsafe',
        projectSlug: 'Fixture Project/../',
        projectName: 'Fixture',
        revision: '9fef24d',
        revisionDirty: false,
        locale: 'en',
        chapterTitle: 'Chapter',
        beatTitle: 'Beat',
      },
    };

    const model = buildExportModel(scene, { scope: 'view', format: 'png' });

    expect(model.fileName).toBe('sothspell-fixture-project-beat-request-01-view.png');
    expect(model.fileName).not.toContain('..');
    expect(model.fileName).not.toContain('/');
  });
});

describe('buildExportModel bounds', () => {
  it('uses the visible scene rectangle for a view export', () => {
    const model = buildExportModel(fixtureScene(), {
      scope: 'view',
      format: 'png',
      viewport: { x: -232, y: -100, width: 720, height: 450, zoom: 0.5 },
    });

    expect(model.bounds).toEqual({ x: 464, y: 200, width: 1440, height: 900 });
  });

  it('uses every laid-out card for a whole-board export', () => {
    const scene = fixtureScene();
    const board = buildExportModel(scene, { scope: 'board', format: 'png' });
    const view = buildExportModel(scene, {
      scope: 'view',
      format: 'png',
      viewport: { x: 0, y: 0, width: 720, height: 450, zoom: 1 },
    });

    expect(board.bounds).toEqual({ x: 0, y: 0, width: 1336, height: 728 });
    expect(board.bounds.width).toBeGreaterThan(view.bounds.width);
    expect(board.bounds.height).toBeGreaterThan(view.bounds.height);
    expect(board.containers.map((container) => container.id)).toEqual(
      scene.containers.map((container) => container.id),
    );
  });

  it('falls back to the board bounds when no live viewport is supplied', () => {
    const scene = fixtureScene();
    const board = buildExportModel(scene, { scope: 'board', format: 'png' });
    const view = buildExportModel(scene, { scope: 'view', format: 'png' });

    expect(view.bounds).toEqual(board.bounds);
  });

  it('describes the capture scale and cap the browser adapter must apply', () => {
    const model = buildExportModel(fixtureScene(), {
      scope: 'board',
      format: 'jpg',
    });

    expect(model.kind).toBe('image');
    expect(model.mimeType).toBe('image/jpeg');
    expect(model.scale).toBe(2);
    expect(model.maxDimension).toBe(8192);
    expect(model.print).toBeNull();
  });
});

describe('buildExportModel reading order and relations', () => {
  it('keeps scene order and marks API relation containers as bounded excerpts', () => {
    const relation = withRelation(fixtureScene());
    const model = buildExportModel(relation.scene, {
      scope: 'board',
      format: 'pdf',
      relationContainerIds: [relation.relationContainerId],
    });

    expect(model.containers.map((container) => container.id)).toEqual(
      relation.scene.containers.map((container) => container.id),
    );
    expect(
      model.containers.find((container) => container.id === relation.relationContainerId),
    ).toMatchObject({
      source: 'relation',
      label: 'CommentsController.create',
      excerpt: 'await this.service.create(input);',
    });
    expect(
      model.containers.find((container) => container.id === 'anchor_server'),
    ).toMatchObject({ source: 'anchor' });
  });

  it('labels both ends of a flow link with its kind and confidence', () => {
    const relation = withRelation(fixtureScene());
    const model = buildExportModel(relation.scene, {
      scope: 'board',
      format: 'pdf',
      relationContainerIds: [relation.relationContainerId],
    });

    const caller = model.containers.find(
      (container) => container.id === relation.relationContainerId,
    );
    const server = model.containers.find((container) => container.id === 'anchor_server');

    expect(caller?.relations).toEqual([
      {
        id: 'flow:call',
        relation: 'calls',
        confidence: 'syntax',
        direction: 'outgoing',
        counterpartId: 'anchor_server',
        counterpartLabel: 'Server bootstrap',
      },
    ]);
    expect(server?.relations).toEqual([
      {
        id: 'flow:call',
        relation: 'calls',
        confidence: 'syntax',
        direction: 'incoming',
        counterpartId: relation.relationContainerId,
        counterpartLabel: 'CommentsController.create',
      },
    ]);
  });
});

describe('buildExportModel print sections', () => {
  it('puts the home diagram first, then every container with its full anchor HTML', () => {
    const lines = Array.from(
      { length: 31 },
      (_, index) => `const line${index + 1} = ${index + 1};`,
    );
    const excerpt = lines.join('\n');
    const html = `<pre class="shiki"><code>${lines
      .map((line, index) => `<span class="line" data-line="${index + 1}">${line}</span>`)
      .join('\n')}</code></pre>`;
    const longAnchor = anchor('anchor_long', {
      path: 'src/main.ts',
      label: 'main bootstrap',
      startLine: 1,
      endLine: 31,
      excerpt,
      html,
    });
    const longBeat = {
      ...requestBeat(),
      id: 'beat_long',
      anchors: [longAnchor],
      stage: { ...requestBeat().stage, anchorIds: ['anchor_long'] },
    };
    const baseTour = canvasTour();
    const longTour = {
      ...baseTour,
      chapters: baseTour.chapters.map((chapter) =>
        chapter.id === 'chapter_request' ? { ...chapter, beats: [longBeat] } : chapter,
      ),
    };
    const scene = buildCanvasScene(longTour, longBeat);

    const model = buildExportModel(scene, {
      scope: 'board',
      format: 'pdf',
      exportedAt: '2026-10-21T12:00:00.000Z',
    });

    expect(model.kind).toBe('print');
    expect(model.print).not.toBeNull();
    const sections = model.print?.sections ?? [];
    expect(sections[0]?.kind).toBe('diagram');
    expect(sections.filter((section) => section.kind === 'container')).toHaveLength(1);

    const container = model.containers[0];
    expect(container).toMatchObject({
      id: 'anchor_long',
      source: 'anchor',
      lineCount: 31,
    });
    expect(container?.html).toContain('data-line="31"');
    expect(model.print?.sections[1]).toMatchObject({
      kind: 'container',
      container: { html: container?.html },
    });
    expect(model.print?.title).toMatchObject({
      projectSlug: 'fixture',
      projectName: 'Fixture',
      revision: '9fef24d',
      beatTitle: 'The request reaches the server',
      chapterTitle: 'chapter_request',
      exportedAt: '2026-10-21T12:00:00.000Z',
    });
  });

  it('summarizes every open flow link as printable relation text', () => {
    const relation = withRelation(fixtureScene());
    const model = buildExportModel(relation.scene, {
      scope: 'board',
      format: 'pdf',
      relationContainerIds: [relation.relationContainerId],
    });

    expect(model.print?.relations).toEqual([
      {
        id: 'flow:call',
        relation: 'calls',
        confidence: 'syntax',
        fromId: relation.relationContainerId,
        fromLabel: 'CommentsController.create',
        toId: 'anchor_server',
        toLabel: 'Server bootstrap',
      },
    ]);
    expect(model.print?.sections.at(-1)).toEqual({
      kind: 'relations',
      relations: model.print?.relations,
    });
  });

  it('records UI hidden from an image capture', () => {
    const model = buildExportModel(fixtureScene(), {
      scope: 'view',
      format: 'png',
    });

    expect(model.hiddenSelectors).toEqual(
      expect.arrayContaining([
        '.canvas-controls',
        '.canvas-tray',
        '.canvas-outline',
        '.canvas-notice',
        '.canvas-relation-legend',
        '.canvas-display',
        '.canvas-fullscreen-hint',
      ]),
    );
  });
});
