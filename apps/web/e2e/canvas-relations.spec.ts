import { expect, test, type Page } from '@playwright/test';
import {
  CANVAS_SYMBOLS,
  behaviorKey,
  installCanvasSymbolTargets,
  installFakeCanvasRelations,
} from './canvas-relations-fake.js';

async function openWriteContainer(page: Page) {
  await page.goto('/t/tour_bunbun_golden/beat_write_02?view=canvas');
  await page.getByTestId('canvas-object').filter({ hasText: 'CommentsService' }).click();
  const source = page.locator('[data-container-id="anchor_comments_create"]');
  await expect(source).toBeVisible();
  return source;
}

function relationContainer(page: Page, symbolId: string) {
  return page.locator(
    `[data-testid="canvas-code-container"][data-symbol-id="${symbolId}"]`,
  );
}

test('opens a definition from a symbol-only diagram object', async ({ page }) => {
  installCanvasSymbolTargets(page, {
    nodes: {
      node_index: { symbolId: CANVAS_SYMBOLS.pds, anchorId: null },
    },
  });
  const fake = installFakeCanvasRelations(page);

  await page.goto('/t/tour_bunbun_golden/beat_purpose_01?view=canvas');
  await page.getByTestId('canvas-object').filter({ hasText: 'Local index' }).click();

  const definition = relationContainer(page, CANVAS_SYMBOLS.pds);
  await expect(definition).toBeVisible();
  await expect(definition).toContainText('ATProtoPDS');
  await expect(definition).toContainText('README.md');
  expect(fake.requests.map((request) => request.direction)).toEqual(['definition']);
});

test('keeps the beat anchor when a diagram object has both targets', async ({ page }) => {
  installCanvasSymbolTargets(page, {
    nodes: {
      node_pds: { symbolId: CANVAS_SYMBOLS.pds, anchorId: 'anchor_readme_overview' },
    },
  });
  const fake = installFakeCanvasRelations(page);

  await page.goto('/t/tour_bunbun_golden/beat_purpose_01?view=canvas');
  await page.getByTestId('canvas-object').filter({ hasText: 'ATProto PDS' }).click();

  await expect(
    page.locator('[data-container-id="anchor_readme_overview"]'),
  ).toBeVisible();
  expect(fake.requests).toEqual([]);
});

test('selects a diagram object with no anchor or symbol target', async ({ page }) => {
  await page.goto('/t/tour_bunbun_golden/beat_purpose_01?view=canvas');
  const web = page.locator('[data-object-id="node_web"]');
  await expect(web).toBeEnabled();
  await web.click();
  await expect(web).toHaveAttribute('aria-current', 'true');
  await expect(web.locator('..')).toHaveAttribute('data-target', 'none');
  await expect(web).toHaveAttribute(
    'aria-describedby',
    'canvas-object-hint-diagram_sources-node_web',
  );
});

test('opens incoming left and outgoing right with labelled call edges', async ({
  page,
}) => {
  installCanvasSymbolTargets(page, {
    anchors: { anchor_comments_create: CANVAS_SYMBOLS.service },
  });
  installFakeCanvasRelations(page);

  const source = await openWriteContainer(page);
  await source.getByRole('button', { name: 'Incoming', exact: true }).click();

  const caller = relationContainer(page, CANVAS_SYMBOLS.caller);
  await expect(caller).toBeVisible();
  await expect(caller).toContainText('CommentsController.create');
  await expect(
    page.locator('[data-testid="canvas-flow-edge"][data-relation-kind="calls"]'),
  ).not.toHaveCount(0);
  await expect(
    page.getByTestId('canvas-flow-edge-label').filter({ hasText: 'calls' }).first(),
  ).toBeVisible();

  const sourceBox = await source.boundingBox();
  const callerBox = await caller.boundingBox();
  expect(sourceBox).not.toBeNull();
  expect(callerBox).not.toBeNull();
  expect(callerBox!.x + callerBox!.width).toBeLessThanOrEqual(sourceBox!.x);

  await source.getByRole('button', { name: 'Outgoing', exact: true }).click();
  const persist = relationContainer(page, CANVAS_SYMBOLS.persist);
  await expect(persist).toBeVisible();
  const outgoingBox = await persist.boundingBox();
  expect(outgoingBox).not.toBeNull();
  expect(outgoingBox!.x).toBeGreaterThanOrEqual(sourceBox!.x + sourceBox!.width);

  const references = page.locator(
    '[data-testid="canvas-flow-edge"][data-relation-kind="references"]',
  );
  await expect(references).not.toHaveCount(0);
  await expect(
    page.getByTestId('canvas-flow-edge-label').filter({ hasText: 'references' }).first(),
  ).toBeVisible();
  const dash = await references
    .first()
    .locator('path')
    .first()
    .evaluate((path) => {
      const style = getComputedStyle(path);
      return { dash: style.strokeDasharray, width: style.strokeWidth };
    });
  expect(['4px', '6px']).toContain(dash.width);
  expect(dash.dash).not.toBe('none');
});

test('shows a loading card while a relation request is in flight', async ({ page }) => {
  installCanvasSymbolTargets(page, {
    anchors: { anchor_comments_create: CANVAS_SYMBOLS.service },
  });
  installFakeCanvasRelations(page, { delayMs: 500 });

  const source = await openWriteContainer(page);
  await source.getByRole('button', { name: 'Incoming', exact: true }).click();

  const status = page.getByTestId('canvas-relation-status');
  await expect(status).toHaveAttribute('data-state', 'loading');
  await expect(status).toContainText('Loading incoming calls');
  await expect(relationContainer(page, CANVAS_SYMBOLS.caller)).toBeVisible();
  await expect(
    page.locator('[data-testid="canvas-relation-status"][data-state="loading"]'),
  ).toHaveCount(0);
});

test('keeps a manually opened container when its owning toggle closes', async ({
  page,
}) => {
  installCanvasSymbolTargets(page, {
    anchors: { anchor_comments_create: CANVAS_SYMBOLS.service },
  });
  installFakeCanvasRelations(page);

  const source = await openWriteContainer(page);
  const incoming = source.getByRole('button', { name: 'Incoming', exact: true });
  await incoming.click();

  const caller = relationContainer(page, CANVAS_SYMBOLS.caller);
  await expect(caller).toBeVisible();
  // The container header is the definition link for its own symbol.
  await caller
    .getByRole('button', { name: 'Open definition of CommentsController.create' })
    .click();

  await incoming.click();
  await expect(caller).toBeVisible();
});

test('turning one toggle off keeps a container another toggle still owns', async ({
  page,
}) => {
  installCanvasSymbolTargets(page, {
    anchors: { anchor_comments_create: CANVAS_SYMBOLS.service },
  });
  installFakeCanvasRelations(page);

  const source = await openWriteContainer(page);
  await source.getByRole('button', { name: 'Incoming', exact: true }).click();
  await expect(relationContainer(page, CANVAS_SYMBOLS.caller)).toBeVisible();
  await expect(relationContainer(page, CANVAS_SYMBOLS.shared)).toBeVisible();

  await source.getByRole('button', { name: 'Outgoing', exact: true }).click();
  await expect(relationContainer(page, CANVAS_SYMBOLS.persist)).toBeVisible();
  await expect(relationContainer(page, CANVAS_SYMBOLS.shared)).toHaveCount(1);

  await source.getByRole('button', { name: 'Incoming', exact: true }).click();
  await expect(relationContainer(page, CANVAS_SYMBOLS.caller)).toHaveCount(0);
  await expect(relationContainer(page, CANVAS_SYMBOLS.shared)).toBeVisible();

  await source.getByRole('button', { name: 'Outgoing', exact: true }).click();
  await expect(relationContainer(page, CANVAS_SYMBOLS.shared)).toHaveCount(0);
  await expect(relationContainer(page, CANVAS_SYMBOLS.persist)).toHaveCount(0);
});

test('reuses cached relation containers when a toggle comes back on', async ({
  page,
}) => {
  installCanvasSymbolTargets(page, {
    anchors: { anchor_comments_create: CANVAS_SYMBOLS.service },
  });
  const fake = installFakeCanvasRelations(page);

  const source = await openWriteContainer(page);
  const incoming = source.getByRole('button', { name: 'Incoming', exact: true });
  await incoming.click();
  await expect(relationContainer(page, CANVAS_SYMBOLS.caller)).toBeVisible();
  await incoming.click();
  await expect(relationContainer(page, CANVAS_SYMBOLS.caller)).toHaveCount(0);
  await incoming.click();
  await expect(relationContainer(page, CANVAS_SYMBOLS.caller)).toBeVisible();

  expect(
    fake.requests.filter((request) => request.direction === 'incoming'),
  ).toHaveLength(1);
});

test('does not cascade into outgoing requests when incoming opens', async ({ page }) => {
  installCanvasSymbolTargets(page, {
    anchors: { anchor_comments_create: CANVAS_SYMBOLS.service },
  });
  const fake = installFakeCanvasRelations(page);

  const source = await openWriteContainer(page);
  await source.getByRole('button', { name: 'Incoming', exact: true }).click();
  await expect(relationContainer(page, CANVAS_SYMBOLS.caller)).toBeVisible();

  expect(
    fake.requests.filter((request) => request.direction === 'outgoing'),
  ).toHaveLength(0);
});

test('bridges a shared symbol across two open diagrams', async ({ page }) => {
  installCanvasSymbolTargets(page, {
    nodes: {
      node_api: { symbolId: CANVAS_SYMBOLS.bootstrap, anchorId: null },
      node_apps_api: { symbolId: CANVAS_SYMBOLS.bootstrap, anchorId: null },
    },
  });
  const fake = installFakeCanvasRelations(page);

  await page.goto('/t/tour_bunbun_golden/beat_purpose_01?view=canvas');
  await page.getByRole('button', { name: 'Add Repository map' }).click();
  await expect(page.getByTestId('canvas-diagram-card')).toHaveCount(2);

  const api = page.locator('[data-object-id="node_api"]');
  const repository = page.locator('[data-object-id="node_apps_api"]');
  await expect(api.locator('..')).toHaveAttribute('data-bridge', 'true');
  await expect(repository.locator('..')).toHaveAttribute('data-bridge', 'true');
  await expect(page.getByTestId('canvas-object-bridge')).toHaveCount(2);

  // Adding a diagram centres it, so return home before the first object and
  // then focus the satellite before the second one.
  await page.getByRole('button', { name: 'Home diagram' }).click();
  await api.click();
  const definition = relationContainer(page, CANVAS_SYMBOLS.bootstrap);
  await expect(definition).toBeVisible();

  await page.getByRole('button', { name: 'Focus Repository map' }).click();
  await repository.click();
  await expect(definition).toHaveCount(1);
  expect(
    fake.requests.filter((request) => request.direction === 'definition'),
  ).toHaveLength(1);
});

test('shows an unavailable relation state without breaking the container', async ({
  page,
}) => {
  installCanvasSymbolTargets(page, {
    anchors: { anchor_comments_create: CANVAS_SYMBOLS.service },
  });
  installFakeCanvasRelations(page, {
    behaviors: {
      [behaviorKey(CANVAS_SYMBOLS.service, 'incoming')]: 'unavailable',
    },
  });

  const source = await openWriteContainer(page);
  await source.getByRole('button', { name: 'Incoming', exact: true }).click();

  const status = page.getByTestId('canvas-relation-status');
  await expect(status).toHaveAttribute('data-state', 'unavailable');
  await expect(status).toHaveAttribute('data-direction', 'incoming');
  await expect(status).toContainText('Relations are unavailable.');
  await expect(status).toContainText('relations need a project source root');
  await expect(source).toBeVisible();
});

test('shows the direction-specific empty states', async ({ page }) => {
  installCanvasSymbolTargets(page, {
    anchors: { anchor_comments_create: CANVAS_SYMBOLS.service },
  });
  installFakeCanvasRelations(page, {
    behaviors: {
      [behaviorKey(CANVAS_SYMBOLS.service, 'incoming')]: 'empty',
      [behaviorKey(CANVAS_SYMBOLS.service, 'outgoing')]: 'empty',
    },
  });

  const source = await openWriteContainer(page);
  await source.getByRole('button', { name: 'Incoming', exact: true }).click();
  await expect(
    page.getByTestId('canvas-relation-status').filter({
      hasText: 'No incoming calls found',
    }),
  ).toBeVisible();

  await source.getByRole('button', { name: 'Outgoing', exact: true }).click();
  await expect(
    page.getByTestId('canvas-relation-status').filter({
      hasText: 'No outgoing calls found',
    }),
  ).toBeVisible();
});

test('retries an inline relation error', async ({ page }) => {
  installCanvasSymbolTargets(page, {
    anchors: { anchor_comments_create: CANVAS_SYMBOLS.service },
  });
  const behaviors = {
    [behaviorKey(CANVAS_SYMBOLS.service, 'incoming')]: 'error' as const,
  };
  installFakeCanvasRelations(page, { behaviors });

  const source = await openWriteContainer(page);
  await source.getByRole('button', { name: 'Incoming', exact: true }).click();

  const status = page.getByTestId('canvas-relation-status');
  await expect(status).toHaveAttribute('data-state', 'error');
  await expect(status).toContainText('Relations could not load.');

  behaviors[behaviorKey(CANVAS_SYMBOLS.service, 'incoming')] = 'ok';
  await status.getByRole('button', { name: 'Retry' }).click();
  await expect(relationContainer(page, CANVAS_SYMBOLS.caller)).toBeVisible();
  await expect(
    page.locator('[data-testid="canvas-relation-status"][data-state="error"]'),
  ).toHaveCount(0);
});

test('shows the relation legend with static confidence', async ({ page }) => {
  await page.goto('/t/tour_bunbun_golden/beat_purpose_01?view=canvas');
  const legend = page.getByTestId('canvas-relation-legend');
  await expect(legend).toBeVisible();
  for (const label of ['Evidence', 'Calls', 'References', 'Imports']) {
    await expect(legend.getByText(label, { exact: true })).toBeVisible();
  }
  await expect(legend).toContainText('Static confidence');
});

test('exposes relation toggles in the outline', async ({ page }) => {
  installCanvasSymbolTargets(page, {
    anchors: { anchor_comments_create: CANVAS_SYMBOLS.service },
  });
  installFakeCanvasRelations(page);

  await openWriteContainer(page);
  await page.getByRole('button', { name: 'Show outline' }).click();
  const outline = page.getByTestId('canvas-outline');
  await outline.getByRole('button', { name: 'Incoming', exact: true }).click();

  await expect(relationContainer(page, CANVAS_SYMBOLS.caller)).toBeVisible();
  await expect(outline).toContainText('CommentsController.create');
});
