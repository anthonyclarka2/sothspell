import {
  createPlayback,
  type Playback,
  type PlaybackEvent,
  type PlaybackTour,
} from '@sothspell/player';
import {
  clearEmbedProgress,
  defaultStorage,
  readEmbedProgress,
  writeEmbedProgress,
  type StorageLike,
} from './progress.js';
import type {
  EmbedClock,
  EmbedControllerOptions,
  EmbedEvent,
  EmbedListener,
  EmbedSnapshot,
  EmbedTour,
  EmbedTranslation,
} from './types.js';

export interface EmbedController {
  /** Loads a tour from a URL or an already-parsed tour object. */
  load(source: string | EmbedTour): Promise<EmbedSnapshot>;
  play(): void;
  pause(): void;
  toggle(): void;
  /** Seeks to a fraction of the whole tour (0–1). */
  seek(fraction: number): void;
  /** Seeks to a known beat; unknown ids are ignored rather than thrown. */
  seekToBeat(beatId: string): void;
  setSpeed(speed: number): void;
  next(): void;
  previous(): void;
  setLocale(locale: string | null): void;
  getRequestedLocale(): string | null;
  setProgressEnabled(enabled: boolean): void;
  getTour(): EmbedTour | null;
  getSnapshot(): EmbedSnapshot;
  subscribe(listener: EmbedListener): () => void;
  destroy(): void;
}

const DEFAULT_INTERVAL_MS = 250;

const defaultClock: EmbedClock = {
  setInterval: (handler, milliseconds) => globalThis.setInterval(handler, milliseconds),
  clearInterval: (handle) =>
    globalThis.clearInterval(handle as ReturnType<typeof setInterval>),
};

const EMPTY_SNAPSHOT: Omit<EmbedSnapshot, 'locale'> = {
  ready: false,
  status: 'idle',
  tourId: null,
  title: null,
  sourceLocale: null,
  chapterId: null,
  chapterTitle: null,
  beatId: null,
  beatTitle: null,
  beatIndex: 0,
  beatCount: 0,
  offsetMs: 0,
  beatDurationMs: 0,
  elapsedMs: 0,
  totalDurationMs: 0,
  progress: 0,
  speed: 1,
  completedBeatIds: [],
};

async function defaultFetchTour(url: string): Promise<unknown> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`could not load the tour from ${url}: HTTP ${response.status}`);
  }
  return response.json();
}

function toPlaybackTour(tour: EmbedTour): PlaybackTour {
  return {
    id: tour.id,
    title: tour.title,
    chapters: tour.chapters.map((chapter) => ({
      id: chapter.id,
      title: chapter.title,
      beats: chapter.beats.map((beat) => ({
        id: beat.id,
        title: beat.title,
        durationMs: beat.durationMs,
      })),
    })),
  };
}

function localizeTour(tour: EmbedTour, locale: string | null): EmbedTour {
  if (locale === null) {
    return tour;
  }
  const translation: EmbedTranslation | undefined = tour.translations?.[locale];
  if (!translation) {
    return tour;
  }

  const chapters = new Map(
    (translation.chapters ?? []).map((chapter) => [chapter.id, chapter]),
  );

  return {
    ...tour,
    title: translation.title ?? tour.title,
    subtitle: translation.subtitle ?? tour.subtitle,
    chapters: tour.chapters.map((chapter) => {
      const chapterTranslation = chapters.get(chapter.id);
      const beats = new Map(
        (chapterTranslation?.beats ?? []).map((beat) => [beat.id, beat]),
      );
      return {
        ...chapter,
        title: chapterTranslation?.title ?? chapter.title,
        summary: chapterTranslation?.summary ?? chapter.summary,
        beats: chapter.beats.map((beat) => {
          const beatTranslation = beats.get(beat.id);
          return {
            ...beat,
            title: beatTranslation?.title ?? beat.title,
            narration: beatTranslation?.narration ?? beat.narration,
          };
        }),
      };
    }),
  };
}

function assertSupportedTour(input: unknown): asserts input is EmbedTour {
  if (typeof input !== 'object' || input === null) {
    throw new Error('tour data must be a JSON object');
  }
  const version = (input as { schemaVersion?: unknown }).schemaVersion;
  if (typeof version !== 'string') {
    throw new Error('tour data is missing schemaVersion');
  }
  if (!version.startsWith('1.')) {
    throw new Error(
      `unsupported tour schema version ${version}; this embed bundle supports 1.x`,
    );
  }
  const chapters = (input as { chapters?: unknown }).chapters;
  if (!Array.isArray(chapters) || chapters.length === 0) {
    throw new Error('tour has no chapters');
  }
  for (const chapter of chapters) {
    const beats = (chapter as { beats?: unknown } | null)?.beats;
    const id = (chapter as { id?: unknown } | null)?.id;
    if (!Array.isArray(beats) || beats.length === 0) {
      throw new Error(`chapter ${typeof id === 'string' ? id : '?'} has no beats`);
    }
  }
}

/**
 * The embed controller is the deep module behind the custom element and the
 * iframe bridge: it owns the playback engine, the local progress record, the
 * locale overlay, and the clock, and exposes one small snapshot/event surface
 * to both hosts. The React view is a renderer over this; it holds no state of
 * its own that the controller does not know about.
 */
export function createEmbedController(
  options: EmbedControllerOptions = {},
): EmbedController {
  const clock = options.clock ?? defaultClock;
  const intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
  const fetchTour = options.fetchTour ?? defaultFetchTour;
  const listeners = new Set<EmbedListener>();

  let storage: StorageLike | null =
    options.storage === undefined ? defaultStorage() : options.storage;
  let progressEnabled = storage !== null;
  let requestedLocale: string | null = options.locale ?? null;
  let baseTour: EmbedTour | null = null;
  let tour: EmbedTour | null = null;
  let playback: Playback | null = null;
  let unsubscribePlayback: (() => void) | null = null;
  let timer: unknown = null;
  let destroyed = false;
  let completedBeatIds: string[] = [];
  let lastWrittenBeatId: string | null = null;
  let lastWrittenOffset = -1;

  const snapshot = (): EmbedSnapshot => {
    if (!tour || !playback) {
      return { ...EMPTY_SNAPSHOT, locale: requestedLocale };
    }
    const engine = playback.getSnapshot();
    const chapter = tour.chapters.find((candidate) => candidate.id === engine.chapterId);
    const beat = chapter?.beats.find((candidate) => candidate.id === engine.beatId);
    return {
      ready: true,
      status: engine.status,
      tourId: engine.tourId,
      title: tour.title,
      locale: requestedLocale ?? tour.locale ?? null,
      sourceLocale: tour.locale ?? null,
      chapterId: engine.chapterId,
      chapterTitle: chapter?.title ?? engine.chapterTitle,
      beatId: engine.beatId,
      beatTitle: beat?.title ?? engine.beatTitle,
      beatIndex: engine.beatIndex,
      beatCount: engine.beatCount,
      offsetMs: engine.offsetMs,
      beatDurationMs: engine.beatDurationMs,
      elapsedMs: engine.elapsedMs,
      totalDurationMs: engine.totalDurationMs,
      progress: engine.progress,
      speed: engine.speed,
      completedBeatIds: [...completedBeatIds],
    };
  };

  const persistProgress = (): void => {
    if (!progressEnabled || !storage || !tour) {
      return;
    }
    const current = snapshot();
    if (!current.ready || current.status === 'completed' || current.beatId === null) {
      return;
    }
    // Ticks arrive four times a second; a write per tick would be wasteful, so
    // only a beat change or a full second of movement reaches storage.
    if (
      current.beatId === lastWrittenBeatId &&
      Math.abs(current.offsetMs - lastWrittenOffset) < 1000
    ) {
      return;
    }
    lastWrittenBeatId = current.beatId;
    lastWrittenOffset = current.offsetMs;
    writeEmbedProgress(storage, {
      tourId: tour.id,
      beatId: current.beatId,
      offsetMs: current.offsetMs,
      completedBeatIds: [...completedBeatIds],
      speed: current.speed,
      updatedAt: Date.now(),
    });
  };

  const emit = (type: EmbedEvent['type'], message?: string): void => {
    if (destroyed) {
      return;
    }
    const event: EmbedEvent =
      message === undefined
        ? { type, snapshot: snapshot() }
        : { type, snapshot: snapshot(), message };
    options.onEvent?.(event);
    for (const listener of listeners) {
      listener(event);
    }
    if (type === 'progress' || type === 'ready') {
      persistProgress();
    }
  };

  const onPlaybackEvent = (event: PlaybackEvent): void => {
    if (event.type === 'beat.completed') {
      if (!completedBeatIds.includes(event.snapshot.beatId)) {
        completedBeatIds = [...completedBeatIds, event.snapshot.beatId];
      }
    }
    if (event.type === 'tour.completed') {
      if (tour) {
        clearEmbedProgress(storage, tour.id);
      }
      emit('complete');
      return;
    }
    emit('progress');
  };

  const stopTimer = (): void => {
    if (timer !== null) {
      clock.clearInterval(timer);
      timer = null;
    }
  };

  const stopPlayback = (): void => {
    unsubscribePlayback?.();
    unsubscribePlayback = null;
    playback = null;
    stopTimer();
  };

  return {
    async load(source: string | EmbedTour): Promise<EmbedSnapshot> {
      if (destroyed) {
        throw new Error('this embed player was destroyed');
      }
      try {
        const raw = typeof source === 'string' ? await fetchTour(source) : source;
        assertSupportedTour(raw);
        stopPlayback();
        completedBeatIds = [];
        lastWrittenBeatId = null;
        lastWrittenOffset = -1;

        baseTour = raw;
        tour = localizeTour(baseTour, requestedLocale);
        // The playback engine is built from source titles; the snapshot
        // resolves titles from the localized tour so a locale switch does not
        // disturb the position.
        const engine = createPlayback(toPlaybackTour(baseTour));
        playback = engine;

        if (progressEnabled && storage) {
          const stored = readEmbedProgress(storage, baseTour.id);
          if (stored) {
            try {
              engine.seekBeat(stored.beatId);
              engine.seekOffset(stored.offsetMs);
              engine.setSpeed(stored.speed);
              completedBeatIds = [...stored.completedBeatIds];
            } catch {
              clearEmbedProgress(storage, baseTour.id);
            }
          }
        }

        unsubscribePlayback = engine.subscribe(onPlaybackEvent);
        timer = clock.setInterval(() => {
          if (destroyed || !playback) {
            return;
          }
          if (playback.getSnapshot().status !== 'playing') {
            return;
          }
          playback.tick(intervalMs);
          emit('progress');
        }, intervalMs);

        emit('ready');
        return snapshot();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        emit('error', message);
        throw error instanceof Error ? error : new Error(message);
      }
    },

    play(): void {
      playback?.play();
    },

    pause(): void {
      playback?.pause();
    },

    toggle(): void {
      playback?.toggle();
    },

    seek(fraction: number): void {
      playback?.seekProgress(fraction);
    },

    seekToBeat(beatId: string): void {
      if (!playback) {
        return;
      }
      try {
        playback.seekBeat(beatId);
      } catch {
        // A host may hold a stale beat id; ignore it instead of failing.
      }
    },

    setSpeed(speed: number): void {
      playback?.setSpeed(speed);
    },

    next(): void {
      playback?.next();
    },

    previous(): void {
      playback?.previous();
    },

    setLocale(locale: string | null): void {
      requestedLocale = locale;
      if (baseTour) {
        tour = localizeTour(baseTour, locale);
      }
      emit('progress');
    },

    getRequestedLocale(): string | null {
      return requestedLocale;
    },

    setProgressEnabled(enabled: boolean): void {
      progressEnabled = enabled && storage !== null;
      if (!progressEnabled && tour) {
        clearEmbedProgress(storage, tour.id);
      }
    },

    getTour(): EmbedTour | null {
      return tour;
    },

    getSnapshot: snapshot,

    subscribe(listener: EmbedListener): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    destroy(): void {
      destroyed = true;
      stopPlayback();
      baseTour = null;
      tour = null;
      listeners.clear();
    },
  };
}
