import { expect, test, type Page } from '@playwright/test';

/**
 * The web authoring flow. The API is mocked so the demo path is deterministic:
 * inspect a local repository, author with the fixture model, and open the tour.
 */

const emptySettings = {
  profiles: [],
  env: {
    authoring: { modelId: null },
    narration: { voiceId: null, modelId: null, hasApiKey: false },
  },
};

const project = {
  path: '/tmp/tiny-notes',
  name: 'Tiny notes',
  slug: 'tiny-notes',
  revision: { commit: 'abc1234def', branch: 'main', dirty: false },
  languages: [{ id: 'typescript', files: 6, bytes: 4096, primary: true }],
  fileCount: 6,
  docCount: 1,
  symbolCount: 14,
};

const runningJob = {
  id: 'job_test',
  status: 'running',
  source: { kind: 'local', label: '/tmp/tiny-notes' },
  steps: [
    { id: 'analyze', status: 'done', detail: '6 files · 14 symbols' },
    { id: 'plan', status: 'done' },
    { id: 'chapters', status: 'active', detail: 'writing chapter 2' },
    { id: 'validate', status: 'pending' },
    { id: 'save', status: 'pending' },
  ],
  detail: 'authoring',
  result: null,
  error: null,
  createdAt: 1,
  updatedAt: 2,
};

const doneJob = {
  ...runningJob,
  status: 'done',
  steps: runningJob.steps.map((step) => ({ ...step, status: 'done' })),
  detail: 'the tour is ready',
  result: {
    tourId: 'tour_tiny_notes',
    title: 'Tiny notes',
    firstBeatId: 'beat_one',
    playerPath: '/t/tour_tiny_notes/beat_one',
    tourPath: '/home/.sothspell/projects/tiny-notes/tours/tour_tiny_notes/tour.json',
    chapters: 4,
    beats: 12,
    anchors: 12,
    estimatedDurationMs: 60_000,
    droppedChapters: 0,
    modelId: 'fixture',
    profileName: null,
  },
};

async function mockSettings(page: Page): Promise<void> {
  await page.route('**/api/settings/profiles', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(emptySettings),
    }),
  );
}

test('authors a tour from a local repository and opens it', async ({ page }) => {
  await mockSettings(page);
  await page.route('**/api/projects/inspect', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ project }),
    }),
  );
  let polls = 0;
  await page.route('**/api/authoring/job_test', (route) => {
    polls += 1;
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ job: polls < 2 ? runningJob : doneJob }),
    });
  });
  await page.route('**/api/authoring', (route) => {
    if (route.request().method() !== 'POST') {
      return route.fallback();
    }
    return route.fulfill({
      status: 202,
      contentType: 'application/json',
      body: JSON.stringify({ job: runningJob }),
    });
  });

  await page.goto('/new');
  await page.getByLabel('Repository path').fill('/tmp/tiny-notes');
  await page.getByRole('button', { name: 'Check repository' }).click();
  await expect(page.getByText('Tiny notes')).toBeVisible();
  await expect(page.getByText('main · abc1234')).toBeVisible();

  await page.getByRole('button', { name: 'Author the tour' }).click();
  await expect(page.getByText('Writing the chapters')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'The tour is ready' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open the tour' })).toHaveAttribute(
    'href',
    '/t/tour_tiny_notes/beat_one',
  );
});

test('authors a tour from a public GitHub URL', async ({ page }) => {
  await mockSettings(page);
  const githubJob = {
    ...runningJob,
    source: { kind: 'github', label: 'https://github.com/owner/repo' },
    steps: [
      { id: 'import', status: 'active', detail: 'cloning the public repository' },
      { id: 'analyze', status: 'pending' },
      { id: 'plan', status: 'pending' },
      { id: 'chapters', status: 'pending' },
      { id: 'validate', status: 'pending' },
      { id: 'save', status: 'pending' },
    ],
  };
  await page.route('**/api/authoring/job_test', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ job: doneJob }),
    }),
  );
  await page.route('**/api/authoring', (route) => {
    if (route.request().method() !== 'POST') {
      return route.fallback();
    }
    return route.fulfill({
      status: 202,
      contentType: 'application/json',
      body: JSON.stringify({ job: githubJob }),
    });
  });

  await page.goto('/new');
  await page.getByRole('radio', { name: /Public GitHub repository/ }).click();
  await page.getByLabel('GitHub URL').fill('https://github.com/owner/repo');
  await page.getByLabel('Branch or tag (optional)').fill('main');
  await page.getByRole('button', { name: 'Author the tour' }).click();

  await expect(page.getByText('Importing the repository')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'The tour is ready' })).toBeVisible();
});

test('shows the model guidance when no authoring model is available', async ({
  page,
}) => {
  await mockSettings(page);
  await page.route('**/api/authoring', (route) => {
    if (route.request().method() !== 'POST') {
      return route.fallback();
    }
    return route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({
        error:
          'no authoring profile is active; add one in Settings or use the fixture model',
      }),
    });
  });

  await page.goto('/new');
  await page.getByRole('radio', { name: /Public GitHub repository/ }).click();
  await page.getByLabel('GitHub URL').fill('https://github.com/owner/repo');
  await page.getByRole('button', { name: 'Author the tour' }).click();

  await expect(page.getByText(/no authoring profile is active/)).toBeVisible();
  await expect(page.getByText(/Choose the fixture model/)).toBeVisible();
});
