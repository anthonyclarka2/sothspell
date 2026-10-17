import { expect, test } from '@playwright/test';
import { installFakeReview } from './review-fake.js';

const NARRATION_ONE =
  'The fixture opens with the README overview. It names the project and gives the reader a first concrete place to stand, so the tour can build on a shared understanding before it looks at any code.';

test('starts a review and reads the outline, the beat, and the anchors', async ({
  page,
}) => {
  await installFakeReview(page);
  await page.goto('/review/tour_review_fixture');

  await expect(
    page.getByRole('heading', { name: 'Fixture review tour', level: 1 }),
  ).toBeVisible();
  await expect(page.getByRole('status')).toContainText('Review in review');
  await expect(page.getByRole('status')).toContainText('3/3 anchors verified');

  const outline = page.getByRole('navigation', { name: 'Tour outline' });
  await expect(outline.getByRole('button', { name: 'The overview' })).toHaveAttribute(
    'aria-current',
    'true',
  );
  await expect(outline.getByRole('button', { name: 'The glossary' })).toBeVisible();

  await expect(page.getByRole('heading', { name: 'The overview' })).toBeVisible();
  await expect(page.getByText(NARRATION_ONE)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Code anchors' })).toBeVisible();
  await expect(page.getByText('README.md:1-3')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Diagram' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Quality report' })).toBeVisible();
  await expect(page.getByText('3 anchors checked · 3 verified')).toBeVisible();
});

test('comments on the current beat and announces it', async ({ page }) => {
  const state = await installFakeReview(page);
  await page.goto('/review/tour_review_fixture');

  await page.getByLabel('Comment', { exact: true }).fill('This claim needs a source.');
  await page.getByRole('button', { name: 'Add comment' }).click();

  await expect(page.getByRole('status')).toContainText('Comment added to the review.');
  await expect(page.locator('.review-comment-body')).toHaveText(
    'This claim needs a source.',
  );
  await expect(page.locator('.review-comment-meta')).toContainText('The overview');
  expect(state.review.comments).toHaveLength(1);
  expect(state.review.comments[0]?.beatId).toBe('beat_one');

  // The outline marks the beat with its comment count.
  await expect(
    page
      .getByRole('navigation', { name: 'Tour outline' })
      .getByRole('button', { name: /The overview/ }),
  ).toContainText('1 comment');
});

test('edits a beat with inline validation and saves it', async ({ page }) => {
  const state = await installFakeReview(page);
  await page.goto('/review/tour_review_fixture');

  await page.getByRole('button', { name: 'Edit beat' }).click();
  await expect(page.getByRole('heading', { name: 'Edit this beat' })).toBeVisible();
  await expect(page.getByLabel('Title')).toBeFocused();

  // A duplicate title is refused before any request is made.
  await page.getByLabel('Title').fill('The entry point');
  await page.getByRole('button', { name: 'Save beat' }).click();
  await expect(
    page.getByText('Another beat in this chapter already uses this title.'),
  ).toBeVisible();
  expect(state.requests.filter((request) => request.method === 'PUT')).toEqual([]);

  // Too-short narration is refused too.
  await page.getByLabel('Title').fill('The overview, revised');
  await page.getByLabel('Narration').fill('Too short.');
  await page.getByRole('button', { name: 'Save beat' }).click();
  await expect(page.getByText('Narration needs at least 20 characters.')).toBeVisible();

  const revised = `${NARRATION_ONE} The revision tightens the claim and keeps the evidence.`;
  await page.getByLabel('Narration').fill(revised);
  await page.getByRole('button', { name: 'Save beat' }).click();

  await expect(page.getByRole('status')).toContainText('saved.');
  await expect(
    page.getByRole('heading', { name: 'The overview, revised' }),
  ).toBeVisible();
  await expect(page.getByText(revised)).toBeVisible();
  await expect(
    page
      .getByRole('navigation', { name: 'Tour outline' })
      .getByRole('button', { name: /The overview, revised/ }),
  ).toContainText('edited');
  expect(state.review.edits).toHaveLength(1);
});

test('regenerates a beat, shows the diff, and reverts it', async ({ page }) => {
  const state = await installFakeReview(page);
  await page.goto('/review/tour_review_fixture');

  await page.getByRole('button', { name: 'Regenerate beat' }).click();

  await expect(
    page.getByRole('heading', { name: 'Regenerated narration' }),
  ).toBeVisible();
  await expect(page.getByRole('status')).toContainText('regenerated');
  await expect(page.getByText('model fixture-model')).toBeVisible();
  await expect(page.locator('.review-diff-columns')).toContainText('Previous');
  await expect(page.locator('.review-diff-columns')).toContainText('Regenerated');
  await expect(page.locator('.diff-added').first()).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'The overview, regenerated' }),
  ).toBeVisible();
  expect(state.review.regenerations).toHaveLength(1);

  await page.getByRole('button', { name: 'Revert to the previous narration' }).click();

  await expect(page.getByRole('status')).toContainText('Regeneration reverted');
  await expect(page.getByRole('heading', { name: 'The overview' })).toBeVisible();
  await expect(page.locator('.review-narration')).toContainText(NARRATION_ONE);
  await expect(page.locator('.review-diff-head')).toContainText('reverted');
  expect(state.review.regenerations[0]?.revertedAt).not.toBeNull();
});

test('reports a missing model for regeneration', async ({ page }) => {
  await installFakeReview(page, { modelUnavailable: true });
  await page.goto('/review/tour_review_fixture');

  await page.getByRole('button', { name: 'Regenerate beat' }).click();

  await expect(page.getByRole('alert')).toContainText('no authoring model is configured');
  await expect(page.getByRole('status')).toContainText('Review in review');
});

test('approves the review and records the decision', async ({ page }) => {
  const state = await installFakeReview(page);
  await page.goto('/review/tour_review_fixture');

  await page.getByRole('button', { name: 'Approve review' }).click();

  await expect(page.getByRole('status')).toContainText('Review approved.');
  await expect(page.locator('.review-badge[data-state="approved"]')).toBeVisible();
  await expect(page.locator('.review-decision-list')).toContainText('approved');
  await expect(page.locator('.review-decision-list')).toContainText(
    '3 anchors verified at approval.',
  );
  expect(state.review.state).toBe('approved');
});

test('blocks approval when an anchor is stale, with the named reason', async ({
  page,
}) => {
  await installFakeReview(page, { staleAnchors: true });
  await page.goto('/review/tour_review_fixture');

  await expect(page.locator('.review-anchor-failures')).toContainText('anchor_readme');
  await expect(
    page.getByText('Approval will be blocked: 1 anchor did not verify.'),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Approve review' }).click();

  const alert = page.getByRole('alert').filter({ hasText: 'approval is blocked' });
  await expect(alert).toBeVisible();
  await expect(alert).toContainText('anchor_readme (mismatch');
  await expect(page.locator('.review-badge[data-state="approved"]')).toBeHidden();
});

test('requires a reason to reject and records it', async ({ page }) => {
  const state = await installFakeReview(page);
  await page.goto('/review/tour_review_fixture');

  await page.getByRole('button', { name: 'Reject review' }).click();
  await expect(page.getByRole('alert')).toContainText('A rejection needs a reason.');
  await expect(page.getByLabel('Rejection reason')).toBeFocused();

  await page
    .getByLabel('Rejection reason')
    .fill('The third beat claims behavior the excerpt does not show.');
  await page.getByRole('button', { name: 'Reject review' }).click();

  await expect(page.getByRole('status')).toContainText('Review rejected.');
  await expect(page.locator('.review-badge[data-state="rejected"]')).toBeVisible();
  await expect(page.locator('.review-decision-list')).toContainText(
    'The third beat claims behavior the excerpt does not show.',
  );
  expect(state.review.state).toBe('rejected');
});

test('keeps a wide diagram inside its column so the panel stays usable', async ({
  page,
}) => {
  await installFakeReview(page);
  await page.goto('/review/tour_review_fixture');

  const canvas = await page.locator('.review-diagram-canvas').boundingBox();
  const panel = await page.locator('.review-panel').boundingBox();
  expect(canvas).not.toBeNull();
  expect(panel).not.toBeNull();
  // The diagram must not overflow into the review panel: its React Flow pane
  // would intercept every click on the panel's controls.
  expect(canvas!.x + canvas!.width).toBeLessThanOrEqual(panel!.x + 1);

  await page.getByRole('button', { name: 'Add comment' }).click();
  await expect(page.getByRole('alert')).toContainText(
    'Write a comment before saving it.',
  );
});

test('supports the keyboard-only review path', async ({ page }) => {
  await installFakeReview(page);
  await page.goto('/review/tour_review_fixture');

  await expect(page.getByRole('heading', { name: 'The overview' })).toBeVisible();

  await page.keyboard.press('n');
  await expect(page.getByRole('heading', { name: 'The entry point' })).toBeVisible();
  await page.keyboard.press('p');
  await expect(page.getByRole('heading', { name: 'The overview' })).toBeVisible();

  await page.keyboard.press('e');
  await expect(page.getByRole('heading', { name: 'Edit this beat' })).toBeVisible();
  await expect(page.getByLabel('Title')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { name: 'The overview' })).toBeFocused();

  await page.keyboard.press('c');
  await expect(page.getByLabel('Comment', { exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { name: 'The overview' })).toBeFocused();

  await page.keyboard.press('a');
  await expect(page.getByRole('status')).toContainText('Review approved.');
});
