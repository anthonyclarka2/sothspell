export interface PlaybackBeat {
  id: string;
  title: string;
  durationMs: number;
}

export interface PlaybackChapter {
  id: string;
  title: string;
  beats: PlaybackBeat[];
}

export interface PlaybackTour {
  id: string;
  title: string;
  chapters: PlaybackChapter[];
}

export type PlaybackStatus = 'idle' | 'playing' | 'paused' | 'completed';

export interface PlaybackSnapshot {
  status: PlaybackStatus;
  tourId: string;
  chapterId: string;
  chapterTitle: string;
  beatId: string;
  beatTitle: string;
  beatIndex: number;
  beatCount: number;
  offsetMs: number;
  beatDurationMs: number;
  elapsedMs: number;
  totalDurationMs: number;
  progress: number;
}

export interface PlaybackEvent {
  type:
    | 'beat.started'
    | 'beat.completed'
    | 'chapter.started'
    | 'tour.completed'
    | 'status.changed';
  snapshot: PlaybackSnapshot;
}

export type PlaybackListener = (event: PlaybackEvent) => void;

export interface Playback {
  play(): void;
  pause(): void;
  toggle(): void;
  next(): void;
  previous(): void;
  seekBeat(beatId: string): void;
  seekOffset(offsetMs: number): void;
  /** Advances the clock. The UI owns the real timer; tests call this directly. */
  tick(deltaMs: number): void;
  subscribe(listener: PlaybackListener): () => void;
  getSnapshot(): PlaybackSnapshot;
}

interface FlatBeat {
  chapterIndex: number;
  beatIndex: number;
  beat: PlaybackBeat;
}

function flatten(tour: PlaybackTour): FlatBeat[] {
  return tour.chapters.flatMap((chapter, chapterIndex) =>
    chapter.beats.map((beat, beatIndex) => ({ chapterIndex, beatIndex, beat })),
  );
}

function durationOf(flatBeat: FlatBeat | undefined): number {
  return Math.max(0, flatBeat?.beat.durationMs ?? 0);
}

/**
 * Framework-free playback state for a compiled tour. The engine owns the
 * current beat, the offset inside it, and the play/pause/complete transitions;
 * the UI owns the clock and rendering. That split is what lets the same engine
 * drive the web player, the tests, and (later) a harness plugin.
 */
export function createPlayback(tour: PlaybackTour): Playback {
  const flat = flatten(tour);
  const totalDurationMs = flat.reduce((total, item) => total + durationOf(item), 0);

  if (flat.length === 0 || totalDurationMs <= 0) {
    throw new Error('a playback tour needs at least one beat with a duration');
  }

  let status: PlaybackStatus = 'idle';
  let index = 0;
  let offsetMs = 0;

  const listeners = new Set<PlaybackListener>();

  const current = (): FlatBeat => {
    const flatBeat = flat[index];
    if (!flatBeat) {
      throw new Error(`playback index ${index} is out of range`);
    }
    return flatBeat;
  };

  const elapsedMs = (): number => {
    let elapsed = 0;
    for (let position = 0; position < index; position += 1) {
      elapsed += durationOf(flat[position]);
    }
    return elapsed + offsetMs;
  };

  const snapshot = (): PlaybackSnapshot => {
    const flatBeat = current();
    const chapter = tour.chapters[flatBeat.chapterIndex];
    if (!chapter) {
      throw new Error(`playback chapter ${flatBeat.chapterIndex} is out of range`);
    }

    return {
      status,
      tourId: tour.id,
      chapterId: chapter.id,
      chapterTitle: chapter.title,
      beatId: flatBeat.beat.id,
      beatTitle: flatBeat.beat.title,
      beatIndex: index,
      beatCount: flat.length,
      offsetMs,
      beatDurationMs: durationOf(flatBeat),
      elapsedMs: elapsedMs(),
      totalDurationMs,
      progress: Math.min(1, elapsedMs() / totalDurationMs),
    };
  };

  const emit = (type: PlaybackEvent['type']): void => {
    const event: PlaybackEvent = { type, snapshot: snapshot() };
    for (const listener of listeners) {
      listener(event);
    }
  };

  const seekIndex = (nextIndex: number): void => {
    const clamped = Math.min(Math.max(nextIndex, 0), flat.length - 1);
    index = clamped;
    offsetMs = 0;
  };

  const complete = (): void => {
    const flatBeat = current();
    offsetMs = durationOf(flatBeat);
    status = 'completed';
    emit('beat.completed');
    emit('tour.completed');
  };

  return {
    play(): void {
      if (status === 'playing') {
        return;
      }
      if (status === 'completed') {
        index = 0;
        offsetMs = 0;
        status = 'playing';
        emit('beat.started');
        return;
      }
      const wasIdle = status === 'idle';
      status = 'playing';
      emit('status.changed');
      if (wasIdle) {
        emit('beat.started');
      }
    },

    pause(): void {
      if (status !== 'playing') {
        return;
      }
      status = 'paused';
      emit('status.changed');
    },

    toggle(): void {
      if (status === 'playing') {
        this.pause();
      } else {
        this.play();
      }
    },

    next(): void {
      if (index >= flat.length - 1) {
        complete();
        return;
      }
      seekIndex(index + 1);
      emit('beat.started');
    },

    previous(): void {
      if (offsetMs > 1_500) {
        offsetMs = 0;
        emit('beat.started');
        return;
      }
      seekIndex(index - 1);
      emit('beat.started');
    },

    seekBeat(beatId: string): void {
      const nextIndex = flat.findIndex((item) => item.beat.id === beatId);
      if (nextIndex === -1) {
        throw new Error(`unknown beat: ${beatId}`);
      }
      seekIndex(nextIndex);
      emit('beat.started');
    },

    seekOffset(nextOffsetMs: number): void {
      offsetMs = Math.min(Math.max(nextOffsetMs, 0), durationOf(current()));
      emit('status.changed');
    },

    tick(deltaMs: number): void {
      if (status !== 'playing' || deltaMs <= 0) {
        return;
      }

      offsetMs += deltaMs;

      while (offsetMs >= durationOf(current())) {
        const overflow = offsetMs - durationOf(current());

        if (index >= flat.length - 1) {
          complete();
          return;
        }

        emit('beat.completed');
        seekIndex(index + 1);
        offsetMs = overflow;

        const previousChapter = flat[index - 1]?.chapterIndex;
        const nextChapter = current().chapterIndex;
        if (previousChapter !== nextChapter) {
          emit('chapter.started');
        }
        emit('beat.started');
      }
    },

    subscribe(listener: PlaybackListener): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    getSnapshot: snapshot,
  };
}
