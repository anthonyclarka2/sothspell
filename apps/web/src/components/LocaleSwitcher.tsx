import { LOCALES, LOCALE_NAMES, isLocale } from '../i18n/messages.js';
import { useLocale } from '../i18n/locale.js';

/**
 * The locale switcher lives in the shell so every surface shares one choice.
 * The visible label is the endonym, and the accessible name comes from the
 * active catalog.
 */
export function LocaleSwitcher() {
  const { locale, setLocale, t } = useLocale();

  return (
    <label className="locale-switcher">
      <span className="visually-hidden">{t('shell.locale')}</span>
      <select
        aria-label={t('shell.locale')}
        value={locale}
        onChange={(event) => {
          if (isLocale(event.target.value)) {
            setLocale(event.target.value);
          }
        }}
      >
        {LOCALES.map((code) => (
          <option key={code} value={code}>
            {LOCALE_NAMES[code]}
          </option>
        ))}
      </select>
    </label>
  );
}
