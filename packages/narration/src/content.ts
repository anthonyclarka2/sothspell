import { createHash } from 'node:crypto';

/**
 * Duration and cache-key helpers for narration. Both are deliberately pure and
 * deterministic: the same beat text must produce the same cache key on every
 * machine, and read mode must auto-advance at a repeatable speed without audio.
 */

/** Assumed narration pace for read mode when no audio timing exists. */
const WORDS_PER_MINUTE = 160;
const MS_PER_WORD = 60_000 / WORDS_PER_MINUTE;
/** A full stop is a breath; a comma is a shorter one. */
const SENTENCE_PAUSE_MS = 320;
const CLAUSE_PAUSE_MS = 150;

/**
 * Cache key for a cloud narration asset. The inputs are encoded as a JSON array
 * so that field boundaries cannot collide (`["ab","c"]` and `["a","bc"]` hash
 * differently). The provider's output format is part of the key because the
 * same words in a different format are a different asset.
 */
export function narrationContentHash(
  text: string,
  voiceId: string,
  modelId?: string,
  outputFormat = 'mp3_44100_128',
): string {
  const material = JSON.stringify([text, voiceId, modelId ?? null, outputFormat]);
  return `sha256:${createHash('sha256').update(material, 'utf8').digest('hex')}`;
}

/**
 * Deterministic reading-speed estimate used by read mode and by alignment
 * fallback when a provider returns no character timings. Words carry the bulk
 * of the time; punctuation adds short pauses so comma-heavy prose is not
 * measured at the same pace as a word list.
 */
export function estimateDurationMs(text: string): number {
  const words = text.match(/\S+/g);
  if (!words || words.length === 0) {
    return 0;
  }

  const sentenceEndings = text.match(/[.!?](?=\s|$)/g)?.length ?? 0;
  const clauses = text.match(/[,;:]/g)?.length ?? 0;

  return Math.round(
    words.length * MS_PER_WORD +
      sentenceEndings * SENTENCE_PAUSE_MS +
      clauses * CLAUSE_PAUSE_MS,
  );
}
