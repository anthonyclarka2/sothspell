import { useEffect, useId, useRef, useState, type RefObject } from 'react';
import { Export } from '@phosphor-icons/react';
import { useLocale } from '../../i18n/locale.js';

export interface CanvasExportMenuProps {
  onImage: (format: 'png' | 'jpg', scope: 'view' | 'board') => Promise<boolean>;
  onPrint: () => Promise<boolean>;
  /** Parent-translated failure text; the menu owns the retry action. */
  error: string | null;
  onClearError: () => void;
  cardCount: number;
  variant?: 'tray' | 'compact';
}

type ExportAction = { id: string; run: () => Promise<boolean> };

/**
 * One export entry point for the board. The menu stays open while a capture is
 * running so a failure can be read and retried in place; success closes it and
 * returns focus to the trigger.
 */
export function CanvasExportMenu({
  onImage,
  onPrint,
  error,
  onClearError,
  cardCount,
  variant = 'tray',
}: CanvasExportMenuProps) {
  const { t } = useLocale();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const firstActionRef = useRef<HTMLButtonElement>(null);
  const retryRef = useRef<HTMLButtonElement>(null);
  const lastAction = useRef<ExportAction | null>(null);
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
      close(false);
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const frame = requestAnimationFrame(() => firstActionRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open]);

  useEffect(() => {
    if (error !== null) {
      retryRef.current?.focus();
    }
  }, [error]);

  const close = (returnFocus: boolean) => {
    setOpen(false);
    onClearError();
    if (returnFocus) {
      buttonRef.current?.focus();
    }
  };

  const run = async (action: ExportAction) => {
    lastAction.current = action;
    setPending(action.id);
    onClearError();
    const ok = await action.run();
    setPending(null);
    if (ok) {
      close(true);
    }
  };

  const busy = pending !== null;

  const action = (
    id: string,
    label: string,
    runAction: () => Promise<boolean>,
    ref?: RefObject<HTMLButtonElement | null>,
  ) => (
    <button
      ref={ref}
      type="button"
      className="canvas-export-action"
      data-export-action={id}
      disabled={busy}
      aria-busy={pending === id}
      onClick={() => void run({ id, run: runAction })}
    >
      <span>{label}</span>
      {pending === id ? (
        <span className="canvas-export-pending">{t('canvas.export.preparing')}</span>
      ) : null}
    </button>
  );

  return (
    <div
      className={`canvas-export canvas-export--${variant}`}
      data-testid="canvas-export"
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
        className="canvas-export-button"
        data-testid="canvas-export-button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={t('canvas.export')}
        onClick={() => {
          if (open) {
            close(true);
            return;
          }
          onClearError();
          setOpen(true);
        }}
      >
        <Export size={14} aria-hidden="true" />
        <span>{t('canvas.export')}</span>
      </button>

      {open ? (
        <div
          ref={panelRef}
          id={panelId}
          className="canvas-export-panel"
          role="dialog"
          aria-label={t('canvas.export.dialog')}
          data-testid="canvas-export-panel"
        >
          <p className="canvas-export-hint">{t('canvas.export.hint')}</p>
          <p className="canvas-export-count">
            {t('canvas.export.cards', { count: cardCount })}
          </p>

          <div className="canvas-export-group" role="group" aria-label="PNG">
            {action(
              'png-view',
              t('canvas.export.pngView'),
              () => onImage('png', 'view'),
              firstActionRef,
            )}
            {action('png-board', t('canvas.export.pngBoard'), () =>
              onImage('png', 'board'),
            )}
          </div>
          <div className="canvas-export-group" role="group" aria-label="JPG">
            {action('jpg-view', t('canvas.export.jpgView'), () => onImage('jpg', 'view'))}
            {action('jpg-board', t('canvas.export.jpgBoard'), () =>
              onImage('jpg', 'board'),
            )}
          </div>
          <div className="canvas-export-group" role="group" aria-label="PDF">
            {action('pdf', t('canvas.export.pdf'), onPrint)}
          </div>

          {error === null ? null : (
            <div
              className="canvas-export-error"
              role="alert"
              data-testid="canvas-export-error"
            >
              <p>{error}</p>
              <button
                ref={retryRef}
                type="button"
                className="canvas-text-action"
                disabled={busy}
                onClick={() => {
                  const actionToRetry = lastAction.current;
                  if (actionToRetry !== null) {
                    void run(actionToRetry);
                  }
                }}
              >
                {t('canvas.export.retry')}
              </button>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
