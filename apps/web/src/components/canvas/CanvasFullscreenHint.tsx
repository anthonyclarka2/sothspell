import { X } from '@phosphor-icons/react';
import { useLocale } from '../../i18n/locale.js';

export interface CanvasFullscreenHintProps {
  onDismiss: () => void;
}

/**
 * Shown after the fullscreen request succeeds. The controls' live region has
 * already announced the state; this banner is the visible reminder and its
 * close button is the pointer path to the same dismissal.
 */
export function CanvasFullscreenHint({ onDismiss }: CanvasFullscreenHintProps) {
  const { t } = useLocale();

  return (
    <div className="canvas-fullscreen-hint">
      <span>{t('canvas.fullscreenHint')}</span>
      <button
        type="button"
        className="canvas-icon-button"
        aria-label={t('canvas.dismiss')}
        onClick={onDismiss}
      >
        <X size={15} aria-hidden="true" />
      </button>
    </div>
  );
}
