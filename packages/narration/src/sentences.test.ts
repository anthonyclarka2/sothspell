import { describe, expect, it } from 'vitest';
import { splitSentences } from './sentences.js';

describe('splitSentences', () => {
  it('splits on sentence-ending punctuation and records trimmed offsets', () => {
    const text = 'Hello. World! How are you?';

    expect(splitSentences(text)).toEqual([
      { text: 'Hello.', charStart: 0, charEnd: 6 },
      { text: 'World!', charStart: 7, charEnd: 13 },
      { text: 'How are you?', charStart: 14, charEnd: 26 },
    ]);
  });

  it('splits on newlines and trims surrounding whitespace', () => {
    expect(splitSentences('First line\n  Second line  ')).toEqual([
      { text: 'First line', charStart: 0, charEnd: 10 },
      { text: 'Second line', charStart: 13, charEnd: 24 },
    ]);
  });

  it('keeps offsets that slice back to the sentence text', () => {
    const text = ' One.  Two!\n\nThree? ';

    for (const sentence of splitSentences(text)) {
      expect(text.slice(sentence.charStart, sentence.charEnd)).toBe(sentence.text);
    }
  });

  it('does not split on dots inside code identifiers and paths', () => {
    const text =
      'Call CommentsService.create and open packages/core/src/index.ts. The ATProto repo builds.';

    expect(splitSentences(text)).toEqual([
      {
        text: 'Call CommentsService.create and open packages/core/src/index.ts.',
        charStart: 0,
        charEnd: 64,
      },
      { text: 'The ATProto repo builds.', charStart: 65, charEnd: 89 },
    ]);
  });

  it('handles common abbreviations without splitting', () => {
    expect(splitSentences('Use a queue, e.g. RabbitMQ, for retries.')).toHaveLength(1);
    expect(splitSentences('Bring the wrapper, i.e. the SDK. Then call it.')).toEqual([
      { text: 'Bring the wrapper, i.e. the SDK.', charStart: 0, charEnd: 32 },
      { text: 'Then call it.', charStart: 33, charEnd: 46 },
    ]);
  });

  it('does not split decimal numbers or version strings', () => {
    expect(splitSentences('Version 1.2.3 fixed 3.14 rounding.')).toHaveLength(1);
  });

  it('splits after an ellipsis once', () => {
    expect(splitSentences('Wait... Then go.')).toEqual([
      { text: 'Wait...', charStart: 0, charEnd: 7 },
      { text: 'Then go.', charStart: 8, charEnd: 16 },
    ]);
  });

  it('keeps a closing quote with the sentence it closes', () => {
    expect(splitSentences('He said "go." Then he left.')).toEqual([
      { text: 'He said "go."', charStart: 0, charEnd: 13 },
      { text: 'Then he left.', charStart: 14, charEnd: 27 },
    ]);
  });

  it('returns nothing for empty or whitespace-only text', () => {
    expect(splitSentences('')).toEqual([]);
    expect(splitSentences('   \n \t ')).toEqual([]);
  });

  it('treats text without terminal punctuation as one sentence', () => {
    expect(splitSentences('just one clause')).toEqual([
      { text: 'just one clause', charStart: 0, charEnd: 15 },
    ]);
  });

  it('keeps a long run of text without punctuation together', () => {
    const text = `${'word '.repeat(200)}end`;

    expect(splitSentences(text)).toHaveLength(1);
    expect(splitSentences(text)[0]?.charEnd).toBe(text.length);
  });
});
