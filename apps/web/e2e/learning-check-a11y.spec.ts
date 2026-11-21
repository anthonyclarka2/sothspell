import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { beatPath, installCheck, prompt } from './learning-check-fixture.js';

test('keeps the Canvas check operable with keyboard at 375 px, 200% text, and forced colors', async ({
  page,
}) => {
  await installCheck(page);
  await page.setViewportSize({ width: 375, height: 720 });
  await page.emulateMedia({ forcedColors: 'active' });
  await page.goto(beatPath);
  await page.addStyleTag({ content: 'html { font-size: 200% }' });
  const trigger = page.getByRole('button', { name: 'Learning check' });
  await trigger.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Learning check' });
  await expect(dialog.getByRole('heading', { name: prompt })).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(dialog.getByRole('textbox')).toBeFocused();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await expect(
    dialog.getByRole('link', { name: 'Open full code in a new tab' }),
  ).toBeVisible();
  expect(
    await dialog.evaluate((element) => element.scrollWidth - element.clientWidth),
  ).toBeLessThanOrEqual(1);

  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  const blocking = results.violations.filter(
    ({ impact }) => impact === 'critical' || impact === 'serious',
  );
  expect(blocking.map(({ id, help }) => `${id}: ${help}`)).toEqual([]);

  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
});
