import { describe, expect, it } from 'vitest';
import {
  applyBeatEdits,
  effectiveBeat,
  effectiveBeatSnapshot,
  findBeat,
  latestEdit,
  snapshotFromBeat,
} from './edits.js';
import type { BeatEdit } from './schemas.js';
import { makeReviewDocument, NARRATION_ONE, NARRATION_TWO } from './test-fixtures.js';

function edit(overrides: Partial<BeatEdit> = {}): BeatEdit {
  return {
    id: 'edit_1',
    beatId: 'beat_one',
    source: 'manual',
    reviewer: 'local',
    createdAt: '2026-10-17T00:00:00.000Z',
    title: 'The overview, edited',
    narration: NARRATION_TWO,
    suggestedQuestions: ['What changed?'],
    diagramFocus: { diagramId: 'diagram_one', nodeIds: ['n_target'], edgeIds: [] },
    ...overrides,
  };
}

describe('beat edits', () => {
  it('returns the document untouched when there are no edits', () => {
    const document = makeReviewDocument();
    expect(applyBeatEdits(document, [])).toBe(document);
  });

  it('applies the latest edit for a beat and keeps the anchors', () => {
    const document = makeReviewDocument();
    const first = edit({ id: 'edit_1', title: 'First pass' });
    const second = edit({
      id: 'edit_2',
      title: 'Second pass',
      createdAt: '2026-10-17T01:00:00.000Z',
    });

    const effective = applyBeatEdits(document, [first, second]);
    const beat = findBeat(effective, 'beat_one')?.beat;

    expect(beat?.title).toBe('Second pass');
    expect(beat?.anchors.map((anchor) => anchor.id)).toEqual(['anchor_readme']);
    expect(beat?.durationMs).toBeUndefined();
    expect(latestEdit([first, second], 'beat_one')?.id).toBe('edit_2');
    expect(effectiveBeat(document, [first, second], 'beat_one')?.title).toBe(
      'Second pass',
    );
  });

  it('reports the effective snapshot a form would edit', () => {
    const document = makeReviewDocument();
    const snapshot = effectiveBeatSnapshot(document, [edit()], 'beat_one');

    expect(snapshot).toEqual({
      title: 'The overview, edited',
      narration: NARRATION_TWO,
      suggestedQuestions: ['What changed?'],
      diagramFocus: { diagramId: 'diagram_one', nodeIds: ['n_target'], edgeIds: [] },
    });
    const firstBeat = document.chapters[0]?.beats[0];
    if (!firstBeat) {
      throw new Error('the fixture has no first beat');
    }
    expect(snapshotFromBeat(firstBeat)).toEqual({
      title: 'The overview',
      narration: NARRATION_ONE,
      suggestedQuestions: ['What does the project do?'],
      diagramFocus: {
        diagramId: 'diagram_one',
        nodeIds: ['n_source'],
        edgeIds: ['e_flow'],
      },
    });
  });

  it('returns null for an unknown beat', () => {
    const document = makeReviewDocument();
    expect(findBeat(document, 'beat_missing')).toBeNull();
    expect(effectiveBeat(document, [], 'beat_missing')).toBeNull();
    expect(effectiveBeatSnapshot(document, [], 'beat_missing')).toBeNull();
  });

  it('removes suggested questions when an edit clears them', () => {
    const document = makeReviewDocument();
    const effective = applyBeatEdits(document, [edit({ suggestedQuestions: [] })]);
    expect(findBeat(effective, 'beat_one')?.beat.suggestedQuestions).toBeUndefined();
  });
});
