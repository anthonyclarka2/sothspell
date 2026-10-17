import type { NarrationAssetStore } from '@sothspell/narration';
import type { Hono } from 'hono';

export { createDeferredNarrationAssetStore } from './narration-bridge.js';

/** Content-addressed audio only; anything else is a client error, not a miss. */
const AUDIO_HASH = /^sha256:[a-f0-9]{64}$/;

export interface AudioRouteOptions {
  assetStore: NarrationAssetStore;
}

interface ByteRange {
  start: number;
  end: number;
}

/**
 * Parses one byte range. Malformed, multi-range, and out-of-bounds headers all
 * collapse to `null` so the client gets a single predictable 416 instead of a
 * partial body. `end` is inclusive and already clamped to the asset length.
 */
function parseByteRange(header: string, size: number): ByteRange | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) {
    return null;
  }
  const [, rawStart = '', rawEnd = ''] = match;
  if (rawStart === '' && rawEnd === '') {
    return null;
  }

  if (rawStart === '') {
    const suffix = Number.parseInt(rawEnd, 10);
    if (!Number.isFinite(suffix) || suffix <= 0 || size === 0) {
      return null;
    }
    return { start: Math.max(0, size - suffix), end: size - 1 };
  }

  const start = Number.parseInt(rawStart, 10);
  if (!Number.isFinite(start) || start >= size) {
    return null;
  }
  if (rawEnd === '') {
    return { start, end: size - 1 };
  }

  const end = Number.parseInt(rawEnd, 10);
  if (!Number.isFinite(end) || end < start) {
    return null;
  }
  return { start, end: Math.min(end, size - 1) };
}

function bodyBytes(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  // Hono's body type narrows to Uint8Array<ArrayBuffer>; a Buffer view over a
  // shared backing store is a valid response body at runtime.
  return bytes as Uint8Array<ArrayBuffer>;
}

/**
 * Serves cached MP3 assets from the content-addressed store. The player seeks
 * with range requests, so a full body and partial bodies must carry the same
 * cache and range metadata.
 */
export function registerAudioRoutes(app: Hono, options: AudioRouteOptions): void {
  app.get('/api/audio/:hash', async (context) => {
    const hash = context.req.param('hash');
    if (!AUDIO_HASH.test(hash)) {
      return context.json({ error: 'invalid audio hash' }, 400);
    }

    const asset = await options.assetStore.read(hash);
    if (!asset) {
      return context.json({ error: 'audio not found' }, 404);
    }

    const { audio, record } = asset;
    const size = audio.byteLength;
    const headers = {
      'content-type': record.mimeType,
      'accept-ranges': 'bytes',
      // Content-addressed bytes never change, so they can be kept forever.
      'cache-control': 'private, max-age=31536000, immutable',
    };

    const rangeHeader = context.req.header('range');
    if (!rangeHeader) {
      return context.body(bodyBytes(audio), 200, {
        ...headers,
        'content-length': String(size),
      });
    }

    const range = parseByteRange(rangeHeader, size);
    if (!range) {
      return context.body(null, 416, {
        ...headers,
        'content-range': `bytes */${size}`,
      });
    }

    const slice = audio.subarray(range.start, range.end + 1);
    return context.body(bodyBytes(slice), 206, {
      ...headers,
      'content-length': String(slice.byteLength),
      'content-range': `bytes ${range.start}-${range.end}/${size}`,
    });
  });
}
