import {
  ArrowsIn,
  ArrowsOut,
  CaretLeft,
  CaretRight,
  Pause,
  Play,
} from '@phosphor-icons/react';
import type { PlaybackSnapshot } from '@sothspell/player';
import { formatDuration } from '../lib/api.js';
import { useLocale } from '../i18n/locale.js';

export interface TransportProps {
  snapshot: PlaybackSnapshot;
  theater: boolean;
  playingOverride?: boolean;
  onToggle: () => void;
  onNext: () => void;
  onPrevious: () => void;
  onSeek: (fraction: number) => void;
  onSpeed: (speed: number) => void;
  onToggleTheater: () => void;
}

export function Transport({
  snapshot,
  theater,
  playingOverride,
  onToggle,
  onNext,
  onPrevious,
  onSeek,
  onSpeed,
  onToggleTheater,
}: TransportProps) {
  const { t } = useLocale();
  const playing = playingOverride ?? snapshot.status === 'playing';

  return (
    <div className="transport" role="group" aria-label={t('transport.label')}>
      <button
        type="button"
        onClick={onPrevious}
        aria-label={t('transport.previous')}
        title={t('transport.previous')}
      >
        {/* Directional icons mirror in RTL; the controls stay in reading order. */}
        <CaretLeft size={18} weight="bold" className="rtl-flip" />
      </button>
      <button
        type="button"
        className="transport-primary"
        onClick={onToggle}
        aria-label={playing ? t('transport.pause') : t('transport.play')}
        title={playing ? t('transport.pause') : t('transport.play')}
      >
        {playing ? <Pause size={19} weight="fill" /> : <Play size={19} weight="fill" />}
      </button>
      <button
        type="button"
        onClick={onNext}
        aria-label={t('transport.next')}
        title={t('transport.next')}
      >
        <CaretRight size={18} weight="bold" className="rtl-flip" />
      </button>

      <label className="transport-scrubber">
        <span className="visually-hidden">{t('transport.seek')}</span>
        <input
          type="range"
          min={0}
          max={1000}
          step={1}
          value={Math.round(snapshot.progress * 1000)}
          aria-valuetext={t('transport.position', {
            elapsed: formatDuration(snapshot.elapsedMs),
            total: formatDuration(snapshot.totalDurationMs),
          })}
          onChange={(event) => onSeek(Number(event.target.value) / 1000)}
        />
      </label>

      <div className="transport-meta">
        <span>
          {snapshot.beatIndex + 1}/{snapshot.beatCount} ·{' '}
          {formatDuration(snapshot.elapsedMs)} /{' '}
          {formatDuration(snapshot.totalDurationMs)}
        </span>
        <label className="transport-speed">
          <span className="visually-hidden">{t('transport.speed')}</span>
          <select
            aria-label={t('transport.speed')}
            value={String(snapshot.speed)}
            onChange={(event) => onSpeed(Number(event.target.value))}
          >
            {[0.5, 0.75, 1, 1.25, 1.5, 2].map((speed) => (
              <option key={speed} value={speed}>
                {speed}×
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="transport-theater"
          onClick={onToggleTheater}
          aria-label={theater ? t('transport.theaterExit') : t('transport.theaterEnter')}
          title={theater ? t('transport.theaterExit') : t('transport.theaterEnter')}
        >
          {theater ? <ArrowsIn size={18} /> : <ArrowsOut size={18} />}
        </button>
      </div>
    </div>
  );
}
