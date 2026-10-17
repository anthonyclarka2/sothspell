import { describe, expect, it } from 'vitest';
import {
  activeSentenceIndex,
  captionCues,
  sentenceAt,
  wordAt,
} from './narration-sync.js';

const sentences = [
  { text: 'First.', startMs: 0, endMs: 1000, charStart: 0, charEnd: 6 },
  { text: 'Second.', startMs: 1200, endMs: 2000, charStart: 7, charEnd: 14 },
  { text: 'Third.', startMs: 2100, endMs: 3000, charStart: 15, charEnd: 21 },
];

const words = [
  { word: 'First', text: 'First', startMs: 0, endMs: 500, charStart: 0, charEnd: 5 },
  { word: 'Second', text: 'Second', startMs: 1200, endMs: 1700, charStart: 7, charEnd: 13 },
];

describe('narration synchronization', () => {
  it('finds the sentence covering a time, including gaps', () => {
    expect(sentenceAt(sentences, 0)?.text).toBe('First.');
    expect(sentenceAt(sentences, 1100)?.text).toBe('First.');
    expect(sentenceAt(sentences, 1300)?.text).toBe('Second.');
    expect(sentenceAt(sentences, 9999)?.text).toBe('Third.');
    expect(sentenceAt([], 0)).toBeNull();
  });

  it('finds the active word', () => {
    expect(wordAt(words, 0)?.word).toBe('First');
    expect(wordAt(words, 1250)?.word).toBe('Second');
    expect(wordAt([], 0)).toBeNull();
  });

  it('reports the active sentence index and caption cues', () => {
    expect(activeSentenceIndex(sentences, 500)).toBe(0);
    expect(activeSentenceIndex(sentences, 2500)).toBe(2);
    expect(activeSentenceIndex([], 0)).toBe(-1);
    expect(captionCues(sentences, 1300)).toEqual([
      { text: 'First.', active: false },
      { text: 'Second.', active: true },
      { text: 'Third.', active: false },
    ]);
  });
});
