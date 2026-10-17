/**
 * Voice selection by locale. The browser speech API exposes a flat voice list
 * with language tags; a tour's locale must pick the closest voice instead of
 * leaving the browser to guess, and cloud narration must use a multilingual
 * model for non-source locales.
 */

export const ELEVENLABS_MULTILINGUAL_MODEL = 'eleven_multilingual_v2';

export interface NarrationVoiceLike {
  lang: string;
  name?: string;
  voiceURI?: string;
  default?: boolean;
}

/** The primary subtag of a locale tag: `pt-BR` becomes `pt`. */
export function languageOf(locale: string): string {
  return locale.split('-')[0]?.toLowerCase() ?? '';
}

function matches(voiceLang: string, locale: string): boolean {
  const normalizedVoice = voiceLang.toLowerCase();
  const normalizedLocale = locale.toLowerCase();
  return (
    normalizedVoice === normalizedLocale ||
    normalizedVoice.split('-')[0] === languageOf(normalizedLocale)
  );
}

/**
 * Filters a voice list to the voices that speak the locale, with exact region
 * matches (`pt-BR` for `pt-BR`) before language-only matches (`pt-PT`), and the
 * list's own order preserved inside each group.
 */
export function voicesForLocale<T extends NarrationVoiceLike>(
  voices: readonly T[],
  locale: string,
): T[] {
  const normalizedLocale = locale.toLowerCase();
  const exact: T[] = [];
  const language: T[] = [];

  for (const voice of voices) {
    if (!matches(voice.lang, normalizedLocale)) {
      continue;
    }
    if (voice.lang.toLowerCase() === normalizedLocale) {
      exact.push(voice);
    } else {
      language.push(voice);
    }
  }

  return [...exact, ...language];
}

/** The best browser voice for a locale, or null when none speaks it. */
export function pickBrowserVoice<T extends NarrationVoiceLike>(
  voices: readonly T[],
  locale: string,
): T | null {
  return voicesForLocale(voices, locale)[0] ?? null;
}

/**
 * The cloud model for a locale. An explicitly configured model always wins; the
 * multilingual default is what makes a non-source locale sound like itself.
 */
export function narrationModelForLocale(
  locale: string,
  configuredModel?: string | null,
): string {
  return configuredModel ?? ELEVENLABS_MULTILINGUAL_MODEL;
}
