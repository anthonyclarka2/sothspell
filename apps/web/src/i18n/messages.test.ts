import { describe, expect, it } from 'vitest';
import {
  LOCALES,
  SOURCE_LOCALE,
  catalogs,
  isLocale,
  isRtl,
  localeDirection,
  templateFor,
  translate,
} from './messages.js';

describe('message catalogs', () => {
  it('has every source key in every locale, with non-empty strings', () => {
    const sourceKeys = Object.keys(catalogs.en);

    for (const locale of LOCALES) {
      const catalog = catalogs[locale] as Record<string, string>;
      expect(Object.keys(catalog).toSorted()).toEqual([...sourceKeys].toSorted());
      for (const key of sourceKeys) {
        expect(catalog[key], `${locale} ${key}`).toBeTruthy();
      }
    }
  });

  it('falls back to the source locale for a missing key', () => {
    expect(templateFor('es', 'player.loading', {})).toBe(catalogs.en['player.loading']);
    expect(templateFor('ar', 'transport.play', {})).toBe(catalogs.en['transport.play']);
  });

  it('interpolates values and leaves unknown placeholders alone', () => {
    expect(translate('en', 'home.beatCount', { count: 3 })).toBe('3 beats');
    expect(translate('ar', 'home.beatCount', { count: 3 })).toBe('3 مقاطع');
    expect(translate('en', 'transport.position', { elapsed: '0:10' })).toBe(
      '0:10 of {total}',
    );
  });
});

describe('locale helpers', () => {
  it('recognizes supported locales', () => {
    expect(isLocale('es')).toBe(true);
    expect(isLocale('ar')).toBe(true);
    expect(isLocale('en')).toBe(true);
    expect(isLocale('fr')).toBe(false);
    expect(isLocale('')).toBe(false);
  });

  it('marks Arabic as right-to-left and the others as left-to-right', () => {
    expect(isRtl('ar')).toBe(true);
    expect(isRtl('es')).toBe(false);
    expect(localeDirection('ar')).toBe('rtl');
    expect(localeDirection('en')).toBe('ltr');
    expect(SOURCE_LOCALE).toBe('en');
  });
});
