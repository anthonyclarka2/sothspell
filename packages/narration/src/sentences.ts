/**
 * The sentence splitter is what makes browser narration predictable: each
 * sentence becomes one speech utterance, and the offsets let the UI highlight
 * the exact range of the beat text that is being spoken. Boundaries are
 * deliberately conservative around code narration — a dot between identifier
 * parts is not a sentence end.
 */

export interface Sentence {
  text: string;
  /** Inclusive JS string index of the first character of `text` in the source. */
  charStart: number;
  /** Exclusive JS string index one past the last character of `text`. */
  charEnd: number;
}

/**
 * Abbreviations that end in a dot but do not end a sentence. The set is small
 * on purpose: code narration uses very few of them, and a wrong entry merges
 * two real sentences.
 */
const ABBREVIATIONS = new Set([
  'e.g',
  'i.e',
  'etc',
  'vs',
  'cf',
  'approx',
  'fig',
  'dr',
  'mr',
  'mrs',
  'ms',
  'prof',
  'inc',
  'ltd',
]);

/** Closing marks that belong to the sentence they follow. */
const CLOSERS = new Set(['"', "'", '”', '’', ')', ']', '}']);

function isWordCharacter(character: string | undefined): boolean {
  return character !== undefined && /[\p{L}\p{N}.]/u.test(character);
}

/**
 * The dot at `index` ends a sentence only when the following character (after
 * any closing marks) is whitespace or the end of the text, the dot is the last
 * of a run, and the token it terminates is not a known abbreviation. This is
 * what keeps `CommentsService.create`, `1.2.3`, and `e.g.` intact while still
 * splitting `.  Next sentence`.
 */
function isSentenceDot(text: string, index: number): boolean {
  if (text[index + 1] === '.') {
    return false;
  }

  let next = index + 1;
  while (next < text.length && CLOSERS.has(text[next] ?? '')) {
    next += 1;
  }
  if (next < text.length && !/\s/.test(text[next] ?? '')) {
    return false;
  }

  let tokenStart = index;
  while (tokenStart > 0 && isWordCharacter(text[tokenStart - 1])) {
    tokenStart -= 1;
  }
  const token = text.slice(tokenStart, index).toLowerCase();

  return !ABBREVIATIONS.has(token);
}

function pushSentence(
  sentences: Sentence[],
  text: string,
  segmentStart: number,
  segmentEnd: number,
): void {
  const segment = text.slice(segmentStart, segmentEnd);
  const leading = segment.length - segment.trimStart().length;
  const trimmed = segment.trim();
  if (trimmed.length === 0) {
    return;
  }

  sentences.push({
    text: trimmed,
    charStart: segmentStart + leading,
    charEnd: segmentStart + leading + trimmed.length,
  });
}

/**
 * Splits narration text into sentences on `.`, `!`, `?`, and newlines. The
 * returned offsets point at the trimmed sentence inside the original text, so
 * `text.slice(charStart, charEnd)` always equals the sentence text.
 */
export function splitSentences(text: string): Sentence[] {
  const sentences: Sentence[] = [];
  let segmentStart = 0;
  let index = 0;

  while (index < text.length) {
    const character = text[index];

    if (character === '\n' || character === '\r') {
      pushSentence(sentences, text, segmentStart, index);
      while (index < text.length && (text[index] === '\n' || text[index] === '\r')) {
        index += 1;
      }
      segmentStart = index;
      continue;
    }

    if (character === '.' || character === '!' || character === '?') {
      if (character === '.' && !isSentenceDot(text, index)) {
        index += 1;
        continue;
      }

      let end = index + 1;
      while (end < text.length && CLOSERS.has(text[end] ?? '')) {
        end += 1;
      }
      if (end >= text.length || /\s/.test(text[end] ?? '')) {
        pushSentence(sentences, text, segmentStart, end);
        segmentStart = end;
        index = end;
        continue;
      }
    }

    index += 1;
  }

  pushSentence(sentences, text, segmentStart, text.length);
  return sentences;
}
