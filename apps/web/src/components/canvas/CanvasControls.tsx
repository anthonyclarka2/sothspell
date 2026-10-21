import type { ReactNode } from 'react';
import {
  ArrowsIn,
  ArrowsOut,
  ArrowsClockwise,
  CornersOut,
  Crosshair,
  House,
  ListBullets,
  Minus,
  Plus,
} from '@phosphor-icons/react';
import { useViewport } from '@xyflow/react';
import { useLocale } from '../../i18n/locale.js';

export interface CanvasControlsProps {
  outlineOpen: boolean;
  followBeat: boolean;
  fullscreenSupported: boolean;
  fullscreenActive: boolean;
  fullscreenPulse: boolean;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
  onFitAll: () => void;
  onHome: () => void;
  onAutoArrange: () => void;
  onToggleOutline: () => void;
  onToggleFollowBeat: () => void;
  onToggleFullscreen: () => void;
}

interface ControlButtonProps {
  label: string;
  shortcut?: string;
  pressed?: boolean;
  pulse?: boolean;
  className?: string;
  onClick: () => void;
  children: ReactNode;
}

function ControlButton({
  label,
  shortcut,
  pressed,
  pulse,
  className,
  onClick,
  children,
}: ControlButtonProps) {
  const { t } = useLocale();
  return (
    <button
      type="button"
      className={`canvas-control${pulse ? ' canvas-control--pulse' : ''}${
        className ? ` ${className}` : ''
      }`}
      aria-label={label}
      aria-pressed={pressed}
      aria-keyshortcuts={shortcut}
      title={
        shortcut === undefined
          ? label
          : `${label} — ${t('canvas.shortcut', { keys: shortcut })}`
      }
      onClick={onClick}
    >
      {children}
    </button>
  );
}

/**
 * The bottom-left control bar. It subscribes to the viewport itself so the
 * board's nodes do not re-render on every pan or zoom.
 */
export function CanvasControls({
  outlineOpen,
  followBeat,
  fullscreenSupported,
  fullscreenActive,
  fullscreenPulse,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  onFitAll,
  onHome,
  onAutoArrange,
  onToggleOutline,
  onToggleFollowBeat,
  onToggleFullscreen,
}: CanvasControlsProps) {
  const { t } = useLocale();
  const { zoom } = useViewport();
  const percent = Math.round(zoom * 100);

  return (
    <div
      className="canvas-controls"
      role="toolbar"
      aria-label={t('canvas.controls')}
      aria-orientation="horizontal"
    >
      <div className="canvas-control-group">
        <ControlButton label={t('canvas.zoomOut')} shortcut="-" onClick={onZoomOut}>
          <Minus size={16} aria-hidden="true" />
        </ControlButton>
        <output
          className="canvas-zoom-readout mono"
          aria-label={t('canvas.zoomLevel', { percent })}
        >
          {percent}%
        </output>
        <ControlButton label={t('canvas.zoomIn')} shortcut="+" onClick={onZoomIn}>
          <Plus size={16} aria-hidden="true" />
        </ControlButton>
        <ControlButton
          label={`${t('canvas.resetZoom')} 1:1`}
          shortcut="0"
          onClick={onResetZoom}
        >
          <span className="canvas-control-text">1:1</span>
        </ControlButton>
        <ControlButton label={t('canvas.fitAll')} shortcut="1" onClick={onFitAll}>
          <CornersOut size={16} aria-hidden="true" />
        </ControlButton>
      </div>
      <div className="canvas-control-group">
        <ControlButton label={t('canvas.home')} shortcut="H" onClick={onHome}>
          <House size={16} aria-hidden="true" />
        </ControlButton>
        <ControlButton
          label={t('canvas.autoArrange')}
          shortcut="A"
          onClick={onAutoArrange}
        >
          <ArrowsClockwise size={16} aria-hidden="true" />
        </ControlButton>
        <ControlButton
          label={t('canvas.followBeat')}
          shortcut="B"
          pressed={followBeat}
          onClick={onToggleFollowBeat}
        >
          <Crosshair size={16} aria-hidden="true" />
        </ControlButton>
      </div>
      <div className="canvas-control-group">
        <ControlButton
          label={outlineOpen ? t('canvas.outlineHide') : t('canvas.outlineShow')}
          shortcut="O"
          pressed={outlineOpen}
          onClick={onToggleOutline}
        >
          <ListBullets size={16} aria-hidden="true" />
        </ControlButton>
        {fullscreenSupported ? (
          <ControlButton
            label={fullscreenActive ? t('canvas.exitFullscreen') : t('canvas.fullscreen')}
            shortcut="F"
            pressed={fullscreenActive}
            pulse={fullscreenPulse}
            onClick={onToggleFullscreen}
          >
            {fullscreenActive ? (
              <ArrowsIn size={16} aria-hidden="true" />
            ) : (
              <ArrowsOut size={16} aria-hidden="true" />
            )}
          </ControlButton>
        ) : null}
      </div>
    </div>
  );
}
