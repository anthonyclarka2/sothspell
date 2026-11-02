import { expect, test, type Page } from '@playwright/test';

const PLAYER = '/t/tour_bunbun_golden/beat_purpose_02';

function drawerTrigger(page: Page) {
  return page.getByRole('button', { name: 'Chapters', exact: true });
}

function drawerPanel(page: Page) {
  return page.locator('.chapter-drawer-panel');
}

function persistentRail(page: Page) {
  return page.locator('.chapter-rail:not(.chapter-rail--drawer)');
}

async function openDrawer(page: Page) {
  const trigger = drawerTrigger(page);
  await trigger.click();
  await expect(drawerPanel(page)).toBeVisible();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  return trigger;
}

test('keeps the persistent chapter rail at 1440 px', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(PLAYER);

  const rail = persistentRail(page);
  await expect(rail).toBeVisible();
  await expect(rail.getByRole('heading', { name: 'Chapters' })).toBeVisible();
  await expect(rail.getByText('What Bunbun is', { exact: true })).toBeVisible();
  await expect(rail.getByText('Current chapter: chapter_purpose')).toBeVisible();
  await expect(rail.locator('button[aria-current="true"]')).toHaveText(
    /Three application surfaces/,
  );

  await expect(drawerTrigger(page)).toBeHidden();
  await expect(drawerPanel(page)).toHaveCount(0);
});

test('opens the chapter drawer at 1024, 768, and 375 px', async ({ page }) => {
  for (const width of [1024, 768, 375]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(PLAYER);

    await expect(persistentRail(page)).toBeHidden();
    const trigger = drawerTrigger(page);
    await expect(trigger).toBeVisible();
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await expect(trigger).not.toHaveAttribute('aria-controls');

    await trigger.click();
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    const panelId = await trigger.getAttribute('aria-controls');
    expect(panelId, `aria-controls at ${width}px`).toBeTruthy();

    const panel = drawerPanel(page);
    await expect(panel).toHaveAttribute('id', panelId as string);
    await expect(page.locator('.player-viewbar .chapter-drawer-panel')).toHaveCount(1);
    await expect(panel.locator('.chapter-rail--drawer')).toBeVisible();
    await expect(panel.getByRole('heading', { name: 'Chapters' })).toBeVisible();
    await expect(panel.getByText('What Bunbun is', { exact: true })).toBeVisible();
    await expect(panel.locator('button[aria-current="true"]')).toHaveText(
      /Three application surfaces/,
    );
    await expect(panel.getByText('Current chapter: chapter_purpose')).toBeVisible();

    // The drawer must stay inside the viewport, not only inside the DOM.
    const box = await panel.boundingBox();
    expect(box, `panel box at ${width}px`).not.toBeNull();
    expect(box!.x, `panel left at ${width}px`).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width, `panel right at ${width}px`).toBeLessThanOrEqual(
      width + 0.5,
    );

    // Hit-test the panel corners: an ancestor `overflow: hidden` or a canvas
    // stacking context must not clip or cover the open panel.
    const covered = await panel.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return [
        [rect.left + 4, rect.top + 4],
        [rect.right - 4, rect.bottom - 4],
      ].some(([x, y]) => {
        const hit = document.elementFromPoint(x, y);
        return hit === null || !element.contains(hit);
      });
    });
    expect(covered, `panel clipped or covered at ${width}px`).toBe(false);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow, `overflow at ${width}px with the drawer open`).toBeLessThanOrEqual(
      1,
    );

    await page.keyboard.press('Escape');
    await expect(drawerPanel(page)).toHaveCount(0);
  }
});

test('focuses the active beat when the drawer opens', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 900 });
  await page.goto(PLAYER);

  await openDrawer(page);
  const active = page.locator('.chapter-drawer-panel button[aria-current="true"]');
  await expect(active).toHaveText(/Three application surfaces/);
  await expect(active).toBeFocused();
});

test('seeks from the drawer, closes it, and returns focus', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 900 });
  await page.goto(PLAYER);

  const trigger = await openDrawer(page);
  await page
    .locator('.chapter-drawer-panel')
    .getByRole('button', { name: /The service orders the write/ })
    .click();

  await expect(page).toHaveURL(/beat_write_02/);
  await expect(
    page.getByRole('heading', { name: 'The service orders the write' }),
  ).toBeVisible();
  await expect(drawerPanel(page)).toHaveCount(0);
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await expect(trigger).toBeFocused();
});

test('closes on Escape without toggling theater', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 900 });
  await page.goto(PLAYER);

  const trigger = await openDrawer(page);
  await expect(
    page.locator('.chapter-drawer-panel button[aria-current="true"]'),
  ).toBeFocused();

  await page.keyboard.press('Escape');

  await expect(drawerPanel(page)).toHaveCount(0);
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await expect(trigger).toBeFocused();
  await expect(page.locator('.player-page')).not.toHaveClass(/player-page--theater/);
  await expect(
    page.getByRole('heading', { name: 'Three application surfaces' }),
  ).toBeVisible();
});

test('closes on an outside pointerdown', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 900 });
  await page.goto(PLAYER);

  const trigger = await openDrawer(page);
  await page.locator('.narration h2').click();

  await expect(drawerPanel(page)).toHaveCount(0);
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await expect(trigger).not.toBeFocused();
});

test('closes when the viewport widens across 1081 px', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 900 });
  await page.goto(PLAYER);

  await openDrawer(page);
  await page.setViewportSize({ width: 1200, height: 900 });

  await expect(drawerPanel(page)).toHaveCount(0);
  await expect(drawerTrigger(page)).toBeHidden();
  await expect(persistentRail(page)).toBeVisible();
  await expect(page.locator('.chapter-rail--drawer')).toHaveCount(0);
  expect(
    await page.evaluate(() =>
      Boolean(document.activeElement?.closest('.chapter-drawer-panel')),
    ),
  ).toBe(false);
});

test('closes when theater mode starts', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 900 });
  await page.goto(PLAYER);

  await openDrawer(page);
  await page.getByRole('button', { name: 'Enter theater mode' }).click();

  await expect(page.locator('.player-page')).toHaveClass(/player-page--theater/);
  await expect(drawerPanel(page)).toHaveCount(0);
  await expect(drawerTrigger(page)).toBeHidden();
});

test('marks completed beats inside the drawer', async ({ page }) => {
  await page.route('**/api/runs/**', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.fulfill({ status: 204 });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        clientId: 'chapter-nav-test',
        tourId: 'tour_bunbun_golden',
        beatId: 'beat_purpose_01',
        offsetMs: 0,
        completedBeatIds: ['beat_purpose_01'],
        mode: 'read',
        speed: 1,
        updatedAt: Date.now(),
      }),
    });
  });

  await page.setViewportSize({ width: 1024, height: 900 });
  await page.goto(PLAYER);
  await page.getByRole('button', { name: 'Resume' }).click();

  await openDrawer(page);
  const completed = page
    .locator('.chapter-drawer-panel')
    .getByRole('button', { name: /Two sources, one conversation/ });
  await expect(completed.locator('.beat-complete')).toBeVisible();
});

test('anchors the drawer inside the viewport in RTL at 375 px', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('sothspell.locale', 'ar');
  });
  await page.setViewportSize({ width: 375, height: 900 });
  await page.goto(PLAYER);

  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');

  const trigger = page.getByRole('button', { name: 'الفصول', exact: true });
  await trigger.click();
  const panel = drawerPanel(page);
  await expect(panel).toBeVisible();

  const box = await panel.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(375.5);

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);

  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);
  await expect(trigger).toBeFocused();
});
