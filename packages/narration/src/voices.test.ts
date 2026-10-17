import { describe, expect, it } from 'vitest';
import {
  ELEVENLABS_MULTILINGUAL_MODEL,
  languageOf,
  narrationModelForLocale,
  pickBrowserVoice,
  voicesForLocale,
} from './voices.js';

const voices = [
  { name: 'Samantha', lang: 'en-US' },
  { name: 'Paulina', lang: 'es-MX' },
  { name: 'Monica', lang: 'es-ES' },
  { name: 'Maged', lang: 'ar-SA' },
  { name: 'Joana', lang: 'pt-PT' },
  { name: 'Luciana', lang: 'pt-BR' },
];

describe('languageOf', () => {
  it('returns the primary subtag', () => {
    expect(languageOf('es')).toBe('es');
    expect(languageOf('pt-BR')).toBe('pt');
    expect(languageOf('zh-Hant-TW')).toBe('zh');
  });
});

describe('voicesForLocale', () => {
  it('keeps voices whose language matches the locale', () => {
    expect(voicesForLocale(voices, 'es').map((voice) => voice.name)).toEqual([
      'Paulina',
      'Monica',
    ]);
  });

  it('prefers an exact region match over a language-only match', () => {
    expect(voicesForLocale(voices, 'pt-BR').map((voice) => voice.name)).toEqual([
      'Luciana',
      'Joana',
    ]);
  });

  it('is case-insensitive', () => {
    expect(voicesForLocale(voices, 'AR').map((voice) => voice.name)).toEqual(['Maged']);
  });

  it('returns no voices when nothing matches', () => {
    expect(voicesForLocale(voices, 'ja')).toEqual([]);
  });
});

describe('pickBrowserVoice', () => {
  it('returns the best match or null', () => {
    expect(pickBrowserVoice(voices, 'es')?.name).toBe('Paulina');
    expect(pickBrowserVoice(voices, 'ja')).toBeNull();
  });
});

describe('narrationModelForLocale', () => {
  it('uses the ElevenLabs multilingual model when nothing is configured', () => {
    expect(narrationModelForLocale('es')).toBe(ELEVENLABS_MULTILINGUAL_MODEL);
    expect(narrationModelForLocale('ar')).toBe(ELEVENLABS_MULTILINGUAL_MODEL);
  });

  it('keeps an explicitly configured model', () => {
    expect(narrationModelForLocale('es', 'eleven_turbo_v2_5')).toBe('eleven_turbo_v2_5');
  });
});
