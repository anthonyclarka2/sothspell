import { describe, expect, it } from 'vitest';
import { layoutCanvas, viewportFor } from './layout.js';
import { buildCanvasScene } from './scene.js';
import { canvasTour, requestBeat } from './test-support.js';
import {
  codeContainerKey,
  diagramCardKey,
  type CanvasLayoutItem,
  type CanvasScene,
} from './types.js';

const DESKTOP = { width: 1440, height: 900 };
const LAPTOP = { width: 1024, height: 768 };

function fixtureScene(): CanvasScene {
  return buildCanvasScene(canvasTour(), requestBeat(), {
    openDiagramIds: ['diagram_map'],
  });
}

function overlaps(a: CanvasLayoutItem, b: CanvasLayoutItem): boolean {
  return (
    a.x < b.x + b.width &&
    b.x < a.x + a.width &&
    a.y < b.y + b.height &&
    b.y < a.y + a.height
  );
}

function expectNoOverlaps(
  scene: CanvasScene,
  items: Record<string, CanvasLayoutItem>,
): void {
  for (const diagram of scene.diagrams) {
    expect(items[diagramCardKey(diagram.id)]).toBeDefined();
  }
  for (const container of scene.containers) {
    expect(items[codeContainerKey(container.id)]).toBeDefined();
  }

  const all = Object.values(items);
  for (let index = 0; index < all.length; index += 1) {
    for (let other = index + 1; other < all.length; other += 1) {
      const first = all[index];
      const second = all[other];
      if (first && second) {
        expect(overlaps(first, second), `${first.id} overlaps ${second.id}`).toBe(false);
      }
    }
  }
}

describe('layoutCanvas desktop', () => {
  it('keys items by card key and places the home card at a stable origin', () => {
    const scene = fixtureScene();
    const layout = layoutCanvas(scene, DESKTOP);

    expect(Object.keys(layout.items).toSorted()).toEqual(
      [
        diagramCardKey('diagram_request'),
        diagramCardKey('diagram_map'),
        ...scene.containers.map((container) => codeContainerKey(container.id)),
      ].toSorted(),
    );

    const home = layout.items[diagramCardKey('diagram_request')];
    expect(home).toMatchObject({
      id: 'diagram:diagram_request',
      x: 0,
      y: 0,
      width: 432,
      height: 256,
    });
  });

  it('places code containers to the right in two columns and satellites below', () => {
    const scene = fixtureScene();
    const layout = layoutCanvas(scene, DESKTOP);
    const [server, app, store, extra] = scene.containers.map(
      (container) => layout.items[codeContainerKey(container.id)],
    );
    const home = layout.items[diagramCardKey('diagram_request')];
    const satellite = layout.items[diagramCardKey('diagram_map')];

    expect(server).toMatchObject({ x: 464, y: 0, width: 420, height: 220 });
    expect(app).toMatchObject({ x: 464, y: 244 });
    expect(store).toMatchObject({ x: 916, y: 0 });
    expect(extra).toMatchObject({ x: 916, y: 244 });
    expect(satellite).toMatchObject({ x: 0, y: 512, width: 392, height: 216 });

    expect(server?.x ?? 0).toBeGreaterThan((home?.x ?? 0) + (home?.width ?? 0));
    expect(satellite?.y ?? 0).toBeGreaterThan((home?.y ?? 0) + (home?.height ?? 0));
  });

  it('leaves no overlap and bounds every item', () => {
    const scene = fixtureScene();
    const layout = layoutCanvas(scene, DESKTOP);

    expectNoOverlaps(scene, layout.items);

    expect(layout.bounds).toEqual({ x: 0, y: 0, width: 1336, height: 728 });
    for (const item of Object.values(layout.items)) {
      expect(item.x).toBeGreaterThanOrEqual(layout.bounds.x);
      expect(item.y).toBeGreaterThanOrEqual(layout.bounds.y);
      expect(item.x + item.width).toBeLessThanOrEqual(
        layout.bounds.x + layout.bounds.width,
      );
      expect(item.y + item.height).toBeLessThanOrEqual(
        layout.bounds.y + layout.bounds.height,
      );
    }
  });

  it('is deterministic for the same scene and viewport', () => {
    const scene = fixtureScene();

    expect(layoutCanvas(scene, DESKTOP)).toEqual(layoutCanvas(scene, DESKTOP));
  });
});

describe('layoutCanvas narrower viewports', () => {
  it('uses one container column below the two-column threshold', () => {
    const scene = fixtureScene();
    const layout = layoutCanvas(scene, LAPTOP);
    const xs = scene.containers.map(
      (container) => layout.items[codeContainerKey(container.id)]?.x,
    );

    expect(new Set(xs).size).toBe(1);
    expect(xs[0]).toBe(464);
    expectNoOverlaps(scene, layout.items);
  });
});

describe('layoutCanvas edge cases', () => {
  it('returns empty items and zero bounds for an empty scene', () => {
    const layout = layoutCanvas(
      {
        tourId: 'tour_empty',
        beatId: 'beat_empty',
        chapterId: 'chapter_empty',
        homeDiagramId: null,
        diagrams: [],
        containers: [],
        hiddenContainerCount: 0,
        links: [],
      },
      DESKTOP,
    );

    expect(layout.items).toEqual({});
    expect(layout.bounds).toEqual({ x: 0, y: 0, width: 0, height: 0 });
  });

  it('places containers and satellites without a home card', () => {
    const scene = fixtureScene();
    const withoutHome: CanvasScene = {
      ...scene,
      homeDiagramId: null,
      diagrams: scene.diagrams.map((diagram) => ({ ...diagram, home: false })),
    };

    const layout = layoutCanvas(withoutHome, DESKTOP);
    const firstContainer = layout.items[codeContainerKey('anchor_server')];
    const requestCard = layout.items[diagramCardKey('diagram_request')];
    const mapCard = layout.items[diagramCardKey('diagram_map')];

    expect(firstContainer?.x).toBe(0);
    expect(requestCard).toMatchObject({ x: 0, y: 512 });
    expect(mapCard).toMatchObject({ x: 464, y: 512 });
    expectNoOverlaps(withoutHome, layout.items);
    for (const item of Object.values(layout.items)) {
      expect(item.x).toBeGreaterThanOrEqual(0);
      expect(item.y).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('viewportFor', () => {
  it('fits bounds that exactly fill the viewport at zoom 1', () => {
    expect(
      viewportFor(
        { x: 0, y: 0, width: 1000, height: 500 },
        { width: 1000, height: 500 },
        0,
      ),
    ).toEqual({ x: 0, y: 0, zoom: 1 });
  });

  it('centers small bounds and clamps zoom to 1.4', () => {
    const viewport = viewportFor(
      { x: 0, y: 0, width: 100, height: 100 },
      { width: 1000, height: 500 },
      0,
    );

    expect(viewport.zoom).toBe(1.4);
    expect(viewport.x).toBe(430);
    expect(viewport.y).toBe(180);
  });

  it('centers large bounds and clamps zoom to 0.25', () => {
    const viewport = viewportFor(
      { x: 0, y: 0, width: 10000, height: 10000 },
      { width: 1000, height: 500 },
      0,
    );

    expect(viewport).toEqual({ x: -750, y: -1000, zoom: 0.25 });
  });

  it('centers bounds that are not at the origin', () => {
    const viewport = viewportFor(
      { x: 200, y: 100, width: 400, height: 200 },
      { width: 1000, height: 800 },
      48,
    );

    expect(viewport.zoom).toBe(1.4);
    expect(viewport.x).toBe(-60);
    expect(viewport.y).toBe(120);
  });

  it('applies the default padding of 48 on every side', () => {
    const viewport = viewportFor(
      { x: 0, y: 0, width: 1000, height: 1000 },
      { width: 1096, height: 1096 },
    );

    expect(viewport.zoom).toBe(1);
    expect(viewport.x).toBe(48);
    expect(viewport.y).toBe(48);
  });

  it('keeps degenerate bounds centered at zoom 1', () => {
    expect(
      viewportFor({ x: 40, y: 30, width: 0, height: 0 }, { width: 800, height: 600 }, 0),
    ).toEqual({ x: 360, y: 270, zoom: 1 });
  });
});
