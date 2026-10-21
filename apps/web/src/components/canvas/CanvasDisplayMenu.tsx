import { useEffect, useId, useRef, useState, type RefObject } from 'react';
import { SlidersHorizontal } from '@phosphor-icons/react';
import { useLocale } from '../../i18n/locale.js';
import type {
  CanvasContrastPreference,
  CanvasMotionPreference,
  CanvasPalettePreference,
  CanvasPreferences,
  CanvasTextScale,
} from '../../lib/canvas-preferences.js';

export interface CanvasDisplayMenuProps {
  preferences: CanvasPreferences;
  onChange: (patch: Partial<CanvasPreferences>) => void;
  onResetPreferences: () => void;
  onResetLayouts: () => void;
  /** The compact toolbar needs the same panel without the tray layout. */
  variant?: 'tray' | 'compact';
}

function preferenceSelect<T extends string | number>(
  id: string,
  label: string,
  value: T,
  options: ReadonlyArray<{ value: T; label: string }>,
  apply: (next: T) => void,
  ref?: RefObject<HTMLSelectElement | null>,
) {
  return (
    <label className="canvas-display-row" htmlFor={id}>
      <span>{label}</span>
      <select
        ref={ref}
        id={id}
        value={value}
        onChange={(event) => apply(event.target.value as T)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/**
 * One in-view menu owns every display preference. It is not a preferences
 * page: each control applies immediately, and the Canvas root mirrors the
 * values as data attributes so the stylesheet never guesses.
 */
export function CanvasDisplayMenu({
  preferences,
  onChange,
  onResetPreferences,
  onResetLayouts,
  variant = 'tray',
}: CanvasDisplayMenuProps) {
  const { t } = useLocale();
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const firstControlRef = useRef<HTMLSelectElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) {
      return;
    }
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (
        target !== null &&
        (panelRef.current?.contains(target) || buttonRef.current?.contains(target))
      ) {
        return;
      }
      setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    // Opening the menu is a user action, so moving focus to its first control
    // is helpful rather than focus theft. Closing returns it to the trigger.
    const raf = requestAnimationFrame(() => firstControlRef.current?.focus());
    return () => cancelAnimationFrame(raf);
  }, [open]);

  const close = (returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) {
      buttonRef.current?.focus();
    }
  };

  return (
    <div
      className={`canvas-display canvas-display--${variant}`}
      data-testid="canvas-display"
      onKeyDown={(event) => {
        if (event.key === 'Escape' && open) {
          event.preventDefault();
          event.stopPropagation();
          close(true);
        }
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        className="canvas-display-button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={t('canvas.appearance')}
        onClick={() => setOpen((current) => !current)}
      >
        <SlidersHorizontal size={14} aria-hidden="true" />
        <span>{t('canvas.appearanceShort')}</span>
      </button>

      {open ? (
        <div
          ref={panelRef}
          id={panelId}
          className="canvas-display-panel"
          role="group"
          aria-label={t('canvas.displayPreferences')}
          data-testid="canvas-display-panel"
        >
          {preferenceSelect<CanvasMotionPreference>(
            `${panelId}-motion`,
            t('canvas.motion'),
            preferences.motion,
            [
              { value: 'system', label: t('canvas.motionSystem') },
              { value: 'reduce', label: t('canvas.motionReduce') },
              { value: 'full', label: t('canvas.motionFull') },
            ],
            (motion) => onChange({ motion }),
            firstControlRef,
          )}
          {preferenceSelect<CanvasContrastPreference>(
            `${panelId}-contrast`,
            t('canvas.contrast'),
            preferences.contrast,
            [
              { value: 'system', label: t('canvas.contrastSystem') },
              { value: 'more', label: t('canvas.contrastMore') },
            ],
            (contrast) => onChange({ contrast }),
          )}
          {preferenceSelect<CanvasPalettePreference>(
            `${panelId}-palette`,
            t('canvas.palette'),
            preferences.palette,
            [
              { value: 'default', label: t('canvas.paletteDefault') },
              { value: 'colorblind', label: t('canvas.paletteColorblind') },
            ],
            (palette) => onChange({ palette }),
          )}
          {preferenceSelect<CanvasTextScale>(
            `${panelId}-text-scale`,
            t('canvas.textScale'),
            preferences.textScale,
            [
              { value: 100, label: '100%' },
              { value: 125, label: '125%' },
              { value: 150, label: '150%' },
              { value: 200, label: '200%' },
            ],
            (textScale) => onChange({ textScale: Number(textScale) as CanvasTextScale }),
          )}

          <div className="canvas-display-checks">
            <label className="canvas-display-check">
              <input
                type="checkbox"
                checked={preferences.autoZoom}
                onChange={(event) => onChange({ autoZoom: event.target.checked })}
              />
              <span>{t('canvas.autoZoom')}</span>
            </label>
            <label className="canvas-display-check">
              <input
                type="checkbox"
                checked={preferences.autoArrange}
                onChange={(event) => onChange({ autoArrange: event.target.checked })}
              />
              <span>{t('canvas.autoArrange')}</span>
            </label>
            <label className="canvas-display-check">
              <input
                type="checkbox"
                checked={preferences.followBeat}
                onChange={(event) => onChange({ followBeat: event.target.checked })}
              />
              <span>{t('canvas.followBeat')}</span>
            </label>
          </div>

          <div className="canvas-display-resets">
            <button
              type="button"
              className="canvas-outline-action"
              onClick={() => {
                onResetLayouts();
                close(true);
              }}
            >
              {t('canvas.resetLayouts')}
            </button>
            <button
              type="button"
              className="canvas-outline-action"
              onClick={() => {
                onResetPreferences();
                close(true);
              }}
            >
              {t('canvas.resetPreferences')}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
