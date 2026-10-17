import { describe, expect, it } from 'vitest';
import { createApp } from './app.js';

describe('API', () => {
  it('reports health', async () => {
    const app = createApp();
    const response = await app.request('/api/health');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      service: 'sothspell',
    });
  });

  it('returns the compiled golden tour', async () => {
    const app = createApp();
    const response = await app.request('/api/tours/tour_bunbun_golden');

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      id: string;
      chapters: Array<{ beats: Array<{ anchors: Array<{ id: string }> }> }>;
    };

    expect(body.id).toBe('tour_bunbun_golden');
    expect(body.chapters.length).toBe(6);
    expect(body.chapters[0]?.beats[0]?.anchors[0]?.id).toBe('anchor_readme_overview');
  });

  it('returns an anchor for a source page', async () => {
    const app = createApp();
    const response = await app.request(
      '/api/projects/bunbun/source/apps/api/src/main.ts?anchor=anchor_main_bootstrap',
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      path: string;
      html: string;
      beatId: string;
      startLine: number;
    };

    expect(body.path).toBe('apps/api/src/main.ts');
    expect(body.html).toContain('shiki');
    expect(body.startLine).toBe(37);
    expect(body.beatId).toBe('beat_request_01');
  });

  it('rejects an unknown anchor', async () => {
    const app = createApp();
    const response = await app.request(
      '/api/projects/bunbun/source/apps/api/src/main.ts?anchor=anchor_missing',
    );

    expect(response.status).toBe(404);
  });

  it('rejects a source path that does not match the anchor', async () => {
    const app = createApp();
    const response = await app.request(
      '/api/projects/bunbun/source/etc/passwd?anchor=anchor_main_bootstrap',
    );

    expect(response.status).toBe(404);
  });
});
