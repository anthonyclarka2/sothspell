import { CaretLeft, CaretRight, Pause, Play } from '@phosphor-icons/react';
import type { PlaybackSnapshot } from '@sothspell/player';
import { formatDuration } from '../lib/api.js';

export interface TransportProps {
  snapshot: PlaybackSnapshot;
  onToggle: () => void;
  onNext: () => void;
  onPrevious: () => void;
}

export function Transport({ snapshot, onToggle, onNext, onPrevious }: TransportProps) {
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

      <div
        className="progress-track"
        role="progressbar"
        aria-label="Tour progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(snapshot.progress * 100)}
      >
        <div
          className="progress-fill"
          style={{ width: `${Math.round(snapshot.progress * 100)}%` }}
        />
      </div>

      <div className="transport-meta">
        {snapshot.beatIndex + 1}/{snapshot.beatCount} ·{' '}
        {formatDuration(snapshot.elapsedMs)} / {formatDuration(snapshot.totalDurationMs)}
      </div>
    </div>
  );
}
