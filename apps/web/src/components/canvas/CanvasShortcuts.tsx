import { useEffect, useRef } from 'react';
import { X } from '@phosphor-icons/react';
import { useLocale } from '../../i18n/locale.js';

export interface CanvasShortcutsProps {
  onClose: () => void;
  /** Undo remains reachable after the first-run notice has disappeared. */
  canUndo: boolean;
  onUndo: () => void;
  autoZoom: boolean;
  autoArrange: boolean;
  onDisableAutoZoom: () => void;
  onDisableAutoArrange: () => void;
}

/**
 * The canvas shortcut sheet. It is a modal dialog because the sheet is a
 * context switch; focus starts on Close and returns to the trigger when the
 * parent closes it. The browser keeps the rest of the page inert.
 */
export function CanvasShortcuts({
  onClose,
  canUndo,
  onUndo,
  autoZoom,
  autoArrange,
  onDisableAutoZoom,
  onDisableAutoArrange,
}: CanvasShortcutsProps) {
  const { t } = useLocale();
  const closeRef = useRef<HTMLButtonElement>(null);

  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    closeRef.current?.focus();
    return () => dialog?.close();
  }, []);

  const rows: Array<[string, string]> = [
    ['← ↑ ↓ → / H J K L', t('canvas.shortcutMove')],
    ['← ↑ ↓ → / H J K L', t('canvas.shortcutItems')],
    ['Enter', t('canvas.shortcutEnter')],
    ['Esc', t('canvas.shortcutEscape')],
    ['Space', t('canvas.shortcutSpace')],
    ['T', t('canvas.shortcutTheater')],
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
    <dialog
      ref={dialogRef}
      className="canvas-shortcuts"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      aria-labelledby="canvas-shortcuts-title"
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === 'Escape') {
          event.preventDefault();
          onClose();
        } else if (event.key === 'Tab') {
          const controls =
            event.currentTarget.querySelectorAll<HTMLButtonElement>('button:enabled');
          const first = controls[0];
          const last = controls[controls.length - 1];
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last?.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first?.focus();
          }
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
        {rows.map(([keys, label], index) => (
          <div
            key={`${keys}-${label}`}
            className="canvas-shortcuts-row"
            data-first={index === 0 ? 'true' : undefined}
          >
            <dt>
              <kbd>{keys}</kbd>
            </dt>
            <dd>{label}</dd>
          </div>
        ))}
      </dl>
      <section className="canvas-shortcuts-tips" aria-label={t('canvas.shortcutTips')}>
        <h3>{t('canvas.shortcutTips')}</h3>
        <div className="canvas-shortcuts-actions">
          <button
            type="button"
            className="canvas-outline-action"
            disabled={!canUndo}
            onClick={() => {
              closeRef.current?.focus();
              onUndo();
            }}
          >
            {t('canvas.shortcutUndo')}
          </button>
          {autoZoom ? (
            <button
              type="button"
              className="canvas-outline-action"
              onClick={() => {
                closeRef.current?.focus();
                onDisableAutoZoom();
              }}
            >
              {t('canvas.disableForMe')} · {t('canvas.autoZoom')}
            </button>
          ) : null}
          {autoArrange ? (
            <button
              type="button"
              className="canvas-outline-action"
              onClick={() => {
                closeRef.current?.focus();
                onDisableAutoArrange();
              }}
            >
              {t('canvas.disableForMe')} · {t('canvas.autoArrange')}
            </button>
          ) : null}
        </div>
      </section>
    </dialog>
  );
}
