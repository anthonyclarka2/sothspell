import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import {
  ImportCloneError,
  ImportLimitError,
  ImportNotFoundError,
  ImportTimeoutError,
  UnsupportedImportHostError,
  type ImportRecord,
  type ImportRequest,
  type ImportResult,
  type ImportService,
} from '@sothspell/import';
import { createApp } from './app.js';
import { registerImportRoutes } from './imports.js';

function sampleRecord(overrides: Partial<ImportRecord> = {}): ImportRecord {
  const commit = '0123456789abcdef0123456789abcdef01234567';
  return {
    id: 'example-demo-0123456789ab',
    owner: 'example',
    repo: 'demo',
    sourceUrl: 'https://github.com/example/demo',
    ref: null,
    commit,
    shortCommit: commit.slice(0, 12),
    directory: '/tmp/sothspell/projects/imported/example-demo-0123456789ab',
    sizeBytes: 2048,
    fileCount: 12,
    importedAt: '2026-10-17T00:00:00.000Z',
    ...overrides,
  };
}

function serviceWith(overrides: Partial<ImportService> = {}): ImportService {
  return {
    import: async () => ({ record: sampleRecord(), created: true }),
    list: async () => [],
    get: async () => null,
    refresh: async () => ({ record: sampleRecord(), created: false }),
    remove: async () => false,
    ...overrides,
  };
}

/** Mounts only the import routes, the seam the route module owns. */
function mount(service: ImportService): Hono {
  const app = new Hono();
  registerImportRoutes(app, { service });
  return app;
}

function postJson(url: string, body: unknown): RequestInit {
  return {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  };
}

describe('import routes', () => {
  it('creates an import', async () => {
    const importFn = vi.fn(async (input: ImportRequest): Promise<ImportResult> => ({
      record: sampleRecord({ ref: input.ref ?? null }),
      created: true,
    }));
    const response = await mount(serviceWith({ import: importFn })).request(
      '/api/imports',
      postJson('/api/imports', { url: 'https://github.com/example/demo', ref: 'main' }),
    );

    expect(response.status).toBe(201);
    const body = (await response.json()) as { import: ImportRecord };
    expect(body.import.id).toBe('example-demo-0123456789ab');
    expect(body.import.ref).toBe('main');
    expect(importFn).toHaveBeenCalledWith({
      url: 'https://github.com/example/demo',
      ref: 'main',
    });
  });

  it('rejects an invalid payload with 400', async () => {
    const response = await mount(serviceWith()).request(
      '/api/imports',
      postJson('/api/imports', { ref: 'main' }),
    );

    expect(response.status).toBe(400);
  });

  it('rejects an unsupported URL with 400', async () => {
    const service = serviceWith({
      import: async () => {
        throw new UnsupportedImportHostError('gitlab.com');
      },
    });
    const response = await mount(service).request(
      '/api/imports',
      postJson('/api/imports', { url: 'https://gitlab.com/example/demo' }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: 'unsupported-host',
    });
  });

  it('reports an already imported revision as 409 with the existing record', async () => {
    const existing = sampleRecord();
    const service = serviceWith({
      import: async () => ({ record: existing, created: false }),
    });
    const response = await mount(service).request(
      '/api/imports',
      postJson('/api/imports', { url: 'https://github.com/example/demo' }),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      existing: { id: existing.id },
    });
  });

  it('reports a clone timeout as 504', async () => {
    const service = serviceWith({
      import: async () => {
        throw new ImportTimeoutError(1000);
      },
    });
    const response = await mount(service).request(
      '/api/imports',
      postJson('/api/imports', { url: 'https://github.com/example/demo' }),
    );

    expect(response.status).toBe(504);
  });

  it('reports a repository over the limit as 507', async () => {
    const service = serviceWith({
      import: async () => {
        throw new ImportLimitError('bytes', 100, 10);
      },
    });
    const response = await mount(service).request(
      '/api/imports',
      postJson('/api/imports', { url: 'https://github.com/example/demo' }),
    );

    expect(response.status).toBe(507);
  });

  it('reports a git failure as 502', async () => {
    const service = serviceWith({
      import: async () => {
        throw new ImportCloneError('git clone failed: repository not found');
      },
    });
    const response = await mount(service).request(
      '/api/imports',
      postJson('/api/imports', { url: 'https://github.com/example/demo' }),
    );

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({
      error: 'git clone failed: repository not found',
    });
  });

  it('lists imports', async () => {
    const record = sampleRecord();
    const response = await mount(serviceWith({ list: async () => [record] })).request(
      '/api/imports',
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ imports: [record] });
  });

  it('returns one import and 404s for an unknown id', async () => {
    const record = sampleRecord();
    const app = mount(
      serviceWith({
        get: async (id) => (id === record.id ? record : null),
      }),
    );

    const found = await app.request(`/api/imports/${record.id}`);
    expect(found.status).toBe(200);
    await expect(found.json()).resolves.toEqual({ import: record });

    const missing = await app.request('/api/imports/example-demo-ffffffffffff');
    expect(missing.status).toBe(404);
  });

  it('removes an import and 404s for an unknown id', async () => {
    const app = mount(
      serviceWith({ remove: async (id) => id === 'example-demo-0123456789ab' }),
    );

    const removed = await app.request('/api/imports/example-demo-0123456789ab', {
      method: 'DELETE',
    });
    expect(removed.status).toBe(200);
    await expect(removed.json()).resolves.toEqual({ ok: true });

    const missing = await app.request('/api/imports/example-demo-ffffffffffff', {
      method: 'DELETE',
    });
    expect(missing.status).toBe(404);
  });

  it('refreshes an import and maps its named errors', async () => {
    const record = sampleRecord();
    const app = mount(
      serviceWith({
        refresh: async (id) => {
          if (id !== record.id) {
            throw new ImportNotFoundError(id);
          }
          return { record, created: false };
        },
      }),
    );

    const refreshed = await app.request(`/api/imports/${record.id}/refresh`, {
      method: 'POST',
    });
    expect(refreshed.status).toBe(200);
    await expect(refreshed.json()).resolves.toEqual({ import: record, created: false });

    const missing = await app.request('/api/imports/example-demo-ffffffffffff/refresh', {
      method: 'POST',
    });
    expect(missing.status).toBe(404);

    const timedOut = mount(
      serviceWith({
        refresh: async () => {
          throw new ImportTimeoutError(1000);
        },
      }),
    );
    const timeoutResponse = await timedOut.request(`/api/imports/${record.id}/refresh`, {
      method: 'POST',
    });
    expect(timeoutResponse.status).toBe(504);
  });
});

/** An in-memory service so createApp tests exercise the real routes. */
function createMemoryImportService(): ImportService {
  const records = new Map<string, ImportRecord>();
  return {
    async import({ url, ref }) {
      const record = sampleRecord({ sourceUrl: url, ref: ref ?? null });
      const created = !records.has(record.id);
      records.set(record.id, record);
      return { record, created };
    },
    async list() {
      return [...records.values()];
    },
    async get(id) {
      return records.get(id) ?? null;
    },
    async refresh(id) {
      const record = records.get(id);
      if (!record) {
        throw new ImportNotFoundError(id);
      }
      return { record, created: false };
    },
    async remove(id) {
      return records.delete(id);
    },
  };
}

describe('import routes through createApp', () => {
  it('round-trips create, list, get, refresh, and remove', async () => {
    const app = createApp({
      databasePath: ':memory:',
      importService: createMemoryImportService(),
    });

    const created = await app.request(
      '/api/imports',
      postJson('/api/imports', { url: 'https://github.com/example/demo' }),
    );
    expect(created.status).toBe(201);
    const { import: record } = (await created.json()) as { import: ImportRecord };

    const list = await app.request('/api/imports');
    await expect(list.json()).resolves.toEqual({ imports: [record] });

    const duplicate = await app.request(
      '/api/imports',
      postJson('/api/imports', { url: 'https://github.com/example/demo' }),
    );
    expect(duplicate.status).toBe(409);

    const one = await app.request(`/api/imports/${record.id}`);
    expect(one.status).toBe(200);

    const refreshed = await app.request(`/api/imports/${record.id}/refresh`, {
      method: 'POST',
    });
    expect(refreshed.status).toBe(200);

    const removed = await app.request(`/api/imports/${record.id}`, { method: 'DELETE' });
    expect(removed.status).toBe(200);

    const missing = await app.request(`/api/imports/${record.id}`);
    expect(missing.status).toBe(404);
  });
});
