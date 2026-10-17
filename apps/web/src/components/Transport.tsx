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

export interface TransportProps {
  snapshot: PlaybackSnapshot;
  theater: boolean;
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
  onToggle,
  onNext,
  onPrevious,
  onSeek,
  onSpeed,
  onToggleTheater,
}: TransportProps) {
  const playing = snapshot.status === 'playing';

  return (
    <div className="transport" role="group" aria-label="Playback controls">
      <button
        type="button"
        onClick={onPrevious}
        aria-label="Previous beat"
        title="Previous beat"
      >
        <CaretLeft size={18} weight="bold" />
      </button>
      <button
        type="button"
        className="transport-primary"
        onClick={onToggle}
        aria-label={playing ? 'Pause' : 'Play'}
        title={playing ? 'Pause' : 'Play'}
      >
        {playing ? <Pause size={19} weight="fill" /> : <Play size={19} weight="fill" />}
      </button>
      <button type="button" onClick={onNext} aria-label="Next beat" title="Next beat">
        <CaretRight size={18} weight="bold" />
      </button>

      <label className="transport-scrubber">
        <span className="visually-hidden">Seek through the tour</span>
        <input
          type="range"
          min={0}
          max={1000}
          step={1}
          value={Math.round(snapshot.progress * 1000)}
          aria-valuetext={`${formatDuration(snapshot.elapsedMs)} of ${formatDuration(snapshot.totalDurationMs)}`}
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
          <span className="visually-hidden">Playback speed</span>
          <select
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
          aria-label={theater ? 'Exit theater mode' : 'Enter theater mode'}
          title={theater ? 'Exit theater mode' : 'Enter theater mode'}
        >
          {theater ? <ArrowsIn size={18} /> : <ArrowsOut size={18} />}
        </button>
      </div>
    </div>
  );
}
