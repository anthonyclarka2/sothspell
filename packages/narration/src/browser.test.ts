import { describe, expect, it } from 'vitest';
import { createBrowserNarration } from './browser.js';
import type {
  BrowserNarration,
  BrowserSpeechEvent,
  BrowserUtterance,
} from './browser.js';

class FakeUtterance implements BrowserUtterance {
  text: string;
  rate?: number;
  pitch?: number;
  onboundary?: (event: BrowserSpeechEvent) => void;
  onend?: () => void;
  onerror?: (event: BrowserSpeechEvent) => void;

  constructor(text: string) {
    this.text = text;
  }
}

interface Harness {
  narration: BrowserNarration;
  spoken: BrowserUtterance[];
  sentenceIndices: number[];
  wordOffsets: number[];
  cancelCount: () => number;
  advance: (ms: number) => void;
}

function createHarness(text: string): Harness {
  const spoken: BrowserUtterance[] = [];
  const sentenceIndices: number[] = [];
  const wordOffsets: number[] = [];
  let cancelCount = 0;
  let nowMs = 0;

  const narration = createBrowserNarration({
    text,
    speechSupported: true,
    createUtterance: (utteranceText) => new FakeUtterance(utteranceText),
    synthesize: (utterance) => {
      spoken.push(utterance);
    },
    cancel: () => {
      cancelCount += 1;
    },
    now: () => nowMs,
    onSentence: (index) => sentenceIndices.push(index),
    onWord: (charIndex) => wordOffsets.push(charIndex),
  });

  return {
    narration,
    spoken,
    sentenceIndices,
    wordOffsets,
    cancelCount: () => cancelCount,
    advance: (ms) => {
      nowMs += ms;
    },
  };
}

describe('createBrowserNarration', () => {
  it('speaks sentences in order and completes after the last one', () => {
    const harness = createHarness('First one. Second one.');

    expect(harness.narration.getSnapshot()).toEqual({
      status: 'idle',
      sentenceIndex: 0,
      error: null,
    });

    harness.narration.play();
    expect(harness.narration.getSnapshot().status).toBe('speaking');
    expect(harness.spoken.map((utterance) => utterance.text)).toEqual(['First one.']);
    expect(harness.sentenceIndices).toEqual([0]);

    harness.spoken[0]?.onend?.();
    expect(harness.spoken.map((utterance) => utterance.text)).toEqual([
      'First one.',
      'Second one.',
    ]);
    expect(harness.sentenceIndices).toEqual([0, 1]);

    harness.spoken[1]?.onend?.();
    expect(harness.narration.getSnapshot().status).toBe('completed');
    expect(harness.spoken).toHaveLength(2);
  });

  it('reports word boundaries as offsets into the narration text', () => {
    const harness = createHarness('First one. Second one.');
    harness.narration.play();

    harness.spoken[0]?.onboundary?.({ charIndex: 6 });
    harness.spoken[0]?.onend?.();
    harness.spoken[1]?.onboundary?.({ charIndex: 3 });

    expect(harness.wordOffsets).toEqual([6, 14]);
  });

  it('starts at a requested sentence', () => {
    const harness = createHarness('First one. Second one.');

    harness.narration.play(1);

    expect(harness.spoken.map((utterance) => utterance.text)).toEqual(['Second one.']);
    expect(harness.sentenceIndices).toEqual([1]);
    expect(harness.narration.getSnapshot().sentenceIndex).toBe(1);
  });

  it('pause cancels the current utterance and resume restarts that sentence', () => {
    const harness = createHarness('First one. Second one.');
    harness.narration.play();
    harness.advance(1000);
    expect(harness.narration.currentTimeMs()).toBe(1000);

    harness.narration.pause();
    expect(harness.narration.getSnapshot().status).toBe('paused');
    expect(harness.cancelCount()).toBe(1);
    expect(harness.narration.currentTimeMs()).toBe(1000);

    harness.advance(500);
    expect(harness.narration.currentTimeMs()).toBe(1000);

    // Events from the canceled utterance must not advance playback.
    harness.spoken[0]?.onend?.();
    harness.spoken[0]?.onboundary?.({ charIndex: 2 });
    expect(harness.spoken).toHaveLength(1);
    expect(harness.wordOffsets).toEqual([]);

    harness.narration.resume();
    expect(harness.narration.getSnapshot().status).toBe('speaking');
    expect(harness.spoken.map((utterance) => utterance.text)).toEqual([
      'First one.',
      'First one.',
    ]);
    expect(harness.sentenceIndices).toEqual([0, 0]);
    expect(harness.narration.currentTimeMs()).toBe(1000);

    harness.advance(250);
    expect(harness.narration.currentTimeMs()).toBe(1250);

    harness.spoken[1]?.onend?.();
    expect(harness.spoken[2]?.text).toBe('Second one.');
  });

  it('resume without a pause does nothing and pause while idle is inert', () => {
    const harness = createHarness('First one. Second one.');

    harness.narration.pause();
    harness.narration.resume();
    expect(harness.narration.getSnapshot().status).toBe('idle');
    expect(harness.cancelCount()).toBe(0);

    harness.narration.play();
    harness.narration.resume();
    expect(harness.spoken).toHaveLength(1);
  });

  it('stop cancels, resets to the first sentence, and ignores stale events', () => {
    const harness = createHarness('First one. Second one.');
    harness.narration.play();
    harness.spoken[0]?.onend?.();
    harness.advance(300);

    harness.narration.stop();

    expect(harness.narration.getSnapshot()).toEqual({
      status: 'stopped',
      sentenceIndex: 0,
      error: null,
    });
    expect(harness.cancelCount()).toBe(1);
    expect(harness.narration.currentTimeMs()).toBe(0);

    harness.spoken[1]?.onend?.();
    expect(harness.spoken).toHaveLength(2);

    harness.narration.play();
    expect(harness.spoken[2]?.text).toBe('First one.');
  });

  it('ignores canceled errors and reports real speech errors', () => {
    const harness = createHarness('First one. Second one.');
    harness.narration.play();

    harness.spoken[0]?.onerror?.({ error: 'canceled' });
    expect(harness.narration.getSnapshot().status).toBe('speaking');

    harness.spoken[0]?.onerror?.({ error: 'synthesis-failed' });
    expect(harness.narration.getSnapshot().status).toBe('error');
    expect(harness.narration.getSnapshot().error).toContain('synthesis-failed');

    harness.narration.play();
    expect(harness.spoken).toHaveLength(1);
  });

  it('does not advance twice when an end event is delivered twice', () => {
    const harness = createHarness('First one. Second one. Third one.');
    harness.narration.play();

    harness.spoken[0]?.onend?.();
    harness.spoken[0]?.onend?.();

    expect(harness.spoken.map((utterance) => utterance.text)).toEqual([
      'First one.',
      'Second one.',
    ]);
  });

  it('returns a readable error state when speech synthesis is unsupported', () => {
    const narration = createBrowserNarration({ text: 'Hello.', speechSupported: false });

    expect(narration.getSnapshot().status).toBe('error');
    expect(narration.getSnapshot().error).toMatch(/not available/i);

    expect(() => narration.play()).not.toThrow();
    expect(narration.getSnapshot().status).toBe('error');
    expect(narration.currentTimeMs()).toBe(0);
  });

  it('completes immediately when there is nothing to speak', () => {
    const harness = createHarness('');

    harness.narration.play();

    expect(harness.narration.getSnapshot().status).toBe('completed');
    expect(harness.spoken).toEqual([]);
  });

  it('applies the configured rate and pitch to every utterance', () => {
    const spoken: BrowserUtterance[] = [];
    const narration = createBrowserNarration({
      text: 'One. Two.',
      rate: 1.25,
      pitch: 0.9,
      speechSupported: true,
      createUtterance: (text) => new FakeUtterance(text),
      synthesize: (utterance) => {
        spoken.push(utterance);
      },
      cancel: () => {},
      now: () => 0,
    });

    narration.play();

    expect(spoken[0]?.rate).toBe(1.25);
    expect(spoken[0]?.pitch).toBe(0.9);
  });
});
