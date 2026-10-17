import { Buffer } from 'node:buffer';
import { describe, expect, it } from 'vitest';
import { narrationContentHash } from './content.js';
import { synthesizeElevenLabs } from './elevenlabs.js';

const API_URL = 'https://api.elevenlabs.io/v1/text-to-speech/voice_1/with-timestamps';
const TEXT = 'Hello world.';

interface Call {
  url: string;
  init: RequestInit;
}

function characterAlignment(text: string): {
  characters: string[];
  character_start_times_seconds: number[];
  character_end_times_seconds: number[];
} {
  const characters = text.split('');

  return {
    characters,
    character_start_times_seconds: characters.map((_, index) => index * 0.05),
    character_end_times_seconds: characters.map((_, index) => (index + 1) * 0.05),
  };
}

function responseWith(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function successPayload(text = TEXT): Record<string, unknown> {
  return {
    audio_base64: Buffer.from('fake-mp3-bytes').toString('base64'),
    alignment: characterAlignment(text),
  };
}

function recordingFetch(respond: (call: Call, index: number) => Response): {
  fetchImpl: typeof fetch;
  calls: Call[];
} {
  const calls: Call[] = [];
  const fetchImpl = async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const call = { url: String(input), init: init ?? {} };
    calls.push(call);
    return respond(call, calls.length - 1);
  };

  return { fetchImpl: fetchImpl as typeof fetch, calls };
}

const baseOptions = {
  text: TEXT,
  voiceId: 'voice_1',
  modelId: 'model_1',
  beatId: 'beat_1',
  apiKey: 'key_123',
  sleep: async () => {},
};

/** Captures the rejection reason so assertions can inspect the message. */
async function captureError(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise;
  } catch (reason) {
    return reason as Error;
  }
  throw new Error('expected the synthesis request to fail');
}

describe('synthesizeElevenLabs', () => {
  it('requests timestamps, decodes the audio, and builds the asset record and segment', async () => {
    const { fetchImpl, calls } = recordingFetch(() => responseWith(successPayload()));

    const result = await synthesizeElevenLabs({ ...baseOptions, fetchImpl });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(`${API_URL}?output_format=mp3_44100_128`);
    expect(calls[0]?.init.method).toBe('POST');

    const headers = new Headers(calls[0]?.init.headers);
    expect(headers.get('xi-api-key')).toBe('key_123');
    expect(headers.get('content-type')).toBe('application/json');
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({
      text: TEXT,
      model_id: 'model_1',
    });

    expect(result.audio.toString()).toBe('fake-mp3-bytes');
    expect(result.mimeType).toBe('audio/mpeg');

    const contentHash = narrationContentHash(TEXT, 'voice_1', 'model_1');
    expect(result.record).toEqual({
      contentHash,
      mimeType: 'audio/mpeg',
      durationMs: 600,
      provider: 'elevenlabs',
      voiceId: 'voice_1',
      modelId: 'model_1',
      alignment: {
        characters: TEXT.split(''),
        characterStartTimesSeconds: TEXT.split('').map((_, index) => index * 0.05),
        characterEndTimesSeconds: TEXT.split('').map((_, index) => (index + 1) * 0.05),
      },
    });

    expect(result.segment).toEqual({
      beatId: 'beat_1',
      text: TEXT,
      sentences: [{ text: TEXT, charStart: 0, charEnd: 12, startMs: 0, endMs: 600 }],
      words: [
        {
          text: 'Hello',
          word: 'Hello',
          charStart: 0,
          charEnd: 5,
          startMs: 0,
          endMs: 250,
        },
        {
          text: 'world.',
          word: 'world.',
          charStart: 6,
          charEnd: 12,
          startMs: 300,
          endMs: 600,
        },
      ],
      audio: {
        contentHash,
        url: `/api/audio/${contentHash}`,
        mimeType: 'audio/mpeg',
        durationMs: 600,
      },
      provider: 'elevenlabs',
      voiceId: 'voice_1',
      modelId: 'model_1',
      contentHash,
    });
  });

  it('prefers alignment over normalized_alignment', async () => {
    const normalized = characterAlignment(TEXT);
    const { fetchImpl } = recordingFetch(() =>
      responseWith({
        audio_base64: Buffer.from('audio').toString('base64'),
        alignment: characterAlignment(TEXT),
        normalized_alignment: {
          characters: normalized.characters,
          character_start_times_seconds: normalized.character_start_times_seconds.map(
            (seconds) => seconds * 10,
          ),
          character_end_times_seconds: normalized.character_end_times_seconds.map(
            (seconds) => seconds * 10,
          ),
        },
      }),
    );

    const result = await synthesizeElevenLabs({ ...baseOptions, fetchImpl });

    expect(result.segment.sentences[0]?.endMs).toBe(600);
    expect(result.record.durationMs).toBe(600);
  });

  it('omits model_id when no model is configured', async () => {
    const { fetchImpl, calls } = recordingFetch(() => responseWith(successPayload()));

    const result = await synthesizeElevenLabs({
      ...baseOptions,
      modelId: undefined,
      fetchImpl,
    });

    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({ text: TEXT });
    expect(result.record.modelId).toBeUndefined();
    expect(result.segment.modelId).toBeUndefined();
  });

  it('retries once on 429 and then succeeds', async () => {
    const slept: number[] = [];
    const { fetchImpl, calls } = recordingFetch((_, index) =>
      index === 0
        ? new Response('slow down', { status: 429 })
        : responseWith(successPayload()),
    );

    const result = await synthesizeElevenLabs({
      ...baseOptions,
      fetchImpl,
      sleep: async (ms) => {
        slept.push(ms);
      },
    });

    expect(calls).toHaveLength(2);
    expect(slept).toHaveLength(1);
    expect(slept[0]).toBeGreaterThan(0);
    expect(slept[0]).toBeLessThanOrEqual(1000);
    expect(result.audio.toString()).toBe('fake-mp3-bytes');
  });

  it('retries once on 5xx and then succeeds', async () => {
    const { fetchImpl, calls } = recordingFetch((_, index) =>
      index === 0
        ? new Response('upstream failed', { status: 503 })
        : responseWith(successPayload()),
    );

    const result = await synthesizeElevenLabs({ ...baseOptions, fetchImpl });

    expect(calls).toHaveLength(2);
    expect(result.audio.toString()).toBe('fake-mp3-bytes');
  });

  it('gives up after a single retry on persistent 5xx', async () => {
    const { fetchImpl, calls } = recordingFetch(
      () => new Response('upstream failed', { status: 500 }),
    );

    await expect(synthesizeElevenLabs({ ...baseOptions, fetchImpl })).rejects.toThrow(
      /500/,
    );
    expect(calls).toHaveLength(2);
  });

  it('does not retry on 401 and redacts the API key from the error', async () => {
    const { fetchImpl, calls } = recordingFetch(
      () =>
        new Response(JSON.stringify({ detail: 'invalid key key_123' }), { status: 401 }),
    );

    const error = await captureError(synthesizeElevenLabs({ ...baseOptions, fetchImpl }));

    expect(calls).toHaveLength(1);
    expect(error.message).toContain('401');
    expect(error.message).not.toContain('key_123');
    expect(error.message).toContain('[redacted]');
  });

  it('rejects a missing or blank API key without making a request', async () => {
    let called = false;
    const fetchImpl = (async () => {
      called = true;
      return responseWith(successPayload());
    }) as typeof fetch;

    await expect(
      synthesizeElevenLabs({ ...baseOptions, apiKey: '', fetchImpl }),
    ).rejects.toThrow(/API key/i);
    await expect(
      synthesizeElevenLabs({ ...baseOptions, apiKey: '   ', fetchImpl }),
    ).rejects.toThrow(/API key/i);

    expect(called).toBe(false);
  });

  it('rejects a response without audio', async () => {
    const { fetchImpl } = recordingFetch(() =>
      responseWith({ alignment: characterAlignment(TEXT) }),
    );

    await expect(synthesizeElevenLabs({ ...baseOptions, fetchImpl })).rejects.toThrow(
      /no audio/i,
    );
  });

  it('falls back to the reading estimate when the provider returns no alignment', async () => {
    const { fetchImpl } = recordingFetch(() =>
      responseWith({
        audio_base64: Buffer.from('audio').toString('base64'),
        alignment: {
          characters: [],
          character_start_times_seconds: [],
          character_end_times_seconds: [],
        },
      }),
    );

    const result = await synthesizeElevenLabs({ ...baseOptions, fetchImpl });

    expect(result.record.alignment.characters).toEqual([]);
    expect(result.record.durationMs).toBe(1070);
    expect(result.segment.sentences[0]?.endMs).toBe(1070);
    expect(result.segment.words).toHaveLength(2);
  });
});
