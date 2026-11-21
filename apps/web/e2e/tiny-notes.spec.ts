import { expect, test, type Locator, type Page } from '@playwright/test';

const openingURL = '/t/tour_tiny_notes_golden/beat_tiny_entry_01';
const openingHeading = 'Two entry points, one service';
const cliAnchor = '[data-container-id="anchor_tiny_cli_main"]';

async function activateWithTab(page: Page, target: Locator): Promise<void> {
  for (let tab = 0; tab < 60; tab += 1) {
    if (await target.evaluate((element) => element === document.activeElement)) {
      await page.keyboard.press('Enter');
      return;
    }
    await page.keyboard.press('Tab');
  }
  await expect(target).toBeFocused();
}

test('traces the demo from home through a live call to the cited code', async ({
  page,
}) => {
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Tiny Notes: from input to JSON' }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Play the demo' }).click();
  await expect(page).toHaveURL(new RegExp(openingURL));
  await expect(page.getByRole('heading', { name: openingHeading })).toBeVisible();
  await expect(page.locator('.react-flow')).toBeVisible();
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Pause', exact: true }).click();

  const main = page.getByTestId('canvas-code-container').and(page.locator(cliAnchor));
  await main.getByRole('button', { name: 'Outgoing', exact: true }).click();
  const openNotes = page
    .getByTestId('canvas-code-container')
    .and(page.locator('[data-symbol-id="symbol:src/index.ts#openNotes"]'));
  await expect(openNotes).toContainText('createNoteService');
  await expect(
    page
      .getByTestId('canvas-flow-edge')
      .and(page.locator('[data-relation-kind="calls"][data-confidence="import"]')),
  ).toBeVisible();

  await main.getByRole('link', { name: 'Open code page' }).click();
  await expect(page.getByRole('heading', { name: 'CLI main' })).toBeVisible();
  await expect(page.getByTestId('code-viewport')).toBeVisible();
  const citedLine = page.locator('.code-line[data-line="125"]');
  await expect(citedLine).toHaveClass(/code-line--focus/);
  await expect(citedLine).toContainText('openNotes({ filePath })');
  await expect(page.getByText('Matches the pinned snapshot')).toBeVisible();
  await page.getByRole('link', { name: /back to the beat/i }).click();
  await expect(page).toHaveURL(new RegExp(openingURL));
  await expect(page.getByRole('heading', { name: openingHeading })).toBeVisible();

  await page.getByRole('button', { name: 'Show outline' }).click();
  const outline = page.getByTestId('canvas-outline');
  await expect(outline).toContainText('CLI main');
  await expect(outline).toContainText('openNotes');
  await expect(
    outline
      .getByRole('link', { name: 'Open code page' })
      .and(page.locator('a[href*="anchor=anchor_tiny_cli_main"]')),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Stage', exact: true }).click();
  await expect(page.locator('.stage')).toBeVisible();
  await expect(page.getByRole('heading', { name: openingHeading })).toBeVisible();
  await expect(page).toHaveURL(/view=stage/);

  for (let beat = 0; beat < 3; beat += 1) {
    await page.getByRole('button', { name: 'Next beat', exact: true }).click();
  }
  await expect(
    page.getByRole('heading', { name: 'Replace the JSON file' }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Open code page' }).click();
  const persistLine = page.locator('.code-line[data-line="40"]');
  await expect(persistLine).toHaveClass(/code-line--focus/);
  await expect(persistLine).toContainText('rename(temporary, filePath)');
  await page.getByRole('link', { name: /back to the beat/i }).click();
  await expect(page).toHaveURL(/beat_tiny_persist_02\?view=stage/);
});

test('follows the pinned call with a keyboard on the compact canvas', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 900 });
  await page.goto(openingURL);
  const compact = page.getByTestId('canvas-compact');
  const main = compact.getByTestId('canvas-code-container').and(page.locator(cliAnchor));
  await expect(main).toBeVisible();
  await activateWithTab(
    page,
    main.getByRole('button', { name: 'Outgoing', exact: true }),
  );
  await expect(compact).toContainText('openNotes');
  await expect(compact).toContainText('calls');

  await activateWithTab(page, main.getByRole('link', { name: 'Open code page' }));
  await expect(page.getByRole('heading', { name: 'CLI main' })).toBeVisible();
  await activateWithTab(page, page.getByRole('link', { name: /back to the beat/i }));
  await expect(compact).toBeVisible();
  await expect(page).toHaveURL(new RegExp(openingURL));
});

test('opens the bundled demo in Spanish and Arabic', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Language').selectOption('es');
  await expect(
    page.getByRole('heading', { name: 'Tiny Notes: de la entrada a JSON' }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Reproducir la demostración' }),
  ).toBeVisible();

  await page.getByLabel('Idioma').selectOption('ar');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(
    page.getByRole('heading', { name: 'Tiny Notes: من الإدخال إلى JSON' }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'شغّل الجولة التجريبية' }).click();
  await expect(page).toHaveURL(new RegExp(openingURL));
  await expect(
    page.getByRole('heading', { name: 'واجهتا إدخال وخدمة واحدة' }),
  ).toBeVisible();
});

test('traces the demo relationship and pinned line in Reading view', async ({ page }) => {
  await page.goto(openingURL);
  await page.getByRole('button', { name: 'Reading view' }).click();
  const reading = page.getByTestId('canvas-compact');
  await expect(reading.getByText(/CLI main calls openNotes/)).toBeVisible();
  await reading.locator(cliAnchor).getByRole('link', { name: 'Open code page' }).click();
  const source = page.getByRole('region', { name: 'Source lines' });
  await expect(source).toContainText('Line 125, cited');
  await expect(source).toContainText('openNotes({ filePath })');
  await page.getByRole('link', { name: 'Back to the beat' }).click();
  await expect(page).toHaveURL(/beat_tiny_entry_01\?view=reader/);
  await expect(reading).toBeVisible();
});
