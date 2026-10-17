import type {
  CompiledAnchor,
  CompiledBeat,
  CompiledChapter,
  CompiledTour,
  TourTranslation,
} from '@sothspell/core';
import type { PlaybackStatus } from '@sothspell/player';
import type { StorageLike } from './progress.js';

/**
 * The embed consumes the same compiled tour the web player plays, plus an
 * additive locale overlay. Translations use the core schema (Phase 14) so an
 * exported bundle cannot carry an invalid overlay.
 */
export type { TourTranslation };

export type EmbedTour = CompiledTour & {
  /** Optional additive overlay for hosts that pre-translate a tour. */
  translations?: Record<string, TourTranslation>;
};

export type { CompiledAnchor, CompiledBeat, CompiledChapter, CompiledTour };

export interface EmbedSnapshot {
  ready: boolean;
  status: PlaybackStatus;
  tourId: string | null;
  title: string | null;
  locale: string | null;
  sourceLocale: string | null;
  chapterId: string | null;
  chapterTitle: string | null;
  beatId: string | null;
  beatTitle: string | null;
  beatIndex: number;
  beatCount: number;
  offsetMs: number;
  beatDurationMs: number;
  elapsedMs: number;
  totalDurationMs: number;
  progress: number;
  speed: number;
  completedBeatIds: string[];
}

export type EmbedEventType = 'ready' | 'progress' | 'complete' | 'error';

export interface EmbedEvent {
  type: EmbedEventType;
  snapshot: EmbedSnapshot | null;
  message?: string;
}

export type EmbedListener = (event: EmbedEvent) => void;

export interface EmbedClock {
  setInterval(handler: () => void, milliseconds: number): unknown;
  clearInterval(handle: unknown): void;
}

export interface EmbedControllerOptions {
  /** Reads a tour from a URL; defaults to `fetch` + `json()`. */
  fetchTour?: (url: string) => Promise<unknown>;
  /** Local progress store; pass `null` to disable progress entirely. */
  storage?: StorageLike | null;
  /** Initial locale; defaults to the tour's source locale. */
  locale?: string | null;
  /** Playback clock resolution in milliseconds (default 250). */
  intervalMs?: number;
  clock?: EmbedClock;
  onEvent?: EmbedListener;
}
