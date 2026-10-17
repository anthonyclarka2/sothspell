import { createHash } from 'node:crypto';
import type {
  NarrationAssetRecord,
  NarrationAssetStore,
  NarrationSegment,
  NarrationSynthesisResult,
} from '@sothspell/narration';
import { z } from 'zod';
import {
  NarrationUnavailableError,
  normalizeWithNarrationPackage,
  synthesizeWithNarrationPackage,
  type AlignmentNormalizer,
  type CloudSynthesizer,
  type NarrationTimings,
} from './narration-bridge.js';

export { NarrationUnavailableError } from './narration-bridge.js';
export type {
  AlignmentNormalizer,
  CloudSynthesis,
  CloudSynthesisRequest,
  CloudSynthesizer,
  NarrationTimings,
} from './narration-bridge.js';

export const NarrationBodySchema = z.object({
  beatId: z.string().min(1).max(128),
  text: z.string().min(1).max(10_000),
  voiceId: z.string().min(1).max(128).optional(),
  modelId: z.string().min(1).max(128).optional(),
});

export type NarrationBody = z.infer<typeof NarrationBodySchema>;

/**
 * Content address for a generated clip. Voice and model are part of the key
 * because the same text in a different voice must not collide in the cache,
 * and the canonical JSON form keeps the digest stable across releases. The
 * `sha256:` prefix is also the audio route's path format.
 */
export function narrationContentHash(
  text: string,
  voiceId: string,
  modelId: string | undefined,
): string {
  const canonical = JSON.stringify([text, voiceId, modelId ?? null]);
  return `sha256:${createHash('sha256').update(canonical).digest('hex')}`;
}

export interface NarrationSynthesisInput {
  beatId: string;
  text: string;
  voiceId?: string;
  modelId?: string;
}

export interface NarrationService {
  synthesize(input: NarrationSynthesisInput): Promise<NarrationSynthesisResult>;
}

export interface NarrationServiceOptions {
  assetStore: NarrationAssetStore;
  apiKey?: string;
  voiceId?: string;
  modelId?: string;
  fetchImpl?: typeof fetch;
  /** Provider seam. Tests inject a fake; production uses the package client. */
  synthesize?: CloudSynthesizer;
  /**
   * Alignment seam. A cache hit must rebuild sentence and word timings from the
   * stored alignment without a provider call, so normalization cannot live
   * behind the provider seam.
   */
  normalizeAlignment?: AlignmentNormalizer;
}

interface SegmentInput {
  beatId: string;
  text: string;
  contentHash: string;
  voiceId: string;
  modelId?: string;
  mimeType: string;
  durationMs: number;
  timings: NarrationTimings;
}

function buildSegment(input: SegmentInput): NarrationSegment {
  return {
    beatId: input.beatId,
    text: input.text,
    sentences: input.timings.sentences,
    words: input.timings.words,
    audio: {
      contentHash: input.contentHash,
      url: `/api/audio/${input.contentHash}`,
      mimeType: input.mimeType,
      durationMs: input.durationMs,
    },
    provider: 'elevenlabs',
    voiceId: input.voiceId,
    modelId: input.modelId,
    contentHash: input.contentHash,
  };
}

/**
 * The API's narration orchestration: probe the content-addressed store, call
 * the provider only on a miss, and write the audio beside its alignment record
 * so a later run replays the clip without paying the provider again.
 */
export function createNarrationService(
  options: NarrationServiceOptions,
): NarrationService {
  const synthesize = options.synthesize ?? synthesizeWithNarrationPackage;
  const normalize = options.normalizeAlignment ?? normalizeWithNarrationPackage;

  return {
    async synthesize(input) {
      const voiceId = input.voiceId ?? options.voiceId;
      if (!voiceId) {
        throw new NarrationUnavailableError(
          'cloud narration needs a voice id; pass voiceId or set ELEVENLABS_VOICE_ID',
        );
      }
      const modelId = input.modelId ?? options.modelId;
      const contentHash = narrationContentHash(input.text, voiceId, modelId);

      const cached = (await options.assetStore.has(contentHash))
        ? await options.assetStore.read(contentHash)
        : null;

      if (cached) {
        const timings = await normalize(input.text, cached.record.alignment);
        return {
          cached: true,
          segment: buildSegment({
            beatId: input.beatId,
            text: input.text,
            contentHash,
            voiceId: cached.record.voiceId,
            modelId: cached.record.modelId,
            mimeType: cached.record.mimeType,
            durationMs: cached.record.durationMs,
            timings,
          }),
        };
      }

      // A clip that is already cached stays playable without a key; only a
      // provider call needs one.
      if (!options.apiKey) {
        throw new NarrationUnavailableError(
          'cloud narration needs an ElevenLabs API key; set ELEVENLABS_API_KEY',
        );
      }

      const synthesized = await synthesize({
        apiKey: options.apiKey,
        text: input.text,
        voiceId,
        modelId,
        beatId: input.beatId,
        fetchImpl: options.fetchImpl,
      });
      const timings = await normalize(input.text, synthesized.alignment);
      const record: NarrationAssetRecord = {
        contentHash,
        mimeType: synthesized.mimeType,
        durationMs: synthesized.durationMs,
        provider: 'elevenlabs',
        voiceId,
        modelId,
        alignment: synthesized.alignment,
      };
      await options.assetStore.write(contentHash, Buffer.from(synthesized.audio), record);

      return {
        cached: false,
        segment: buildSegment({
          beatId: input.beatId,
          text: input.text,
          contentHash,
          voiceId,
          modelId,
          mimeType: synthesized.mimeType,
          durationMs: synthesized.durationMs,
          timings,
        }),
      };
    },
  };
}
