import type {
  CharacterAlignment,
  SentenceTiming,
  WordTiming,
} from '@sothspell/narration';
import { describe, expect, it } from 'vitest';
import {
  NarrationUnavailableError,
  createNarrationService,
  narrationContentHash,
  type AlignmentNormalizer,
  type CloudSynthesisRequest,
  type CloudSynthesizer,
} from './narration.js';
import { createMemoryAssetStore, testAlignment } from './test-support.js';

const VOICE = 'voice-test-1';
const MODEL = 'model-test-1';
const TEXT = 'Hello there.';

const SENTENCES: SentenceTiming[] = [
  { text: 'Hello there.', startMs: 0, endMs: 900, charStart: 0, charEnd: 12 },
];
const WORDS: WordTiming[] = [
  { text: 'Hello', word: 'Hello', startMs: 0, endMs: 400, charStart: 0, charEnd: 5 },
  { text: 'there.', word: 'there.', startMs: 450, endMs: 900, charStart: 6, charEnd: 12 },
];

function fakeSynthesizer() {
  const calls: CloudSynthesisRequest[] = [];
  const synthesize: CloudSynthesizer = async (request) => {
    calls.push(request);
    return {
      audio: Buffer.from('fake-mp3'),
      mimeType: 'audio/mpeg',
      durationMs: 900,
      alignment: testAlignment,
    };
  };
  return { calls, synthesize };
}

function fakeNormalizer() {
  const calls: Array<{ text: string; alignment: CharacterAlignment }> = [];
  const normalizeAlignment: AlignmentNormalizer = (text, alignment) => {
    calls.push({ text, alignment });
    return { sentences: SENTENCES, words: WORDS };
  };
  return { calls, normalizeAlignment };
}

describe('narrationContentHash', () => {
  it('is a pinned sha256 digest so cache keys stay stable across releases', () => {
    // Independent literal: sha256 of ["Hello there.","voice-1","model-1"].
    expect(narrationContentHash('Hello there.', 'voice-1', 'model-1')).toBe(
      'sha256:ff51e4188f05502a087c6714d7aa512b1b412f8465e02861d98fc0e06e5af5f3',
    );
    expect(narrationContentHash('Hello there.', 'voice-1', undefined)).toBe(
      'sha256:1843a769c17d9ec2cc74862639a1af53a2146527bd8aec587fcc8742d016ec1e',
    );
  });

  it('changes with the text, the voice, and the model', () => {
    const base = narrationContentHash(TEXT, VOICE, MODEL);
    expect(narrationContentHash(`${TEXT} changed`, VOICE, MODEL)).not.toBe(base);
    expect(narrationContentHash(TEXT, 'other-voice', MODEL)).not.toBe(base);
    expect(narrationContentHash(TEXT, VOICE, 'other-model')).not.toBe(base);
    expect(narrationContentHash(TEXT, VOICE, undefined)).not.toBe(base);
  });
});

describe('createNarrationService', () => {
  it('synthesizes, stores, and returns an uncached segment on a miss', async () => {
    const assetStore = createMemoryAssetStore();
    const { calls, synthesize } = fakeSynthesizer();
    const { normalizeAlignment } = fakeNormalizer();
    const fetchImpl = (async () => new Response()) as typeof fetch;
    const service = createNarrationService({
      assetStore,
      apiKey: 'test-key',
      voiceId: VOICE,
      modelId: MODEL,
      fetchImpl,
      synthesize,
      normalizeAlignment,
    });

    const result = await service.synthesize({ beatId: 'beat_1', text: TEXT });
    const contentHash = narrationContentHash(TEXT, VOICE, MODEL);

    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      apiKey: 'test-key',
      text: TEXT,
      voiceId: VOICE,
      modelId: MODEL,
      fetchImpl,
    });
    expect(result.cached).toBe(false);
    expect(result.segment).toEqual({
      beatId: 'beat_1',
      text: TEXT,
      sentences: SENTENCES,
      words: WORDS,
      audio: {
        contentHash,
        url: `/api/audio/${contentHash}`,
        mimeType: 'audio/mpeg',
        durationMs: 900,
      },
      provider: 'elevenlabs',
      voiceId: VOICE,
      modelId: MODEL,
      contentHash,
    });

    const stored = await assetStore.read(contentHash);
    expect(stored?.audio.toString()).toBe('fake-mp3');
    expect(stored?.record).toEqual({
      contentHash,
      mimeType: 'audio/mpeg',
      durationMs: 900,
      provider: 'elevenlabs',
      voiceId: VOICE,
      modelId: MODEL,
      alignment: testAlignment,
    });
  });

  it('serves a cache hit without calling the provider', async () => {
    const assetStore = createMemoryAssetStore();
    const contentHash = narrationContentHash(TEXT, VOICE, MODEL);
    assetStore.seed(contentHash, {
      audio: Buffer.from('cached-mp3'),
      record: {
        contentHash,
        mimeType: 'audio/mpeg',
        durationMs: 1200,
        provider: 'elevenlabs',
        voiceId: VOICE,
        modelId: MODEL,
        alignment: testAlignment,
      },
    });
    const { calls, synthesize } = fakeSynthesizer();
    const { calls: normalizeCalls, normalizeAlignment } = fakeNormalizer();
    const service = createNarrationService({
      assetStore,
      apiKey: 'test-key',
      voiceId: VOICE,
      modelId: MODEL,
      synthesize,
      normalizeAlignment,
    });

    const result = await service.synthesize({ beatId: 'beat_1', text: TEXT });

    expect(calls).toHaveLength(0);
    expect(normalizeCalls).toEqual([{ text: TEXT, alignment: testAlignment }]);
    expect(result.cached).toBe(true);
    expect(result.segment).toEqual({
      beatId: 'beat_1',
      text: TEXT,
      sentences: SENTENCES,
      words: WORDS,
      audio: {
        contentHash,
        url: `/api/audio/${contentHash}`,
        mimeType: 'audio/mpeg',
        durationMs: 1200,
      },
      provider: 'elevenlabs',
      voiceId: VOICE,
      modelId: MODEL,
      contentHash,
    });
  });

  it('serves a cache hit even when no provider key is configured', async () => {
    const assetStore = createMemoryAssetStore();
    const contentHash = narrationContentHash(TEXT, VOICE, MODEL);
    assetStore.seed(contentHash, {
      audio: Buffer.from('cached-mp3'),
      record: {
        contentHash,
        mimeType: 'audio/mpeg',
        durationMs: 1200,
        provider: 'elevenlabs',
        voiceId: VOICE,
        modelId: MODEL,
        alignment: testAlignment,
      },
    });
    const { calls, synthesize } = fakeSynthesizer();
    const service = createNarrationService({
      assetStore,
      voiceId: VOICE,
      modelId: MODEL,
      synthesize,
      normalizeAlignment: () => ({ sentences: SENTENCES, words: WORDS }),
    });

    const result = await service.synthesize({ beatId: 'beat_1', text: TEXT });

    expect(calls).toHaveLength(0);
    expect(result.cached).toBe(true);
  });

  it('throws NarrationUnavailableError for a miss without an API key', async () => {
    const assetStore = createMemoryAssetStore();
    const { calls, synthesize } = fakeSynthesizer();
    const service = createNarrationService({
      assetStore,
      voiceId: VOICE,
      modelId: MODEL,
      synthesize,
      normalizeAlignment: () => ({ sentences: SENTENCES, words: WORDS }),
    });

    await expect(service.synthesize({ beatId: 'beat_1', text: TEXT })).rejects.toThrow(
      NarrationUnavailableError,
    );
    await expect(service.synthesize({ beatId: 'beat_1', text: TEXT })).rejects.toThrow(
      /API key/,
    );
    expect(calls).toHaveLength(0);
  });

  it('throws NarrationUnavailableError when no voice id is available', async () => {
    const assetStore = createMemoryAssetStore();
    const { synthesize } = fakeSynthesizer();
    const service = createNarrationService({
      assetStore,
      apiKey: 'test-key',
      synthesize,
      normalizeAlignment: () => ({ sentences: SENTENCES, words: WORDS }),
    });

    await expect(service.synthesize({ beatId: 'beat_1', text: TEXT })).rejects.toThrow(
      NarrationUnavailableError,
    );
    await expect(service.synthesize({ beatId: 'beat_1', text: TEXT })).rejects.toThrow(
      /voice/,
    );
  });

  it('lets a per-call voice and model override the option defaults', async () => {
    const assetStore = createMemoryAssetStore();
    const { calls, synthesize } = fakeSynthesizer();
    const stored: Array<CharacterAlignment> = [];
    const service = createNarrationService({
      assetStore,
      apiKey: 'test-key',
      voiceId: VOICE,
      modelId: MODEL,
      synthesize,
      normalizeAlignment: (_text, alignment) => {
        stored.push(alignment);
        return { sentences: SENTENCES, words: WORDS };
      },
    });

    const result = await service.synthesize({
      beatId: 'beat_1',
      text: TEXT,
      voiceId: 'other-voice',
      modelId: 'other-model',
    });
    const contentHash = narrationContentHash(TEXT, 'other-voice', 'other-model');

    expect(calls[0]).toMatchObject({ voiceId: 'other-voice', modelId: 'other-model' });
    expect(result.segment).toMatchObject({
      voiceId: 'other-voice',
      modelId: 'other-model',
      contentHash,
    });
    await expect(assetStore.has(contentHash)).resolves.toBe(true);
  });

  it('synthesizes when the store reports a hash it cannot read back', async () => {
    const assetStore = createMemoryAssetStore();
    const contentHash = narrationContentHash(TEXT, VOICE, MODEL);
    assetStore.orphan(contentHash);
    const { calls, synthesize } = fakeSynthesizer();
    const service = createNarrationService({
      assetStore,
      apiKey: 'test-key',
      voiceId: VOICE,
      modelId: MODEL,
      synthesize,
      normalizeAlignment: () => ({ sentences: SENTENCES, words: WORDS }),
    });

    const result = await service.synthesize({ beatId: 'beat_1', text: TEXT });

    expect(calls).toHaveLength(1);
    expect(result.cached).toBe(false);
    await expect(assetStore.read(contentHash)).resolves.not.toBeNull();
  });
});
