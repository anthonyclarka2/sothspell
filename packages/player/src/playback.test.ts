import { describe, expect, it } from 'vitest';
import { createPlayback } from './playback.js';

const tour = {
  id: 'tour_playback_test',
  title: 'Playback test',
  chapters: [
    {
      id: 'chapter_one',
      title: 'One',
      beats: [
        { id: 'beat_one', title: 'First', durationMs: 10_000 },
        { id: 'beat_two', title: 'Second', durationMs: 5_000 },
      ],
    },
    {
      id: 'chapter_two',
      title: 'Two',
      beats: [{ id: 'beat_three', title: 'Third', durationMs: 8_000 }],
    },
  ],
};

describe('playback engine', () => {
  it('starts idle on the first beat', () => {
    const playback = createPlayback(tour);
    const snapshot = playback.getSnapshot();

    expect(snapshot.status).toBe('idle');
    expect(snapshot.beatId).toBe('beat_one');
    expect(snapshot.offsetMs).toBe(0);
    expect(snapshot.totalDurationMs).toBe(23_000);
  });

  it('advances time only while playing', () => {
    const playback = createPlayback(tour);

    playback.tick(1_000);
    expect(playback.getSnapshot().offsetMs).toBe(0);

    playback.play();
    playback.tick(1_000);
    expect(playback.getSnapshot().offsetMs).toBe(1_000);

    playback.pause();
    playback.tick(1_000);
    expect(playback.getSnapshot().offsetMs).toBe(1_000);
  });

  it('auto-advances across beats and chapters', () => {
    const playback = createPlayback(tour);
    const started: string[] = [];
    playback.subscribe((event) => {
      if (event.type === 'beat.started') {
        started.push(event.snapshot.beatId);
      }
    });

    playback.play();
    playback.tick(10_000);
    expect(playback.getSnapshot().beatId).toBe('beat_two');

    playback.tick(5_000);
    expect(playback.getSnapshot().beatId).toBe('beat_three');
    expect(playback.getSnapshot().chapterId).toBe('chapter_two');
    expect(started).toEqual(['beat_one', 'beat_two', 'beat_three']);
  });

  it('completes after the final beat and restarts on play', () => {
    const playback = createPlayback(tour);
    const completed: string[] = [];
    playback.subscribe((event) => {
      if (event.type === 'tour.completed') {
        completed.push(event.snapshot.beatId);
      }
    });

    playback.play();
    playback.tick(100_000);

    expect(playback.getSnapshot().status).toBe('completed');
    expect(completed).toEqual(['beat_three']);

    playback.play();
    const restarted = playback.getSnapshot();
    expect(restarted.status).toBe('playing');
    expect(restarted.beatId).toBe('beat_one');
    expect(restarted.offsetMs).toBe(0);
  });

  it('moves to the next and previous beat and seeks by id', () => {
    const playback = createPlayback(tour);

    playback.next();
    expect(playback.getSnapshot().beatId).toBe('beat_two');

    playback.previous();
    expect(playback.getSnapshot().beatId).toBe('beat_one');

    playback.seekBeat('beat_three');
    expect(playback.getSnapshot().beatId).toBe('beat_three');
    expect(playback.getSnapshot().chapterId).toBe('chapter_two');
  });

  it('reports global progress as a fraction of the whole tour', () => {
    const playback = createPlayback(tour);

    playback.play();
    playback.tick(5_000);

    expect(playback.getSnapshot().progress).toBeCloseTo(5_000 / 23_000, 4);
  });

  it('scales the clock by the playback speed', () => {
    const playback = createPlayback(tour);

    playback.setSpeed(2);
    playback.play();
    playback.tick(1_000);

    const snapshot = playback.getSnapshot();
    expect(snapshot.speed).toBe(2);
    expect(snapshot.offsetMs).toBe(2_000);
    expect(snapshot.elapsedMs).toBe(2_000);
  });

  it('seeks to a global progress fraction across chapters', () => {
    const playback = createPlayback(tour);

    playback.seekProgress(0.5);
    const snapshot = playback.getSnapshot();

    expect(snapshot.elapsedMs).toBeGreaterThanOrEqual(11_500);
    expect(snapshot.beatId).toBe('beat_two');
    expect(snapshot.offsetMs).toBe(1_500);
  });
});
