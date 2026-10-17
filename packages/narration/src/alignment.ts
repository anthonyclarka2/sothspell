import { estimateDurationMs } from './content.js';
import type { Sentence } from './sentences.js';
import type { CharacterAlignment, SentenceTiming, WordTiming } from './types.js';

/**
 * Cloud providers return character timings for the text they actually spoke,
 * which may differ in length from the displayed beat text after normalization.
 * This module is the single place that turns those provider-specific timings
 * into the sentence and word spans the player highlights, including a
 * deterministic fallback when no timings are available at all.
 */

export interface NormalizedAlignment {
  sentences: SentenceTiming[];
  words: WordTiming[];
}

interface TimingSource {
  startSeconds(index: number): number;
  endSeconds(index: number): number;
  /** Maps a text offset to the alignment index that covers it. */
  indexFor(textOffset: number): number;
}

function proportionalIndex(
  offset: number,
  textLength: number,
  alignmentLength: number,
): number {
  if (textLength <= 0 || alignmentLength <= 0) {
    return -1;
  }
  // Alignment can be shorter than the text because the provider normalizes
  // identifiers and punctuation; scaling keeps the timing order stable.
  return Math.min(
    alignmentLength - 1,
    Math.floor((offset * alignmentLength) / textLength),
  );
}

function sourceFromAlignment(
  alignment: CharacterAlignment,
  textLength: number,
): TimingSource | null {
  const length = Math.min(
    alignment.characters.length,
    alignment.characterStartTimesSeconds.length,
    alignment.characterEndTimesSeconds.length,
  );
  if (length === 0) {
    return null;
  }

  return {
    startSeconds: (index) => alignment.characterStartTimesSeconds[index] ?? 0,
    endSeconds: (index) => alignment.characterEndTimesSeconds[index] ?? 0,
    indexFor: (offset) => proportionalIndex(offset, textLength, length),
  };
}

function startMsOf(source: TimingSource, charStart: number): number {
  const index = source.indexFor(charStart);
  return index < 0 ? 0 : Math.round(source.startSeconds(index) * 1000);
}

function endMsOf(source: TimingSource, charEnd: number): number {
  const index = source.indexFor(Math.max(charEnd - 1, 0));
  return index < 0 ? 0 : Math.round(source.endSeconds(index) * 1000);
}

/**
 * Fallback timings when the provider supplied no usable alignment: the reading
 * estimate is spread over the text by character position, which keeps spans
 * ordered, gap-free, and ending exactly at the total estimate.
 */
function estimateSpan(
  totalMs: number,
  textLength: number,
  charStart: number,
  charEnd: number,
): { startMs: number; endMs: number } {
  return {
    startMs: Math.round((totalMs * charStart) / textLength),
    endMs: Math.round((totalMs * charEnd) / textLength),
  };
}

/**
 * Normalizes provider character alignment into sentence and word timings whose
 * offsets always point into `text`. Words split on whitespace; a word's timing
 * comes from its first and last character, and a sentence's from its first and
 * last character. With no alignment data the reading estimate fills in.
 */
export function normalizeAlignment(
  text: string,
  sentences: readonly Sentence[],
  alignment: CharacterAlignment,
): NormalizedAlignment {
  if (text.length === 0) {
    return { sentences: [], words: [] };
  }

  const source = sourceFromAlignment(alignment, text.length);
  const totalMs = source ? 0 : estimateDurationMs(text);

  const timingFor = (charStart: number, charEnd: number) => {
    if (source) {
      const startMs = startMsOf(source, charStart);
      return { startMs, endMs: Math.max(startMs, endMsOf(source, charEnd)) };
    }
    return estimateSpan(totalMs, text.length, charStart, charEnd);
  };

  const sentenceTimings: SentenceTiming[] = sentences.map((sentence) => ({
    text: sentence.text,
    charStart: sentence.charStart,
    charEnd: sentence.charEnd,
    ...timingFor(sentence.charStart, sentence.charEnd),
  }));

  const words: WordTiming[] = [];
  for (const match of text.matchAll(/\S+/g)) {
    const word = match[0];
    const charStart = match.index;
    const charEnd = charStart + word.length;
    words.push({
      text: word,
      word,
      charStart,
      charEnd,
      ...timingFor(charStart, charEnd),
    });
  }

  return { sentences: sentenceTimings, words };
}
