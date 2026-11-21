import type { Page } from '@playwright/test';
import type { CompiledTour } from '@sothspell/core';

const tourId = 'tour_bunbun_golden';
const beatId = 'beat_purpose_01';
export const beatPath = `/t/${tourId}/${beatId}`;
export const prompt = 'What is the source of truth?';

export async function installCheck(page: Page): Promise<void> {
  await page.route(`**/api/tours/${tourId}?locale=*`, async (route) => {
    const response = await route.fetch();
    const tour = (await response.json()) as CompiledTour;
    const beat = tour.chapters[0]!.beats[0]!;
    beat.durationMs = 4000;
    beat.narration = 'The PDS is the source of truth.';
    beat.learningCheck = {
      id: 'check_source',
      prompt,
      explanation: 'The PDS is the source of truth for social data.',
      anchorIds: [beat.anchors[0]!.id],
      locale: 'en',
    };
    await route.fulfill({ response, json: tour });
  });
}
