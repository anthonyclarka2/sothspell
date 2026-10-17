import { describe, expect, it } from 'vitest';
import { estimateDurationMs, narrationContentHash } from './content.js';

describe('narrationContentHash', () => {
  it('returns a prefixed sha256 hex digest', () => {
    expect(narrationContentHash('Hello.', 'voice_a')).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it('is stable for the same inputs', () => {
    expect(narrationContentHash('Hello.', 'voice_a', 'model_a')).toBe(
      narrationContentHash('Hello.', 'voice_a', 'model_a'),
    );
  });

  it('changes when any input changes', () => {
    const base = narrationContentHash('Hello.', 'voice_a', 'model_a');

    expect(narrationContentHash('Hello!', 'voice_a', 'model_a')).not.toBe(base);
    expect(narrationContentHash('Hello.', 'voice_b', 'model_a')).not.toBe(base);
    expect(narrationContentHash('Hello.', 'voice_a', 'model_b')).not.toBe(base);
    expect(narrationContentHash('Hello.', 'voice_a')).not.toBe(base);
  });

  it('distinguishes inputs that would collide under plain concatenation', () => {
    expect(narrationContentHash('ab', 'c')).not.toBe(narrationContentHash('a', 'bc'));
    expect(narrationContentHash('a:b', 'c')).not.toBe(narrationContentHash('a', 'b:c'));
  });

  it('includes the output format in the key', () => {
    expect(narrationContentHash('Hello.', 'voice_a', 'model_a', 'pcm_16000')).not.toBe(
      narrationContentHash('Hello.', 'voice_a', 'model_a', 'mp3_44100_128'),
    );
  });
});

describe('estimateDurationMs', () => {
  it('returns zero for empty or whitespace-only text', () => {
    expect(estimateDurationMs('')).toBe(0);
    expect(estimateDurationMs('  \n ')).toBe(0);
  });

  it('estimates reading time at 160 words per minute plus pauses', () => {
    // 160 wpm is 375 ms per word; a sentence end adds 320 ms and a comma 150 ms.
    expect(estimateDurationMs('One.')).toBe(695);
    expect(estimateDurationMs('One two.')).toBe(1070);
    expect(estimateDurationMs('One, two.')).toBe(1220);
  });

  it('is deterministic and grows with more text', () => {
    const short = estimateDurationMs('A short sentence.');

    expect(estimateDurationMs('A short sentence.')).toBe(short);
    expect(estimateDurationMs('A short sentence. Another one.')).toBeGreaterThan(short);
  });
});
