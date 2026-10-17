import type { EmbedSnapshot } from '../types.js';
import { formatDuration } from './format.js';
import { NextIcon, PauseIcon, PlayIcon, PreviousIcon, SpeakerIcon } from './Icons.js';

export interface TransportProps {
  snapshot: EmbedSnapshot;
  listening: boolean;
  onToggle: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onSeek: (fraction: number) => void;
  onSpeed: (speed: number) => void;
  onToggleListen: () => void;
}

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

export function Transport({
  snapshot,
  listening,
  onToggle,
  onPrevious,
  onNext,
  onSeek,
  onSpeed,
  onToggleListen,
}: TransportProps) {
  const playing = snapshot.status === 'playing';

  return (
    <div className="embed-transport" role="group" aria-label="Playback controls">
      <button
        type="button"
        onClick={onPrevious}
        aria-label="Previous beat"
        title="Previous beat"
      >
        <PreviousIcon />
      </button>
      <button
        type="button"
        className="transport-primary"
        onClick={onToggle}
        aria-label={playing ? 'Pause' : 'Play'}
        title={playing ? 'Pause' : 'Play'}
      >
        {playing ? <PauseIcon /> : <PlayIcon />}
      </button>
      <button type="button" onClick={onNext} aria-label="Next beat" title="Next beat">
        <NextIcon />
      </button>
      <button
        type="button"
        onClick={onToggleListen}
        aria-pressed={listening}
        aria-label={listening ? 'Stop narration' : 'Listen to narration'}
        title={listening ? 'Stop narration' : 'Listen to narration'}
      >
        <SpeakerIcon />
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

      <span className="transport-time">
        {formatDuration(snapshot.elapsedMs)} / {formatDuration(snapshot.totalDurationMs)}
      </span>

      <label className="transport-speed">
        <span className="visually-hidden">Playback speed</span>
        <select
          value={String(snapshot.speed)}
          onChange={(event) => onSpeed(Number(event.target.value))}
        >
          {SPEEDS.map((speed) => (
            <option key={speed} value={speed}>
              {speed}×
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
