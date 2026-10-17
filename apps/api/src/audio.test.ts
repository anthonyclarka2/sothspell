import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { createDeferredNarrationAssetStore, registerAudioRoutes } from './audio.js';
import { createMemoryAssetStore, testAlignment } from './test-support.js';

const HASH = `sha256:${'a'.repeat(64)}`;
const UNKNOWN_HASH = `sha256:${'b'.repeat(64)}`;
const BYTES = Buffer.from([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);

function audioApp(): Hono {
  const assetStore = createMemoryAssetStore();
  assetStore.seed(HASH, {
    audio: BYTES,
    record: {
      contentHash: HASH,
      mimeType: 'audio/mpeg',
      durationMs: 1000,
      provider: 'elevenlabs',
      voiceId: 'voice-1',
      alignment: testAlignment,
    },
  });
  const app = new Hono();
  registerAudioRoutes(app, { assetStore });
  return app;
}

async function bodyBytes(response: Response): Promise<Buffer> {
  return Buffer.from(await response.arrayBuffer());
}

describe('GET /api/audio/:hash', () => {
  it('serves a full asset with cacheable byte metadata', async () => {
    const response = await audioApp().request(`/api/audio/${HASH}`);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('audio/mpeg');
    expect(response.headers.get('content-length')).toBe('10');
    expect(response.headers.get('accept-ranges')).toBe('bytes');
    expect(await bodyBytes(response)).toEqual(BYTES);
  });

  it('serves a byte range with 206 and a content-range header', async () => {
    const response = await audioApp().request(`/api/audio/${HASH}`, {
      headers: { range: 'bytes=2-5' },
    });

    expect(response.status).toBe(206);
    expect(response.headers.get('content-range')).toBe('bytes 2-5/10');
    expect(response.headers.get('content-length')).toBe('4');
    expect(response.headers.get('accept-ranges')).toBe('bytes');
    expect(await bodyBytes(response)).toEqual(Buffer.from([2, 3, 4, 5]));
  });

  it('serves an open-ended range to the end of the asset', async () => {
    const response = await audioApp().request(`/api/audio/${HASH}`, {
      headers: { range: 'bytes=4-' },
    });

    expect(response.status).toBe(206);
    expect(response.headers.get('content-range')).toBe('bytes 4-9/10');
    expect(await bodyBytes(response)).toEqual(Buffer.from([4, 5, 6, 7, 8, 9]));
  });

  it('serves a suffix range from the end of the asset', async () => {
    const response = await audioApp().request(`/api/audio/${HASH}`, {
      headers: { range: 'bytes=-3' },
    });

    expect(response.status).toBe(206);
    expect(response.headers.get('content-range')).toBe('bytes 7-9/10');
    expect(await bodyBytes(response)).toEqual(Buffer.from([7, 8, 9]));
  });

  it('clamps a range end past the asset length', async () => {
    const response = await audioApp().request(`/api/audio/${HASH}`, {
      headers: { range: 'bytes=0-99' },
    });

    expect(response.status).toBe(206);
    expect(response.headers.get('content-range')).toBe('bytes 0-9/10');
    expect(await bodyBytes(response)).toEqual(BYTES);
  });

  it('returns 416 for an unsatisfiable range', async () => {
    const beyond = await audioApp().request(`/api/audio/${HASH}`, {
      headers: { range: 'bytes=10-' },
    });
    expect(beyond.status).toBe(416);
    expect(beyond.headers.get('content-range')).toBe('bytes */10');

    const inverted = await audioApp().request(`/api/audio/${HASH}`, {
      headers: { range: 'bytes=5-3' },
    });
    expect(inverted.status).toBe(416);
  });

  it('returns 404 for an unknown but well-formed hash', async () => {
    const response = await audioApp().request(`/api/audio/${UNKNOWN_HASH}`);

    expect(response.status).toBe(404);
  });

  it('returns 400 for a malformed hash', async () => {
    for (const malformed of ['not-a-hash', 'sha256:zzz', `sha256:${'A'.repeat(64)}`]) {
      const response = await audioApp().request(`/api/audio/${malformed}`);
      expect(response.status, malformed).toBe(400);
    }
  });

  it('constructs the default file store without loading it', () => {
    // createApp runs in tests that never touch audio; the package-backed store
    // must stay lazy so those tests do not need the narration branch merged.
    expect(() => createDeferredNarrationAssetStore('/nonexistent/audio')).not.toThrow();
  });
});
