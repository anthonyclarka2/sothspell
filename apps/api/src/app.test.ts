import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from './app.js';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

async function makeProjectRoot(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'sothspell-api-root-'));
  roots.push(root);
  await mkdir(path.join(root, 'apps', 'api', 'src'), { recursive: true });
  const lines = Array.from({ length: 80 }, (_value, index) => `// line ${index + 1}`);
  await writeFile(
    path.join(root, 'apps', 'api', 'src', 'main.ts'),
    `${lines.join('\n')}\n`,
  );
  return root;
}

function appFor(projectRoot: string | null = null) {
  return createApp({ databasePath: ':memory:', projectRoot });
}

describe('API', () => {
  it('reports health', async () => {
    const response = await appFor().request('/api/health');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      service: 'sothspell',
    });
  });

  it('returns the compiled golden tour', async () => {
    const response = await appFor().request('/api/tours/tour_bunbun_golden');

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      id: string;
      chapters: Array<{ beats: Array<{ anchors: Array<{ id: string }> }> }>;
    };

    expect(body.id).toBe('tour_bunbun_golden');
    expect(body.chapters.length).toBe(6);
    expect(body.chapters[0]?.beats[0]?.anchors[0]?.id).toBe('anchor_readme_overview');
  });

  it('returns the embedded anchor when no project root is configured', async () => {
    const response = await appFor().request(
      '/api/projects/bunbun/source/apps/api/src/main.ts?anchor=anchor_main_bootstrap',
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      path: string;
      html: string;
      beatId: string;
      startLine: number;
      stale: boolean;
      lines: Array<{ number: number; focus: boolean }>;
    };

    expect(body.path).toBe('apps/api/src/main.ts');
    expect(body.html).toContain('shiki');
    expect(body.startLine).toBe(37);
    expect(body.beatId).toBe('beat_request_01');
    expect(body.stale).toBe(false);
    expect(body.lines.length).toBeGreaterThan(10);
  });

  it('serves a full file with focus and a stale badge when the hash differs', async () => {
    const projectRoot = await makeProjectRoot();
    const response = await appFor(projectRoot).request(
      '/api/projects/bunbun/source/apps/api/src/main.ts?anchor=anchor_main_bootstrap',
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      totalLines: number;
      stale: boolean;
      lines: Array<{ number: number; focus: boolean }>;
      outline: Array<{ anchorId: string; startLine: number }>;
    };

    expect(body.totalLines).toBe(81);
    expect(body.stale).toBe(true);
    expect(body.lines).toHaveLength(81);
    expect(body.lines[36]?.focus).toBe(true);
    expect(body.lines[0]?.focus).toBe(false);
    expect(body.outline).toContainEqual(
      expect.objectContaining({ anchorId: 'anchor_main_bootstrap', startLine: 37 }),
    );
  });

  it('rejects an unknown anchor', async () => {
    const response = await appFor().request(
      '/api/projects/bunbun/source/apps/api/src/main.ts?anchor=anchor_missing',
    );

    expect(response.status).toBe(404);
  });

  it('rejects a source path that does not match the anchor', async () => {
    const response = await appFor().request(
      '/api/projects/bunbun/source/etc/passwd?anchor=anchor_main_bootstrap',
    );

    expect(response.status).toBe(404);
  });

  it('stores, reads, updates, and deletes an anonymous run', async () => {
    const app = appFor();
    const payload = {
      clientId: 'client-test-1234',
      beatId: 'beat_purpose_01',
      offsetMs: 1200,
      completedBeatIds: ['beat_purpose_01'],
      mode: 'read',
      speed: 1,
    };

    const put = await app.request('/api/runs/tour_bunbun_golden', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    expect(put.status).toBe(200);

    const get = await app.request(
      '/api/runs/tour_bunbun_golden?clientId=client-test-1234',
    );
    expect(get.status).toBe(200);
    await expect(get.json()).resolves.toMatchObject({
      beatId: 'beat_purpose_01',
      completedBeatIds: ['beat_purpose_01'],
    });

    const update = await app.request('/api/runs/tour_bunbun_golden', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...payload, beatId: 'beat_purpose_02', offsetMs: 0 }),
    });
    expect(update.status).toBe(200);

    const list = await app.request('/api/runs?clientId=client-test-1234');
    await expect(list.json()).resolves.toMatchObject({
      runs: [expect.objectContaining({ beatId: 'beat_purpose_02' })],
    });

    const remove = await app.request(
      '/api/runs/tour_bunbun_golden?clientId=client-test-1234',
      { method: 'DELETE' },
    );
    expect(remove.status).toBe(200);

    const missing = await app.request(
      '/api/runs/tour_bunbun_golden?clientId=client-test-1234',
    );
    expect(missing.status).toBe(404);
  });

  it('rejects an invalid run payload', async () => {
    const response = await appFor().request('/api/runs/tour_bunbun_golden', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ clientId: 'short' }),
    });

    expect(response.status).toBe(400);
  });
});
