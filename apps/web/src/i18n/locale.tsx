import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  SOURCE_LOCALE,
  isLocale,
  isRtl,
  translate,
  type Locale,
  type MessageKey,
} from './messages.js';

/**
 * Locale state for the shell and the player. The choice persists in
 * localStorage, and the effect keeps the document's `lang` and `dir` in step so
 * assistive technology and CSS both see the active locale.
 */

export const LOCALE_STORAGE_KEY = 'sothspell.locale';

export function readStoredLocale(storage?: Pick<Storage, 'getItem'> | null): Locale {
  try {
    const value = storage?.getItem(LOCALE_STORAGE_KEY);
    return value && isLocale(value) ? value : SOURCE_LOCALE;
  } catch {
    return SOURCE_LOCALE;
  }
}

export interface LocaleContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: MessageKey, values?: Record<string, string | number>) => string;
  dir: 'ltr' | 'rtl';
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({
  children,
  initialLocale,
}: {
  children: ReactNode;
  initialLocale?: Locale;
}) {
  const [locale, setLocale] = useState<Locale>(
    () =>
      initialLocale ??
      readStoredLocale(typeof window === 'undefined' ? null : window.localStorage),
  );

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = isRtl(locale) ? 'rtl' : 'ltr';
    try {
      window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    } catch {
      // A private-mode storage failure must not break playback.
    }
  }, [locale]);

  const value = useMemo<LocaleContextValue>(
    () => ({
      locale,
      setLocale,
      t: (key, values) => translate(locale, key, values),
      dir: isRtl(locale) ? 'rtl' : 'ltr',
    }),
    [locale],
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleContextValue {
  const value = useContext(LocaleContext);
  if (!value) {
    throw new Error('useLocale must be used inside a LocaleProvider');
  }
  return value;
}
