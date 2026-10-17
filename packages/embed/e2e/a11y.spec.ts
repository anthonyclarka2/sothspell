import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

/**
 * The embed must meet the same accessibility bar as the web player: zero
 * critical or serious axe violations at desktop and mobile widths. The two
 * Playwright projects supply the widths; this spec runs on both.
 */

for (const path of ['/', '/opt-out.html']) {
  test(`has no critical or serious axe violations on ${path}`, async ({ page }) => {
    await page.goto(path);
    await expect(
      page.locator('sothspell-tour button[aria-label="Play"]').first(),
    ).toBeVisible();
    // Let the iframe embed and fonts settle so axe measures the final layout.
    await page.waitForTimeout(600);

    const results = await new AxeBuilder({ page }).analyze();
    const severe = results.violations.filter(
      (violation) => violation.impact === 'critical' || violation.impact === 'serious',
    );

    expect(severe.map((violation) => `${violation.id}: ${violation.help}`)).toEqual([]);
  });
}
