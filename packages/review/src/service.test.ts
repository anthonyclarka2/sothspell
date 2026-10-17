import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { FakeGuideModel, type BeatDraft } from '@sothspell/authoring';
import { createReviewService, type ReviewService } from './service.js';
import { createReviewStore, type ReviewStore } from './store.js';
import { createMemoryTourSource } from './tour-source.js';
import { ReviewError } from './errors.js';
import type { ReviewQuality } from './schemas.js';
import { makeReviewDocument, writeFixtureSource } from './test-fixtures.js';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

function qualityReport(overrides: Partial<ReviewQuality> = {}): ReviewQuality {
  return {
    planChapters: 2,
    chapters: 2,
    beats: 3,
    anchors: 3,
    droppedChapters: 0,
    issues: [],
    modelCalls: 4,
    cacheHits: 0,
    usage: { inputTokens: 100, outputTokens: 200, totalTokens: 300 },
    promptVersion: '1.0.0',
    modelId: 'fake',
    estimatedDurationMs: 120000,
    ...overrides,
  };
}

interface Harness {
  service: ReviewService;
  store: ReviewStore;
  model: FakeGuideModel;
  calls: number;
  tick: () => string;
}

function harness(
  options: {
    sourceRoot?: string | null;
    quality?: ReviewQuality | null;
    model?: FakeGuideModel | null;
    reviewer?: string;
  } = {},
): Harness {
  const store = createReviewStore(':memory:');
  let seconds = 0;
  const tick = (): string => {
    seconds += 1;
    return new Date(Date.UTC(2026, 9, 17, 0, 0, seconds)).toISOString();
  };
  const state = { calls: 0 };
  const model =
    options.model === undefined
      ? new FakeGuideModel(({ schemaName, prompt }) => {
          if (schemaName !== 'BeatDraft') {
            throw new Error(`unexpected schema ${schemaName}`);
          }
          state.calls += 1;
          // The prompt names the beat's evidence; the fake keeps it, which is
          // exactly the contract a real regeneration must satisfy.
          const anchorIds = [...prompt.matchAll(/- id: (\S+)/g)].map(
            (match) => match[1]!,
          );
          const nodes = /focused nodes: ([^\n]*)/.exec(prompt)?.[1] ?? '';
          const edges = /focused edges: ([^\n]*)/.exec(prompt)?.[1] ?? '';
          return {
            title: 'The overview, regenerated',
            narration:
              'The regenerated narration restates the overview with the same evidence and a different emphasis. It keeps the claim about the project purpose anchored to the README excerpt, and it avoids inventing behavior the excerpt does not show. The reader can compare this version with the previous one and keep whichever reads better, because the review stores both.',
            anchorIds,
            nodeIds: nodes === 'none' || nodes === '' ? [] : nodes.split(', '),
            edgeIds: edges === 'none' || edges === '' ? [] : edges.split(', '),
            suggestedQuestions: ['What changed in the regeneration?'],
          } satisfies BeatDraft;
        }, 'fake-review')
      : options.model;

  const service = createReviewService({
    store,
    tours: createMemoryTourSource({
      tour_fixture: {
        document: makeReviewDocument(),
        revision: 'sha256:fixture',
        quality: options.quality === undefined ? null : options.quality,
      },
    }),
    sourceRoot: options.sourceRoot ?? null,
    resolveModel: async () => model,
    clock: () => new Date(tick()),
    generateId: (() => {
      let counter = 0;
      return (prefix: string) => {
        counter += 1;
        return `${prefix}_${counter}`;
      };
    })(),
  });

  return { service, store, model: model as FakeGuideModel, calls: state.calls, tick };
}

async function start(harnessed: Harness, reviewer?: string): Promise<string> {
  const { review } = await harnessed.service.start({
    tourId: 'tour_fixture',
    ...(reviewer === undefined ? {} : { reviewer }),
  });
  return review.id;
}

describe('review service', () => {
  it('starts a review once per tour revision', async () => {
    const harnessed = harness();
    const first = await harnessed.service.start({ tourId: 'tour_fixture' });
    expect(first.created).toBe(true);
    expect(first.review.state).toBe('in_review');
    expect(first.review.tourRevision).toBe('sha256:fixture');
    expect(first.review.reviewer).toBe('local');

    const second = await harnessed.service.start({ tourId: 'tour_fixture' });
    expect(second.created).toBe(false);
    expect(second.review.id).toBe(first.review.id);
  });

  it('reports an unknown tour', async () => {
    const harnessed = harness();
    await expect(harnessed.service.start({ tourId: 'tour_missing' })).rejects.toThrow(
      /unknown tour/,
    );
  });

  it('appends comments and refuses a comment on a decided review', async () => {
    const harnessed = harness();
    const id = await start(harnessed);

    const withComment = await harnessed.service.addComment(id, {
      beatId: 'beat_one',
      body: 'This claim needs a source.',
    });
    expect(withComment.comments).toHaveLength(1);
    expect(withComment.comments[0]?.author).toBe('local');

    await harnessed.service.addComment(id, {
      beatId: null,
      body: 'The outline reads well overall.',
    });
    expect((await harnessed.service.get(id))?.comments).toHaveLength(2);

    await expect(
      harnessed.service.addComment(id, { beatId: 'beat_missing', body: 'Hello there.' }),
    ).rejects.toThrow(/unknown beat/);

    await harnessed.service.decide(id, { decision: 'reject', reason: 'Not yet.' });
    await expect(
      harnessed.service.addComment(id, { beatId: null, body: 'One more thought.' }),
    ).rejects.toMatchObject({ code: 'review_closed' });
  });

  it('edits one beat, validates it, and reopens a decided review', async () => {
    const harnessed = harness();
    const id = await start(harnessed);

    await harnessed.service.decide(id, { decision: 'approve' });
    expect((await harnessed.service.get(id))?.state).toBe('approved');

    const edited = await harnessed.service.editBeat(id, 'beat_one', {
      title: 'The overview, clarified',
    });
    expect(edited.state).toBe('in_review');
    expect(edited.edits).toHaveLength(1);
    expect(edited.edits[0]).toMatchObject({
      source: 'manual',
      title: 'The overview, clarified',
      // The partial patch kept the fields it did not touch.
      suggestedQuestions: ['What does the project do?'],
    });

    await expect(
      harnessed.service.editBeat(id, 'beat_one', { narration: 'too short' }),
    ).rejects.toMatchObject({
      code: 'invalid_input',
      issues: [expect.objectContaining({ field: 'narration' })],
    });

    await expect(
      harnessed.service.editBeat(id, 'beat_one', { title: 'The entry point' }),
    ).rejects.toMatchObject({ code: 'invalid_input' });

    await expect(
      harnessed.service.editBeat(id, 'beat_missing', { title: 'Nothing' }),
    ).rejects.toThrow(/unknown beat/);
  });

  it('regenerates one beat from its anchors and stores the previous narration', async () => {
    const harnessed = harness();
    const id = await start(harnessed);
    const before = await harnessed.service.detail(id);

    const result = await harnessed.service.regenerateBeat(id, 'beat_one');
    expect(result.regeneration.beatId).toBe('beat_one');
    expect(result.regeneration.modelId).toBe('fake-review');
    expect(result.regeneration.previous.title).toBe('The overview');
    expect(result.regeneration.generated.title).toBe('The overview, regenerated');
    expect(result.regeneration.revertedAt).toBeNull();
    expect(result.review.edits).toHaveLength(1);
    expect(result.review.edits[0]?.source).toBe('regeneration');
    expect(harnessed.model.calls).toHaveLength(1);

    const after = await harnessed.service.detail(id);
    const beat = after?.tour.chapters[0]?.beats[0];
    expect(beat?.title).toBe('The overview, regenerated');
    expect(beat?.anchors.map((anchor) => anchor.id)).toEqual(['anchor_readme']);
    // The rest of the tour is untouched.
    expect(after?.tour.chapters[0]?.beats[1]?.title).toBe(
      before?.tour.chapters[0]?.beats[1]?.title,
    );
    expect(after?.tour.chapters[1]?.beats[0]?.narration).toBe(
      before?.tour.chapters[1]?.beats[0]?.narration,
    );
  });

  it('reverts a regeneration and serves a repeat from the context cache', async () => {
    const harnessed = harness();
    const id = await start(harnessed);

    const result = await harnessed.service.regenerateBeat(id, 'beat_one');
    const reverted = await harnessed.service.revertRegeneration(
      id,
      result.regeneration.id,
    );

    expect(reverted.regenerations[0]?.revertedAt).not.toBeNull();
    expect(reverted.edits.at(-1)?.source).toBe('revert');
    const detail = await harnessed.service.detail(id);
    expect(detail?.tour.chapters[0]?.beats[0]?.title).toBe('The overview');

    // The prompt is unchanged after the revert, so the cached draft is reused.
    await harnessed.service.regenerateBeat(id, 'beat_one');
    expect(harnessed.model.calls).toHaveLength(1);

    await expect(
      harnessed.service.revertRegeneration(id, result.regeneration.id),
    ).rejects.toMatchObject({ code: 'invalid_input' });
    await expect(
      harnessed.service.revertRegeneration(id, 'regen_missing'),
    ).rejects.toMatchObject({ code: 'not_found' });
  });

  it('refuses a regeneration without a model and one that breaks the beat', async () => {
    const harnessed = harness();
    const id = await start(harnessed);

    const noModel = createReviewService({
      store: createReviewStore(':memory:'),
      tours: createMemoryTourSource({ tour_fixture: makeReviewDocument() }),
      resolveModel: async () => null,
    });
    const noModelSession = await noModel.start({ tourId: 'tour_fixture' });
    await expect(
      noModel.regenerateBeat(noModelSession.review.id, 'beat_one'),
    ).rejects.toMatchObject({ code: 'model_unavailable' });

    const badModel = new FakeGuideModel(
      () => ({
        title: 'Bad draft',
        narration:
          'This narration is long enough to pass the word bound but it cites an anchor that the beat does not declare, which must fail validation for the review to stay honest about evidence.',
        anchorIds: ['anchor_context'],
        nodeIds: [],
        edgeIds: [],
      }),
      'fake-bad',
    );
    const strict = createReviewService({
      store: harnessed.store,
      tours: createMemoryTourSource({ tour_fixture: makeReviewDocument() }),
      resolveModel: async () => badModel,
      clock: () => new Date('2026-10-17T01:00:00.000Z'),
    });
    await expect(strict.regenerateBeat(id, 'beat_one')).rejects.toMatchObject({
      code: 'regeneration_failed',
      issues: [expect.objectContaining({ field: 'anchorIds' })],
    });
  });

  it('blocks approval when an anchor no longer matches, naming it', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'sothspell-review-stale-'));
    roots.push(root);
    await writeFixtureSource(root, {
      'src/main.ts': ['export function bootstrap() {', '  return "changed";', '}'],
    });
    const harnessed = harness({ sourceRoot: root });
    const id = await start(harnessed);

    try {
      await harnessed.service.decide(id, { decision: 'approve' });
      expect.unreachable('a stale anchor must block approval');
    } catch (error) {
      const reviewError = error as ReviewError;
      expect(reviewError.code).toBe('anchor_verification_failed');
      expect(reviewError.details).toEqual([
        expect.stringContaining('anchor_main (mismatch'),
      ]);
    }
    expect((await harnessed.service.get(id))?.state).toBe('in_review');
  });

  it('approves with fresh verification and records a quality override', async () => {
    const harnessed = harness({
      quality: qualityReport({
        issues: ['chapter two was repaired'],
        droppedChapters: 1,
      }),
    });
    const id = await start(harnessed);

    const decided = await harnessed.service.decide(id, {
      decision: 'approve',
      reason: 'Reviewed against the pinned revision.',
    });

    expect(decided.state).toBe('approved');
    const decision = decided.decisions[0];
    expect(decision?.kind).toBe('approved');
    expect(decision?.reason).toBe('Reviewed against the pinned revision.');
    expect(decision?.qualityOverride).toBe(true);
    expect(decision?.anchorVerification?.ok).toBe(true);
    expect(decision?.anchorVerification?.checks).toHaveLength(3);
  });

  it('requires a reason to reject and refuses a second decision', async () => {
    const harnessed = harness();
    const id = await start(harnessed);

    await expect(
      harnessed.service.decide(id, { decision: 'reject' }),
    ).rejects.toMatchObject({ code: 'reason_required' });
    await expect(
      harnessed.service.decide(id, { decision: 'reject', reason: '   ' }),
    ).rejects.toMatchObject({ code: 'reason_required' });

    const rejected = await harnessed.service.decide(id, {
      decision: 'reject',
      reason: 'The third beat claims behavior the excerpt does not show.',
    });
    expect(rejected.state).toBe('rejected');
    expect(rejected.decisions[0]).toMatchObject({
      kind: 'rejected',
      reason: 'The third beat claims behavior the excerpt does not show.',
      anchorVerification: null,
      qualityOverride: false,
    });

    await expect(
      harnessed.service.decide(id, { decision: 'approve' }),
    ).rejects.toMatchObject({ code: 'invalid_transition' });
  });

  it('binds a named reviewer and refuses another actor', async () => {
    const harnessed = harness();
    const id = await start(harnessed, 'ada');

    await expect(
      harnessed.service.addComment(id, { beatId: null, body: 'Mine.', author: 'bob' }),
    ).rejects.toMatchObject({ code: 'reviewer_mismatch' });

    const comment = await harnessed.service.addComment(id, {
      beatId: null,
      body: 'Mine.',
      author: 'ada',
    });
    expect(comment.comments[0]?.author).toBe('ada');
  });

  it('lists sessions and exports a markdown and JSON report', async () => {
    const harnessed = harness();
    const id = await start(harnessed);
    await harnessed.service.addComment(id, { beatId: 'beat_one', body: 'Tighten this.' });
    await harnessed.service.editBeat(id, 'beat_one', {
      title: 'The overview, tightened',
    });
    const regenerated = await harnessed.service.regenerateBeat(id, 'beat_two');
    await harnessed.service.decide(id, { decision: 'approve' });

    expect((await harnessed.service.list()).map((entry) => entry.id)).toEqual([id]);
    expect(await harnessed.service.list({ state: 'rejected' })).toEqual([]);

    const markdown = await harnessed.service.exportReport(id, 'markdown');
    expect(markdown).toContain(`# Review report — Fixture review tour`);
    expect(markdown).toContain('- Tour revision: sha256:fixture');
    expect(markdown).toContain('### approved — local');
    expect(markdown).toContain('Tighten this.');
    expect(markdown).toContain('The overview, tightened');
    expect(markdown).toContain(regenerated.regeneration.generated.narration);
    expect(markdown).toContain('Previous narration:');
    expect(markdown).toContain('## Quality report');

    const json = JSON.parse(await harnessed.service.exportReport(id, 'json')) as {
      formatVersion: number;
      review: { state: string; decisions: unknown[] };
      tour: { id: string; revisionHash: string };
      anchors: unknown[];
      effectiveBeats: Array<{ beatId: string; title: string; edited: boolean }>;
    };
    expect(json.formatVersion).toBe(1);
    expect(json.review.state).toBe('approved');
    expect(json.tour.revisionHash).toBe('sha256:fixture');
    expect(json.anchors).toHaveLength(3);
    expect(json.effectiveBeats).toContainEqual(
      expect.objectContaining({
        beatId: 'beat_two',
        title: 'The overview, regenerated',
        edited: true,
      }),
    );
  });

  it('returns null for an unknown review', async () => {
    const harnessed = harness();
    expect(await harnessed.service.detail('review_missing')).toBeNull();
    await expect(
      harnessed.service.editBeat('review_missing', 'beat_one', { title: 'X' }),
    ).rejects.toMatchObject({ code: 'not_found' });
  });
});
