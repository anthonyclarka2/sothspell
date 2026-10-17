import type { Page } from '@playwright/test';

/**
 * The e2e environment has no translation of the golden tour checked in, so the
 * specs mark human-facing strings when the client asks for a locale. This keeps
 * the assertion honest about *which* strings the player renders in the active
 * locale without shipping a fixture translation.
 */

const HUMAN_KEYS = new Set([
  'title',
  'subtitle',
  'summary',
  'narration',
  'label',
  'suggestedQuestions',
]);

function markStrings(value: unknown, marker: string, key?: string): unknown {
  if (typeof value === 'string') {
    return key !== undefined && HUMAN_KEYS.has(key) ? `${marker} ${value}` : value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => markStrings(item, marker, key));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([entryKey, item]) => [
        entryKey,
        markStrings(item, marker, entryKey),
      ]),
    );
  }
  return value;
}

export interface TranslatedToursHandle {
  /** Tour requests seen by the route, for locale-aware fetch assertions. */
  requests: string[];
}

export function installTranslatedTours(page: Page): TranslatedToursHandle {
  const requests: string[] = [];

  void page.route('**/api/tours/**', async (route) => {
    const url = route.request().url();
    requests.push(url);
    const locale = new URL(url).searchParams.get('locale');
    if (!locale || locale === 'en') {
      await route.continue();
      return;
    }

    const response = await route.fetch();
    const tour = (await response.json()) as unknown;
    await route.fulfill({ response, json: markStrings(tour, `«${locale}»`) });
  });

  return { requests };
}
