import { expect, test, type Page } from '@playwright/test';

interface ImportRecordFixture {
  id: string;
  owner: string;
  repo: string;
  sourceUrl: string;
  ref: string | null;
  commit: string;
  shortCommit: string;
  directory: string;
  sizeBytes: number;
  fileCount: number;
  importedAt: string;
}

function sampleImport(overrides: Partial<ImportRecordFixture> = {}): ImportRecordFixture {
  const commit = '0123456789abcdef0123456789abcdef01234567';
  return {
    id: 'example-demo-0123456789ab',
    owner: 'example',
    repo: 'demo',
    sourceUrl: 'https://github.com/example/demo',
    ref: 'main',
    commit,
    shortCommit: commit.slice(0, 12),
    directory: '/tmp/sothspell/projects/imported/example-demo-0123456789ab',
    sizeBytes: 2_097_152,
    fileCount: 128,
    importedAt: '2026-10-17T12:00:00.000Z',
    ...overrides,
  };
}

function gate() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

interface ImportApiMock {
  imports: ImportRecordFixture[];
  postGate: { promise: Promise<void>; release: () => void } | null;
  listGate: { promise: Promise<void>; release: () => void } | null;
  error: { status: number; body: unknown } | null;
  listCalls: number;
  deleteCalls: number;
  refreshCalls: number;
}

/**
 * Mocks every `/api/imports*` call so the spec never clones anything. Gates
 * hold one request open, which is how the progress states become observable.
 */
async function installImportApiMock(page: Page): Promise<ImportApiMock> {
  const mock: ImportApiMock = {
    imports: [],
    postGate: null,
    listGate: null,
    error: null,
    listCalls: 0,
    deleteCalls: 0,
    refreshCalls: 0,
  };

  await page.route('**/api/imports**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();

    if (path === '/api/imports' && method === 'GET') {
      mock.listCalls += 1;
      const held = mock.listGate;
      mock.listGate = null;
      if (held) {
        await held.promise;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ imports: mock.imports }),
      });
      return;
    }

    if (path === '/api/imports' && method === 'POST') {
      const held = mock.postGate;
      mock.postGate = null;
      if (held) {
        await held.promise;
      }
      if (mock.error) {
        await route.fulfill({
          status: mock.error.status,
          contentType: 'application/json',
          body: JSON.stringify(mock.error.body),
        });
        return;
      }
      const payload = request.postDataJSON() as { url: string; ref?: string };
      const record = sampleImport({ ref: payload.ref ?? null });
      mock.imports = [record];
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ import: record }),
      });
      return;
    }

    const refreshMatch = /^\/api\/imports\/([^/]+)\/refresh$/u.exec(path);
    if (refreshMatch && method === 'POST') {
      mock.refreshCalls += 1;
      const moved = sampleImport({
        id: 'example-demo-fedcba987654',
        commit: 'fedcba9876543210fedcba9876543210fedcba98',
        shortCommit: 'fedcba987654',
      });
      mock.imports = [moved, ...mock.imports];
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ import: moved, created: true }),
      });
      return;
    }

    const deleteMatch = /^\/api\/imports\/([^/]+)$/u.exec(path);
    if (deleteMatch && method === 'DELETE') {
      mock.deleteCalls += 1;
      mock.imports = mock.imports.filter((record) => record.id !== deleteMatch[1]);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true }),
      });
      return;
    }

    await route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'not found' }),
    });
  });

  return mock;
}

/**
 * Records every phase the progress readout enters. A MutationObserver catches
 * transitions that are too fast to poll for, so the queued state is provable.
 */
async function installPhaseRecorder(page: Page): Promise<void> {
  await page.evaluate(() => {
    const log: string[] = [];
    (window as unknown as { phaseLog: string[] }).phaseLog = log;
    const push = (value: string | null) => {
      if (value && log.at(-1) !== value) {
        log.push(value);
      }
    };
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        if (record.type === 'attributes' && record.target instanceof Element) {
          push(record.target.getAttribute('data-phase'));
        }
        for (const node of record.addedNodes) {
          if (node instanceof Element) {
            push(
              node.getAttribute('data-phase') ??
                node.querySelector('[data-phase]')?.getAttribute('data-phase') ??
                null,
            );
          }
        }
      }
    });
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['data-phase'],
    });
  });
}

test('imports a repository with visible progress and lists it', async ({ page }) => {
  const mock = await installImportApiMock(page);
  await page.goto('/import');
  await expect(page.getByRole('heading', { name: 'Import a repository' })).toBeVisible();
  await expect(page.getByTestId('import-empty')).toBeVisible();

  await installPhaseRecorder(page);
  const postGate = gate();
  const listGate = gate();
  mock.postGate = postGate;
  mock.listGate = listGate;

  await page.getByLabel('GitHub repository URL').fill('https://github.com/example/demo');
  await page.getByLabel('Ref (optional)').fill('main');
  await page.getByRole('button', { name: 'Import' }).click();

  await expect(page.getByTestId('import-phase')).toHaveAttribute('data-phase', 'cloning');
  postGate.release();
  await expect(page.getByTestId('import-phase')).toHaveAttribute(
    'data-phase',
    'analyzing',
  );
  listGate.release();

  await expect(page.getByTestId('import-phase')).toHaveAttribute('data-phase', 'ready');
  const item = page.getByTestId('import-item');
  await expect(item).toContainText('example/demo');
  await expect(item).toContainText('0123456789ab');
  await expect(item).toContainText('main');
  await expect(item).toContainText('2.0 MB');

  const phases = await page.evaluate(
    () => (window as unknown as { phaseLog: string[] }).phaseLog,
  );
  expect(phases).toEqual(['queued', 'cloning', 'analyzing', 'ready']);
});

test('shows the named error when the import is rejected', async ({ page }) => {
  const mock = await installImportApiMock(page);
  mock.error = {
    status: 400,
    body: {
      error:
        'only public GitHub repositories are importable; "gitlab.com" is not supported',
    },
  };

  await page.goto('/import');
  await page.getByLabel('GitHub repository URL').fill('https://gitlab.com/example/demo');
  await page.getByRole('button', { name: 'Import' }).click();

  await expect(page.getByRole('alert')).toContainText(
    'only public GitHub repositories are importable',
  );
  await expect(page.getByTestId('import-phase')).toHaveAttribute('data-phase', 'failed');
});

test('reports an already imported repository as a conflict', async ({ page }) => {
  const mock = await installImportApiMock(page);
  mock.error = {
    status: 409,
    body: { error: 'example/demo is already imported', existing: sampleImport() },
  };

  await page.goto('/import');
  await page.getByLabel('GitHub repository URL').fill('https://github.com/example/demo');
  await page.getByRole('button', { name: 'Import' }).click();

  await expect(page.getByRole('alert')).toContainText('already imported');
});

test('removes an import only after confirmation', async ({ page }) => {
  const mock = await installImportApiMock(page);
  mock.imports = [sampleImport()];

  await page.goto('/import');
  await expect(page.getByTestId('import-item')).toContainText('example/demo');

  await page.getByRole('button', { name: 'Remove' }).click();
  await expect(page.getByRole('button', { name: 'Confirm remove' })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('button', { name: 'Remove' })).toBeVisible();
  expect(mock.deleteCalls).toBe(0);

  await page.getByRole('button', { name: 'Remove' }).click();
  await page.getByRole('button', { name: 'Confirm remove' }).click();

  await expect(page.getByTestId('import-empty')).toBeVisible();
  expect(mock.deleteCalls).toBe(1);
});

test('refreshes an import and shows the new revision', async ({ page }) => {
  const mock = await installImportApiMock(page);
  mock.imports = [sampleImport()];

  await page.goto('/import');
  await expect(page.getByTestId('import-item')).toContainText('0123456789ab');

  await page.getByRole('button', { name: 'Refresh' }).click();

  await expect(page.getByTestId('import-item').first()).toContainText('fedcba987654');
  expect(mock.refreshCalls).toBe(1);
});
