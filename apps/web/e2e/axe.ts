import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

/** Report each affected element so moderate and minor WCAG findings receive review too. */
export async function expectNoWcagViolations(page: Page): Promise<void> {
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'])
    .analyze();
  expect(
    violations.flatMap((rule) =>
      rule.nodes.map(
        (node) =>
          `${rule.id} (${rule.impact}): ${node.target.join(' ')} — ${node.failureSummary}`,
      ),
    ),
  ).toEqual([]);
}
