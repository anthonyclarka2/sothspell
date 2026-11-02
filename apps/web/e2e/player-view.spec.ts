import { expect, test } from '@playwright/test';

const BEAT = '/t/tour_bunbun_golden/beat_purpose_01';

test('opens the canvas by default and keeps the stage explicit', async ({ page }) => {
  await page.goto(BEAT);

  await expect(page.getByTestId('canvas-view')).toBeVisible();
  await expect(page.locator('.stage')).toHaveCount(0);
  await expect(page).not.toHaveURL(/view=/);

  await page.getByRole('button', { name: 'Stage', exact: true }).click();
  await expect(page.locator('.stage')).toBeVisible();
  await expect(page.getByTestId('canvas-view')).toBeHidden();
  await expect(page).toHaveURL(/view=stage/);

  await page.reload();
  await expect(page.locator('.stage')).toBeVisible();
  await expect(page).toHaveURL(/view=stage/);

  await page.getByRole('button', { name: 'Canvas', exact: true }).click();
  await expect(page.getByTestId('canvas-view')).toBeVisible();
  await expect(page).toHaveURL(/view=canvas/);
});

test('treats an unknown view as the canvas default', async ({ page }) => {
  await page.goto(`${BEAT}?view=screen`);

  await expect(page.getByTestId('canvas-view')).toBeVisible();
  await expect(page.locator('.stage')).toHaveCount(0);
});

test('preserves the stage through code-page round trips', async ({ page }) => {
  await page.goto(`${BEAT}?view=stage`);
  await expect(page.locator('.stage')).toBeVisible();

  await page.getByRole('link', { name: 'Open code page' }).click();
  await expect(page).toHaveURL(/view=stage/);
  await expect(page.getByTestId('code-viewport')).toBeVisible();

  await page.getByRole('link', { name: /back to the beat/i }).click();
  await expect(page.locator('.stage')).toBeVisible();
  await expect(page).toHaveURL(/view=stage/);
});

test('preserves the canvas through code-page round trips', async ({ page }) => {
  await page.goto(BEAT);
  await expect(page.getByTestId('canvas-view')).toBeVisible();

  const container = page.getByTestId('canvas-code-container').first();
  await container.waitFor();
  await container.getByRole('link', { name: 'Open code page' }).click();
  await expect(page).toHaveURL(/view=canvas/);
  await expect(page.getByTestId('code-viewport')).toBeVisible();

  await page.getByRole('link', { name: /back to the beat/i }).click();
  await expect(page.getByTestId('canvas-view')).toBeVisible();
  await expect(page).toHaveURL(/view=canvas/);
});

test('carries the stage view into ask citations', async ({ page }) => {
  await page.route('**/api/tours/*/ask', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        answer: {
          markdown: 'The PDS is the source of truth.',
          citations: ['anchor_readme_overview'],
          followUps: [],
        },
        citations: [
          {
            id: 'anchor_readme_overview',
            label: 'What Bunbun is',
            path: 'README.md',
            startLine: 3,
            endLine: 3,
          },
        ],
        warnings: [],
        modelId: 'fixture/model',
      }),
    });
  });

  await page.goto(`${BEAT}?view=stage`);
  await page.getByRole('button', { name: 'Ask about this beat' }).click();
  await page.getByLabel('Your question').fill('What is the source of truth?');
  await page.getByRole('button', { name: 'Ask', exact: true }).click();

  await expect(page.getByText('The PDS is the source of truth.')).toBeVisible();
  const [popup] = await Promise.all([
    page.waitForEvent('popup'),
    page.getByRole('link', { name: 'What Bunbun is' }).click(),
  ]);
  await expect(popup).toHaveURL(/view=stage/);
  await popup.close();
});

test('keeps canvas, narration, and transport in flow at every width', async ({
  page,
}) => {
  for (const width of [1440, 1024, 768, 375]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(BEAT);
    await expect(page.getByTestId('canvas-view')).toBeVisible();

    const canvas = await page.getByTestId('canvas-view').boundingBox();
    const narration = await page.locator('.narration').boundingBox();
    const transport = await page.locator('.transport').boundingBox();
    expect(canvas, `canvas at ${width}`).not.toBeNull();
    expect(narration, `narration at ${width}`).not.toBeNull();
    expect(transport, `transport at ${width}`).not.toBeNull();
    expect(canvas!.y + canvas!.height).toBeLessThanOrEqual(narration!.y + 1);
    expect(narration!.y + narration!.height).toBeLessThanOrEqual(transport!.y + 1);
  }
});
