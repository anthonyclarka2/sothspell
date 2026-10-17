import { describe, expect, it } from 'vitest';
import { normalizeAlignment } from './alignment.js';
import { splitSentences } from './sentences.js';
import type { CharacterAlignment } from './types.js';

/** Builds a character alignment where every character lasts `msPerCharacter`. */
function alignmentFor(text: string, msPerCharacter: number): CharacterAlignment {
  const characters = text.split('');

  return {
    characters,
    characterStartTimesSeconds: characters.map(
      (_, index) => (index * msPerCharacter) / 1000,
    ),
    characterEndTimesSeconds: characters.map(
      (_, index) => ((index + 1) * msPerCharacter) / 1000,
    ),
  };
}

const emptyAlignment: CharacterAlignment = {
  characters: [],
  characterStartTimesSeconds: [],
  characterEndTimesSeconds: [],
};

describe('normalizeAlignment', () => {
  it('maps sentence timings from the first and last characters of each sentence', () => {
    const text = 'First one. Second one.';
    const alignment = alignmentFor(text, 20);

    const { sentences } = normalizeAlignment(text, splitSentences(text), alignment);

    expect(sentences).toEqual([
      {
        text: 'First one.',
        charStart: 0,
        charEnd: 10,
        startMs: 0,
        endMs: 200,
      },
      {
        text: 'Second one.',
        charStart: 11,
        charEnd: 22,
        startMs: 220,
        endMs: 440,
      },
    ]);
  });

  it('derives word timings from whitespace boundaries and character times', () => {
    const text = 'First one. Second one.';
    const alignment = alignmentFor(text, 20);

    const { words } = normalizeAlignment(text, splitSentences(text), alignment);

    expect(words).toEqual([
      {
        text: 'First',
        word: 'First',
        charStart: 0,
        charEnd: 5,
        startMs: 0,
        endMs: 100,
      },
      {
        text: 'one.',
        word: 'one.',
        charStart: 6,
        charEnd: 10,
        startMs: 120,
        endMs: 200,
      },
      {
        text: 'Second',
        word: 'Second',
        charStart: 11,
        charEnd: 17,
        startMs: 220,
        endMs: 340,
      },
      {
        text: 'one.',
        word: 'one.',
        charStart: 18,
        charEnd: 22,
        startMs: 360,
        endMs: 440,
      },
    ]);
  });

  it('maps mismatched alignment lengths proportionally', () => {
    // 12 text characters against 6 aligned characters, 100 ms each:
    // text offset 0 -> aligned 0, text offset 4 -> aligned 2,
    // text offset 6 -> aligned 3, text offset 11 -> aligned 5.
    const text = 'Hello world.';
    const alignment = alignmentFor('Hello!', 100);

    expect(alignment.characters).toHaveLength(6);

    const { sentences, words } = normalizeAlignment(
      text,
      splitSentences(text),
      alignment,
    );

    expect(sentences).toEqual([
      { text: 'Hello world.', charStart: 0, charEnd: 12, startMs: 0, endMs: 600 },
    ]);
    expect(words).toEqual([
      {
        text: 'Hello',
        word: 'Hello',
        charStart: 0,
        charEnd: 5,
        startMs: 0,
        endMs: 300,
      },
      {
        text: 'world.',
        word: 'world.',
        charStart: 6,
        charEnd: 12,
        startMs: 300,
        endMs: 600,
      },
    ]);
  });

  it('falls back to the reading-speed estimate when alignment is empty', () => {
    // "Hello world." is two words: 2 * 375 ms + one sentence pause of 320 ms
    // = 1070 ms, distributed over the 12 character positions.
    const text = 'Hello world.';

    const { sentences, words } = normalizeAlignment(
      text,
      splitSentences(text),
      emptyAlignment,
    );

    expect(sentences).toEqual([
      { text: 'Hello world.', charStart: 0, charEnd: 12, startMs: 0, endMs: 1070 },
    ]);
    expect(words).toEqual([
      {
        text: 'Hello',
        word: 'Hello',
        charStart: 0,
        charEnd: 5,
        startMs: 0,
        endMs: 446,
      },
      {
        text: 'world.',
        word: 'world.',
        charStart: 6,
        charEnd: 12,
        startMs: 535,
        endMs: 1070,
      },
    ]);
  });

  it('returns no timings for zero-length text', () => {
    expect(normalizeAlignment('', [], emptyAlignment)).toEqual({
      sentences: [],
      words: [],
    });
  });

  it('still produces word timings when the caller supplies no sentence list', () => {
    const text = 'Hi there.';
    const { sentences, words } = normalizeAlignment(text, [], alignmentFor(text, 10));

    expect(sentences).toEqual([]);
    expect(words.map((word) => word.word)).toEqual(['Hi', 'there.']);
  });

  it('keeps timings ordered and inside the alignment range', () => {
    const text = 'One two three. Four five.';
    const alignment = alignmentFor(text, 15);

    const { sentences, words } = normalizeAlignment(
      text,
      splitSentences(text),
      alignment,
    );

    for (const timing of [...sentences, ...words]) {
      expect(timing.startMs).toBeLessThanOrEqual(timing.endMs);
      expect(timing.endMs).toBeLessThanOrEqual(15 * text.length);
    }
    for (let index = 1; index < words.length; index += 1) {
      expect(words[index]?.startMs).toBeGreaterThanOrEqual(words[index - 1]?.endMs ?? 0);
    }
  });
});
