import type {
  CharacterAlignment,
  NarrationAssetStore,
  Sentence,
  SentenceTiming,
  WordTiming,
} from '@sothspell/narration';

/**
 * Narrow adapter between the API and `@sothspell/narration`.
 *
 * The provider client, the alignment normalizer, and the file asset store land
 * on the parallel `phase-5-a-narration` branch. This worktree cannot statically
 * import names that do not exist yet, so every touchpoint is resolved lazily
 * and mapped into the small shapes the API consumes. When the branches merge
 * this file is the single reconciliation point; the assumed package surface is
 * documented on `NarrationModule` below.
 *
 * Keeping the casts here means the service, the routes, and their tests never
 * depend on the package's exact signatures.
 */

/**
 * Cloud narration cannot run: no provider key or voice, or the narration
 * package is absent. Routes map this to a 503 so the player can fall back to
 * browser speech instead of failing the beat.
 */
export class NarrationUnavailableError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'NarrationUnavailableError';
  }
}

export interface CloudSynthesisRequest {
  apiKey: string;
  text: string;
  voiceId: string;
  modelId?: string;
  outputFormat?: string;
  beatId: string;
  fetchImpl?: typeof fetch;
}

/** Raw provider output. Alignment normalization happens outside the client. */
export interface CloudSynthesis {
  audio: Uint8Array;
  mimeType: string;
  durationMs: number;
  alignment: CharacterAlignment;
}

export type CloudSynthesizer = (
  request: CloudSynthesisRequest,
) => Promise<CloudSynthesis>;

export interface NarrationTimings {
  sentences: SentenceTiming[];
  words: WordTiming[];
}

export type AlignmentNormalizer = (
  text: string,
  alignment: CharacterAlignment,
) => NarrationTimings | Promise<NarrationTimings>;

/**
 * The assumed `@sothspell/narration` exports. Adjust one of these entries (and
 * the function that calls it) when the narration branch merges:
 *
 *   synthesizeElevenLabs({ apiKey, text, voiceId, modelId, fetchImpl })
 *     -> { audio, mimeType, durationMs, alignment }
 *   normalizeAlignment(text, alignment) -> { sentences, words }
 *   createFileNarrationStore({ root }) -> NarrationAssetStore
 */
interface NarrationModule {
  synthesizeElevenLabs?: (request: CloudSynthesisRequest) => Promise<{
    audio: Uint8Array;
    mimeType: string;
    record: { durationMs: number; alignment: CharacterAlignment };
  }>;
  normalizeAlignment?: (
    text: string,
    sentences: readonly Sentence[],
    alignment: CharacterAlignment,
  ) => NarrationTimings;
  splitSentences?: (text: string) => Sentence[];
  createFileNarrationStore?: (rootDirectory: string) => NarrationAssetStore;
}

async function loadNarrationModule(): Promise<NarrationModule> {
  try {
    return (await import('@sothspell/narration')) as unknown as NarrationModule;
  } catch (error) {
    throw new NarrationUnavailableError(
      'the @sothspell/narration package is unavailable',
      { cause: error },
    );
  }
}

/** Default provider seam: the ElevenLabs client from the narration package. */
export async function synthesizeWithNarrationPackage(
  request: CloudSynthesisRequest,
): Promise<CloudSynthesis> {
  const narration = await loadNarrationModule();
  if (typeof narration.synthesizeElevenLabs !== 'function') {
    throw new NarrationUnavailableError(
      '@sothspell/narration does not export synthesizeElevenLabs',
    );
  }
  const result = await narration.synthesizeElevenLabs(request);
  return {
    audio: result.audio,
    mimeType: result.mimeType,
    durationMs: result.record.durationMs,
    alignment: result.record.alignment,
  };
}

/** Default alignment seam: rebuild sentence and word timings from the record. */
export async function normalizeWithNarrationPackage(
  text: string,
  alignment: CharacterAlignment,
): Promise<NarrationTimings> {
  const narration = await loadNarrationModule();
  if (
    typeof narration.normalizeAlignment !== 'function' ||
    typeof narration.splitSentences !== 'function'
  ) {
    throw new NarrationUnavailableError(
      '@sothspell/narration does not export normalizeAlignment/splitSentences',
    );
  }
  return narration.normalizeAlignment(text, narration.splitSentences(text), alignment);
}

/**
 * The app is constructed in every API test, including ones that never touch
 * audio, so the real file store is loaded on first use rather than at
 * `createApp` time.
 */
export function createDeferredNarrationAssetStore(root: string): NarrationAssetStore {
  let pending: Promise<NarrationAssetStore> | null = null;
  const resolve = () => {
    pending ??= loadFileNarrationStore(root);
    return pending;
  };

  return {
    async has(contentHash) {
      return (await resolve()).has(contentHash);
    },
    async read(contentHash) {
      return (await resolve()).read(contentHash);
    },
    async write(contentHash, audio, record) {
      return (await resolve()).write(contentHash, audio, record);
    },
  };
}

async function loadFileNarrationStore(root: string): Promise<NarrationAssetStore> {
  const narration = await loadNarrationModule();
  if (typeof narration.createFileNarrationStore !== 'function') {
    throw new NarrationUnavailableError(
      '@sothspell/narration does not export createFileNarrationStore',
    );
  }
  return narration.createFileNarrationStore(root);
}
