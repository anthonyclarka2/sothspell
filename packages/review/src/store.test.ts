import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createReviewStore } from './store.js';
import type { BeatEdit, ReviewSession } from './schemas.js';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

async function tempDatabase(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'sothspell-review-store-'));
  roots.push(root);
  return path.join(root, 'sothspell.db');
}

function session(overrides: Partial<ReviewSession> = {}): ReviewSession {
  return {
    id: 'review_1',
    tourId: 'tour_fixture',
    tourRevision: 'sha256:aaaa',
    state: 'in_review',
    reviewer: 'local',
    createdAt: '2026-10-17T00:00:00.000Z',
    updatedAt: '2026-10-17T00:00:00.000Z',
    comments: [],
    edits: [],
    regenerations: [],
    decisions: [],
    ...overrides,
  };
}

function edit(id: string, createdAt: string): BeatEdit {
  return {
    id,
    beatId: 'beat_one',
    source: 'manual',
    reviewer: 'local',
    createdAt,
    title: `Title ${id}`,
    narration: 'A narration long enough to satisfy the schema minimum of twenty.',
    suggestedQuestions: [],
    diagramFocus: { diagramId: 'diagram_one', nodeIds: ['n_source'], edgeIds: [] },
  };
}

describe('review store', () => {
  it('round-trips a session with its audit trail', async () => {
    const store = createReviewStore(':memory:');
    store.createSession(session());
    store.appendComment(
      'review_1',
      {
        id: 'comment_1',
        beatId: 'beat_one',
        author: 'local',
        body: 'The claim about the index needs a source.',
        createdAt: '2026-10-17T00:01:00.000Z',
      },
      '2026-10-17T00:01:00.000Z',
    );
    store.appendEdit(
      'review_1',
      edit('edit_1', '2026-10-17T00:02:00.000Z'),
      '2026-10-17T00:02:00.000Z',
    );
    store.appendRegeneration(
      'review_1',
      {
        id: 'regen_1',
        beatId: 'beat_one',
        previous: {
          title: 'Before',
          narration: 'The previous narration.',
          suggestedQuestions: [],
          diagramFocus: { diagramId: 'diagram_one', nodeIds: [], edgeIds: [] },
        },
        generated: {
          title: 'After',
          narration: 'The generated narration.',
          suggestedQuestions: ['Why?'],
          diagramFocus: { diagramId: 'diagram_one', nodeIds: ['n_source'], edgeIds: [] },
        },
        modelId: 'fake',
        createdAt: '2026-10-17T00:03:00.000Z',
        revertedAt: null,
        editId: 'edit_1',
      },
      '2026-10-17T00:03:00.000Z',
    );
    store.appendDecision(
      'review_1',
      {
        id: 'decision_1',
        kind: 'approved',
        reviewer: 'local',
        reason: null,
        anchorVerification: {
          checkedAt: '2026-10-17T00:04:00.000Z',
          ok: true,
          checks: [],
        },
        qualityOverride: false,
        decidedAt: '2026-10-17T00:04:00.000Z',
      },
      '2026-10-17T00:04:00.000Z',
    );
    store.updateState('review_1', 'approved', '2026-10-17T00:04:00.000Z');

    const loaded = store.getSession('review_1');
    expect(loaded).toMatchObject({
      id: 'review_1',
      state: 'approved',
      updatedAt: '2026-10-17T00:04:00.000Z',
    });
    expect(loaded?.comments).toHaveLength(1);
    expect(loaded?.edits[0]?.diagramFocus.nodeIds).toEqual(['n_source']);
    expect(loaded?.regenerations[0]?.previous.title).toBe('Before');
    expect(loaded?.decisions[0]?.kind).toBe('approved');
    store.close();
  });

  it('survives a reopen and keeps its migrations idempotent', async () => {
    const databasePath = await tempDatabase();
    const first = createReviewStore(databasePath);
    first.createSession(session());
    first.close();

    // Opening the same file runs the same CREATE TABLE IF NOT EXISTS batch.
    const second = createReviewStore(databasePath);
    expect(second.getSession('review_1')?.tourId).toBe('tour_fixture');
    second.close();
  });

  it('finds a session by tour revision and filters the list', async () => {
    const store = createReviewStore(':memory:');
    store.createSession(session({ id: 'review_1', tourRevision: 'sha256:aaaa' }));
    store.createSession(
      session({
        id: 'review_2',
        tourId: 'tour_other',
        tourRevision: 'sha256:bbbb',
        state: 'approved',
        updatedAt: '2026-10-17T00:05:00.000Z',
      }),
    );

    expect(store.findByRevision('tour_fixture', 'sha256:aaaa')?.id).toBe('review_1');
    expect(store.findByRevision('tour_fixture', 'sha256:zzzz')).toBeNull();
    expect(store.listSessions().map((entry) => entry.id)).toEqual([
      'review_2',
      'review_1',
    ]);
    expect(store.listSessions({ tourId: 'tour_fixture' })).toHaveLength(1);
    expect(store.listSessions({ state: 'approved' })[0]?.id).toBe('review_2');
    store.close();
  });

  it('orders comments by their creation time', async () => {
    const store = createReviewStore(':memory:');
    store.createSession(session());
    store.appendComment(
      'review_1',
      {
        id: 'comment_b',
        beatId: null,
        author: 'local',
        body: 'Second in time, inserted first.',
        createdAt: '2026-10-17T00:02:00.000Z',
      },
      '2026-10-17T00:02:00.000Z',
    );
    store.appendComment(
      'review_1',
      {
        id: 'comment_a',
        beatId: 'beat_one',
        author: 'local',
        body: 'First in time, inserted second.',
        createdAt: '2026-10-17T00:01:00.000Z',
      },
      '2026-10-17T00:02:00.000Z',
    );

    expect(store.getSession('review_1')?.comments.map((comment) => comment.id)).toEqual([
      'comment_a',
      'comment_b',
    ]);
    store.close();
  });

  it('marks a regeneration reverted without losing the record', async () => {
    const store = createReviewStore(':memory:');
    store.createSession(session());
    store.appendRegeneration(
      'review_1',
      {
        id: 'regen_1',
        beatId: 'beat_one',
        previous: {
          title: 'Before',
          narration: 'The previous narration.',
          suggestedQuestions: [],
          diagramFocus: { diagramId: null, nodeIds: [], edgeIds: [] },
        },
        generated: {
          title: 'After',
          narration: 'The generated narration.',
          suggestedQuestions: [],
          diagramFocus: { diagramId: null, nodeIds: [], edgeIds: [] },
        },
        modelId: 'fake',
        createdAt: '2026-10-17T00:03:00.000Z',
        revertedAt: null,
        editId: 'edit_1',
      },
      '2026-10-17T00:03:00.000Z',
    );
    store.markRegenerationReverted(
      'review_1',
      'regen_1',
      '2026-10-17T00:05:00.000Z',
      '2026-10-17T00:05:00.000Z',
    );

    const loaded = store.getSession('review_1');
    expect(loaded?.regenerations[0]?.revertedAt).toBe('2026-10-17T00:05:00.000Z');
    expect(loaded?.regenerations[0]?.generated.title).toBe('After');
    store.close();
  });
});
