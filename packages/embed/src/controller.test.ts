import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmbedController } from './controller.js';
import type { StorageLike } from './progress.js';
import { writeEmbedProgress } from './progress.js';
import type { EmbedEvent, EmbedTour } from './types.js';

function makeTour(): EmbedTour {
  return {
    schemaVersion: '1.0.0',
    id: 'tour_fixture',
    title: 'Fixture tour',
    subtitle: 'A small tour for tests',
    audience: 'new-contributor',
    project: {
      slug: 'fixture',
      name: 'Fixture',
      revision: { commit: 'abc1234', branch: 'main', dirty: false },
    },
    estimatedDurationMs: 16_000,
    locale: 'en',
    sourceLocale: 'en',
    availableLocales: ['en', 'de'],
    translations: {
      de: {
        locale: 'de',
        sourceLocale: 'en',
        title: 'Fixture-Tour',
        subtitle: 'Eine kleine Tour für Tests',
        chapters: [
          {
            id: 'chapter_one',
            title: 'Eins',
            summary: 'Erste Kapitelzusammenfassung.',
            diagrams: [],
            beats: [
              {
                id: 'beat_one',
                title: 'Schlag eins',
                narration: 'Erster Text für den ersten Schlag der Tour.',
              },
              {
                id: 'beat_two',
                title: 'Schlag zwei',
                narration: 'Zweiter Text für den zweiten Schlag der Tour.',
              },
            ],
          },
          {
            id: 'chapter_two',
            title: 'Zwei',
            summary: 'Zweite Kapitelzusammenfassung.',
            diagrams: [],
            beats: [
              {
                id: 'beat_three',
                title: 'Schlag drei',
                narration: 'Dritter Text für den dritten Schlag der Tour.',
              },
            ],
          },
        ],
      },
    },
    chapters: [
      {
        id: 'chapter_one',
        title: 'One',
        summary: 'First chapter summary',
        diagrams: [],
        beats: [
          {
            id: 'beat_one',
            title: 'Beat one',
            narration: 'First beat narration text here.',
            durationMs: 4000,
            anchors: [],
            stage: { anchorIds: [], nodeIds: [], edgeIds: [] },
            suggestedQuestions: [],
          },
          {
            id: 'beat_two',
            title: 'Beat two',
            narration: 'Second beat narration text here.',
            durationMs: 8000,
            anchors: [],
            stage: { anchorIds: [], nodeIds: [], edgeIds: [] },
            suggestedQuestions: [],
          },
        ],
      },
      {
        id: 'chapter_two',
        title: 'Two',
        summary: 'Second chapter summary',
        diagrams: [],
        beats: [
          {
            id: 'beat_three',
            title: 'Beat three',
            narration: 'Third beat narration text here.',
            durationMs: 4000,
            anchors: [],
            stage: { anchorIds: [], nodeIds: [], edgeIds: [] },
            suggestedQuestions: [],
          },
        ],
      },
    ],
  };
}

function memoryStorage(): StorageLike & { entries: Map<string, string> } {
  const entries = new Map<string, string>();
  return {
    entries,
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => {
      entries.set(key, value);
    },
    removeItem: (key) => {
      entries.delete(key);
    },
  };
}

function collect(): { events: EmbedEvent[]; listener: (event: EmbedEvent) => void } {
  const events: EmbedEvent[] = [];
  return { events, listener: (event) => events.push(event) };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('embed controller', () => {
  it('loads a tour object and reports a ready snapshot', async () => {
    const controller = createEmbedController({ storage: null });
    const snapshot = await controller.load(makeTour());

    expect(snapshot.ready).toBe(true);
    expect(snapshot.tourId).toBe('tour_fixture');
    expect(snapshot.title).toBe('Fixture tour');
    expect(snapshot.beatId).toBe('beat_one');
    expect(snapshot.beatIndex).toBe(0);
    expect(snapshot.beatCount).toBe(3);
    expect(snapshot.chapterId).toBe('chapter_one');
    expect(snapshot.totalDurationMs).toBe(16_000);
    expect(snapshot.status).toBe('idle');
    controller.destroy();
  });

  it('loads a tour from a URL through the injected fetch', async () => {
    const fetchTour = vi.fn(async () => makeTour());
    const controller = createEmbedController({ storage: null, fetchTour });

    await controller.load('./tour.json');

    expect(fetchTour).toHaveBeenCalledWith('./tour.json');
    expect(controller.getSnapshot().tourId).toBe('tour_fixture');
    controller.destroy();
  });

  it('advances while playing and stops on pause', async () => {
    const controller = createEmbedController({ storage: null });
    await controller.load(makeTour());

    controller.play();
    vi.advanceTimersByTime(1000);
    expect(controller.getSnapshot().offsetMs).toBe(1000);
    expect(controller.getSnapshot().status).toBe('playing');

    controller.pause();
    vi.advanceTimersByTime(1000);
    expect(controller.getSnapshot().offsetMs).toBe(1000);
    controller.destroy();
  });

  it('supports seek, next, and previous', async () => {
    const controller = createEmbedController({ storage: null });
    await controller.load(makeTour());

    controller.next();
    expect(controller.getSnapshot().beatId).toBe('beat_two');

    controller.previous();
    expect(controller.getSnapshot().beatId).toBe('beat_one');

    controller.seek(0.5);
    const snapshot = controller.getSnapshot();
    expect(snapshot.elapsedMs).toBe(8000);
    expect(snapshot.beatId).toBe('beat_two');
    controller.destroy();
  });

  it('emits progress events with the full snapshot', async () => {
    const controller = createEmbedController({ storage: null });
    const { events, listener } = collect();
    controller.subscribe(listener);

    await controller.load(makeTour());
    controller.play();
    vi.advanceTimersByTime(500);

    const progress = events.filter((event) => event.type === 'progress');
    expect(progress.length).toBeGreaterThan(0);
    const latest = progress.at(-1);
    expect(latest?.snapshot?.beatId).toBe('beat_one');
    expect(latest?.snapshot?.offsetMs).toBe(500);
    expect(latest?.snapshot?.progress).toBeCloseTo(500 / 16_000, 5);
    controller.destroy();
  });

  it('emits ready, complete, and clears stored progress at the end', async () => {
    const storage = memoryStorage();
    const controller = createEmbedController({ storage });
    const { events, listener } = collect();
    controller.subscribe(listener);

    await controller.load(makeTour());
    controller.play();
    vi.advanceTimersByTime(20_000);

    expect(events.some((event) => event.type === 'ready')).toBe(true);
    const complete = events.find((event) => event.type === 'complete');
    expect(complete?.snapshot?.status).toBe('completed');
    expect(storage.entries.size).toBe(0);
    controller.destroy();
  });

  it('restores stored progress on load', async () => {
    const storage = memoryStorage();
    writeEmbedProgress(storage, {
      tourId: 'tour_fixture',
      beatId: 'beat_two',
      offsetMs: 1200,
      completedBeatIds: ['beat_one'],
      speed: 1.5,
      updatedAt: Date.now(),
    });
    const controller = createEmbedController({ storage });

    const snapshot = await controller.load(makeTour());

    expect(snapshot.beatId).toBe('beat_two');
    expect(snapshot.offsetMs).toBe(1200);
    expect(snapshot.speed).toBe(1.5);
    expect(snapshot.completedBeatIds).toEqual(['beat_one']);
    controller.destroy();
  });

  it('ignores stored progress that points at an unknown beat', async () => {
    const storage = memoryStorage();
    writeEmbedProgress(storage, {
      tourId: 'tour_fixture',
      beatId: 'beat_missing',
      offsetMs: 1200,
      completedBeatIds: [],
      speed: 1,
      updatedAt: Date.now(),
    });
    const controller = createEmbedController({ storage });

    const snapshot = await controller.load(makeTour());

    expect(snapshot.beatId).toBe('beat_one');
    // The stale record is replaced by a fresh one at the first beat.
    const stored = JSON.parse(storage.entries.values().next().value ?? '{}') as {
      beatId?: string;
    };
    expect(stored.beatId).toBe('beat_one');
    controller.destroy();
  });

  it('never touches storage when progress is opted out', async () => {
    const storage = memoryStorage();
    const controller = createEmbedController({ storage });
    await controller.load(makeTour());
    controller.setProgressEnabled(false);

    controller.play();
    vi.advanceTimersByTime(3000);

    expect(storage.entries.size).toBe(0);
    controller.destroy();
  });

  it('clears and stops writing when progress is disabled after writing', async () => {
    const storage = memoryStorage();
    const controller = createEmbedController({ storage });
    await controller.load(makeTour());
    controller.play();
    vi.advanceTimersByTime(1000);
    expect(storage.entries.size).toBe(1);

    controller.setProgressEnabled(false);
    vi.advanceTimersByTime(1000);

    expect(storage.entries.size).toBe(0);
    controller.destroy();
  });

  it('applies a translation overlay when a locale is selected', async () => {
    const controller = createEmbedController({ storage: null, locale: 'de' });

    const snapshot = await controller.load(makeTour());

    expect(snapshot.locale).toBe('de');
    expect(snapshot.sourceLocale).toBe('en');
    expect(snapshot.title).toBe('Fixture-Tour');
    expect(snapshot.beatTitle).toBe('Schlag eins');
    expect(snapshot.chapterTitle).toBe('Eins');

    controller.setLocale('en');
    expect(controller.getSnapshot().title).toBe('Fixture tour');
    expect(controller.getSnapshot().beatTitle).toBe('Beat one');
    controller.destroy();
  });

  it('rejects an unsupported schema version visibly', async () => {
    const controller = createEmbedController({ storage: null });
    const { events, listener } = collect();
    controller.subscribe(listener);
    const tour = { ...makeTour(), schemaVersion: '2.0.0' };

    await expect(controller.load(tour)).rejects.toThrow(/schema version/i);
    expect(events.some((event) => event.type === 'error')).toBe(true);
    controller.destroy();
  });

  it('rejects a tour with no playable beats', async () => {
    const controller = createEmbedController({ storage: null });
    const tour = makeTour();
    tour.chapters[0]!.beats = [];

    await expect(controller.load(tour)).rejects.toThrow(/beat/i);
    controller.destroy();
  });

  it('stops its clock and events on destroy', async () => {
    const clock = {
      setInterval: vi.fn(() => 7),
      clearInterval: vi.fn(),
    };
    const controller = createEmbedController({ storage: null, clock });
    await controller.load(makeTour());
    const { events, listener } = collect();
    controller.subscribe(listener);
    controller.play();
    vi.advanceTimersByTime(250);
    const count = events.length;

    controller.destroy();
    vi.advanceTimersByTime(2000);

    expect(clock.setInterval).toHaveBeenCalledTimes(1);
    expect(clock.clearInterval).toHaveBeenCalledWith(7);
    expect(events.length).toBe(count);
  });
});
