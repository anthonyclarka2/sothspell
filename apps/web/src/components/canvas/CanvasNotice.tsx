import { useEffect, useRef } from 'react';
import { useLocale } from '../../i18n/locale.js';

export type CanvasNoticeKind = 'autoZoom' | 'autoArrange';
export type CanvasNoticePhase = 'action' | 'disabled';

export interface CanvasNoticeProps {
  kind: CanvasNoticeKind;
  phase: CanvasNoticePhase;
  onUndo: () => void;
  onDisable: () => void;
  onDismiss: () => void;
}

/** Long enough to read and act, short enough not to become permanent chrome. */
const AUTO_DISMISS_MS = 12_000;

/**
 * The first-run explanation for auto-zoom and auto-arrange. It never takes
 * focus. The timer pauses while the notice is hovered or focused, and the same
 * Undo and disable actions stay available in the shortcut sheet after it hides.
 */
export function CanvasNotice({
  kind,
  phase,
  onUndo,
  onDisable,
  onDismiss,
}: CanvasNoticeProps) {
  const { t } = useLocale();
  const containerRef = useRef<HTMLDivElement>(null);
  const pausedRef = useRef(false);

  useEffect(() => {
    if (phase === 'disabled') {
      return;
    }
    let timer = window.setTimeout(() => {
      if (!pausedRef.current) {
        onDismiss();
      }
    }, AUTO_DISMISS_MS);

    const pause = () => {
      pausedRef.current = true;
      window.clearTimeout(timer);
    };
    const resume = () => {
      pausedRef.current = false;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        if (!pausedRef.current) {
          onDismiss();
        }
      }, AUTO_DISMISS_MS);
    };

    const container = containerRef.current;
    container?.addEventListener('pointerenter', pause);
    container?.addEventListener('pointerleave', resume);
    container?.addEventListener('focusin', pause);
    container?.addEventListener('focusout', resume);

    return () => {
      window.clearTimeout(timer);
      container?.removeEventListener('pointerenter', pause);
      container?.removeEventListener('pointerleave', resume);
      container?.removeEventListener('focusin', pause);
      container?.removeEventListener('focusout', resume);
    };
  }, [onDismiss, phase]);

  const message =
    phase === 'disabled'
      ? kind === 'autoZoom'
        ? t('canvas.noticeZoomOff')
        : t('canvas.noticeArrangeOff')
      : kind === 'autoZoom'
        ? t('canvas.noticeZoom')
        : t('canvas.noticeArrange');

  return (
    <div
      ref={containerRef}
      className="canvas-notice"
      data-testid="canvas-notice"
      data-kind={kind}
      data-phase={phase}
    >
      <p className="canvas-notice-message" role="status">
        {message}
      </p>
      <div className="canvas-notice-actions">
        {phase === 'action' ? (
          <>
            <button type="button" className="canvas-text-action" onClick={onUndo}>
              {t('canvas.undo')}
            </button>
            <button type="button" className="canvas-text-action" onClick={onDisable}>
              {t('canvas.disableForMe')}
            </button>
          </>
        ) : null}
        <button
          type="button"
          className="canvas-notice-dismiss"
          aria-label={t('canvas.noticeDismiss')}
          onClick={onDismiss}
        >
          {t('canvas.noticeDismiss')}
        </button>
      </div>
    </div>
  );
}
