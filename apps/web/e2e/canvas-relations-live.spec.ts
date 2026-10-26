import { expect, test } from '@playwright/test';
import { bunbunAvailable } from './bunbun-root.js';

/**
 * Live Bunbun acceptance for Phase 18. This spec deliberately uses the real
 * relation route, the real project record fallback, and the real snapshot
 * analysis. It is slower than the fake route specs and is the only place that
 * proves the web contract against the server.
 */
test('opens real CommentsService callers and callees from the canvas', async ({
  page,
}) => {
  test.skip(!bunbunAvailable, 'the read-only Bunbun checkout is absent');
  await page.goto('/t/tour_bunbun_golden/beat_write_02?view=canvas');

  const service = page.locator(
    '[data-testid="canvas-code-container"][data-container-id="anchor_comments_create"]',
  );
  await expect(service).toBeVisible();

  await service.getByRole('button', { name: 'Incoming', exact: true }).click();
  await expect(
    page
      .getByTestId('canvas-code-container')
      .filter({ hasText: 'CommentsController.create' }),
  ).toBeVisible();
  await expect(page.getByTestId('canvas-flow-edge').first()).toBeVisible();
  await expect(page.getByTestId('canvas-flow-edge').first()).toHaveAttribute(
    'data-relation-kind',
    'calls',
  );

  await service.getByRole('button', { name: 'Outgoing', exact: true }).click();
  await expect(
    page
      .getByTestId('canvas-code-container')
      .filter({ hasText: 'CommentsService.parseText' }),
  ).toBeVisible();

  // The project root is local and must not leak into the page.
  await expect(page.locator('body')).not.toContainText(
    '/Users/ajc/Projects/codegens/bunbun',
  );
});
