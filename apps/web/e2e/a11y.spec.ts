import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const pages = [
  '/',
  '/t/tour_bunbun_golden/beat_purpose_01',
  '/p/bunbun/source/apps/api/src/main.ts?anchor=anchor_main_bootstrap&beat=beat_request_01',
];

for (const path of pages) {
  test(`has no critical or serious axe violations: ${path}`, async ({ page }) => {
    await page.goto(path);
    await page.waitForLoadState('networkidle');

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    const blocking = results.violations.filter(
      (violation) => violation.impact === 'critical' || violation.impact === 'serious',
    );

    expect(
      blocking,
      blocking.map((violation) => `${violation.id}: ${violation.help}`).join('\n'),
    ).toEqual([]);
  });
}
