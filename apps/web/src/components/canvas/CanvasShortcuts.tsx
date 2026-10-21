import { useEffect, useRef } from 'react';
import { X } from '@phosphor-icons/react';
import { useLocale } from '../../i18n/locale.js';

export interface CanvasShortcutsProps {
  onClose: () => void;
}

/**
 * The canvas shortcut sheet. It is a modal dialog because the sheet is a
 * context switch; focus starts on Close and returns to the trigger when the
 * parent closes it. The canvas root owns Escape.
 */
export function CanvasShortcuts({ onClose }: CanvasShortcutsProps) {
  const { t } = useLocale();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  const rows: Array<[string, string]> = [
    ['F', t('canvas.fullscreen')],
    ['0', t('canvas.fitAll')],
    ['1', t('canvas.resetZoom')],
    ['+ / -', `${t('canvas.zoomIn')} / ${t('canvas.zoomOut')}`],
    ['Shift+A', t('canvas.autoArrange')],
    ['Shift+H', t('canvas.home')],
    ['O', t('canvas.outlineShow')],
    ['B', t('canvas.followBeat')],
    ['?', t('canvas.shortcuts')],
    ['Esc', t('canvas.close')],
  ];

  return (
    <div className="canvas-shortcuts-backdrop" role="presentation">
      <div
        className="canvas-shortcuts"
        role="dialog"
        aria-modal="true"
        aria-labelledby="canvas-shortcuts-title"
        onKeyDown={(event) => {
          if (event.key === 'Tab') {
            event.preventDefault();
            closeRef.current?.focus();
          }
        }}
      >
        <header className="canvas-shortcuts-header">
          <h2 id="canvas-shortcuts-title">{t('canvas.shortcuts')}</h2>
          <button
            ref={closeRef}
            type="button"
            className="canvas-icon-button"
            aria-label={t('canvas.close')}
            onClick={onClose}
          >
            <X size={16} aria-hidden="true" />
          </button>
        </header>
        <dl className="canvas-shortcuts-list">
          {rows.map(([keys, label]) => (
            <div key={keys} className="canvas-shortcuts-row">
              <dt>
                <kbd>{keys}</kbd>
              </dt>
              <dd>{label}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
