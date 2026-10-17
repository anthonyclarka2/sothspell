/**
 * Shared narration contract. The player, the web adapters, and the API all
 * speak this shape; the narration package owns the implementation, the API owns
 * asset storage, and the player owns playback.
 */

export type NarrationProvider = 'browser' | 'elevenlabs';

/** A timed range of the narration text. Offsets are JS string indices. */
export interface TimedSpan {
  text: string;
  startMs: number;
  endMs: number;
  charStart: number;
  charEnd: number;
}

export type SentenceTiming = TimedSpan;

export interface WordTiming extends TimedSpan {
  word: string;
}

export interface NarrationAudio {
  contentHash: string;
  url: string;
  mimeType: string;
  durationMs: number;
}

export interface NarrationSegment {
  beatId: string;
  text: string;
  sentences: SentenceTiming[];
  words: WordTiming[];
  audio?: NarrationAudio;
  provider: NarrationProvider;
  voiceId: string;
  modelId?: string;
  contentHash: string;
}

export interface NarrationSynthesisRequest {
  text: string;
  voiceId: string;
  modelId?: string;
  beatId: string;
  signal?: AbortSignal;
}

export interface NarrationSynthesisResult {
  segment: NarrationSegment;
  cached: boolean;
}

/**
 * Character-level alignment returned by a cloud provider. The narration
 * package normalizes this to sentence and word timings.
 */
export interface CharacterAlignment {
  characters: string[];
  characterStartTimesSeconds: number[];
  characterEndTimesSeconds: number[];
}

export interface NarrationAssetRecord {
  contentHash: string;
  mimeType: string;
  durationMs: number;
  provider: Exclude<NarrationProvider, 'browser'>;
  voiceId: string;
  modelId?: string;
  alignment: CharacterAlignment;
}

/**
 * Where generated audio lives. The API implements this over the local
 * SOTHSPELL_HOME; tests use an in-memory adapter.
 */
export interface NarrationAssetStore {
  has(contentHash: string): Promise<boolean>;
  read(
    contentHash: string,
  ): Promise<{ audio: Buffer; record: NarrationAssetRecord } | null>;
  write(contentHash: string, audio: Buffer, record: NarrationAssetRecord): Promise<void>;
}
