import type { SentenceTiming, WordTiming } from '@sothspell/narration';

/**
 * Returns the sentence covering `timeMs`, or the nearest preceding sentence
 * when the time falls in a gap. Returns null when there are no sentences.
 */
export function sentenceAt(
  sentences: readonly SentenceTiming[],
  timeMs: number,
): SentenceTiming | null {
  if (sentences.length === 0) {
    return null;
  }
  let active = sentences[0] ?? null;
  for (const sentence of sentences) {
    if (sentence.startMs <= timeMs) {
      active = sentence;
    } else {
      break;
    }
  }
  return active;
}

export function wordAt(words: readonly WordTiming[], timeMs: number): WordTiming | null {
  if (words.length === 0) {
    return null;
  }
  let active = words[0] ?? null;
  for (const word of words) {
    if (word.startMs <= timeMs) {
      active = word;
    } else {
      break;
    }
  }
  return active;
}

export function activeSentenceIndex(
  sentences: readonly SentenceTiming[],
  timeMs: number,
): number {
  if (sentences.length === 0) {
    return -1;
  }
  let index = 0;
  for (let position = 0; position < sentences.length; position += 1) {
    const sentence = sentences[position];
    if (sentence && sentence.startMs <= timeMs) {
      index = position;
    } else {
      break;
    }
  }
  return index;
}

/**
 * Sentence-level text markup for captions. The player can render this without
 * duplicating the timing rules.
 */
export interface CaptionCue {
  text: string;
  active: boolean;
}

export function captionCues(
  sentences: readonly SentenceTiming[],
  timeMs: number,
): CaptionCue[] {
  const index = activeSentenceIndex(sentences, timeMs);
  return sentences.map((sentence, position) => ({
    text: sentence.text,
    active: position === index,
  }));
}
