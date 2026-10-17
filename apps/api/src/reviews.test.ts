import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Hono } from 'hono';
import { afterEach, describe, expect, it } from 'vitest';
import { FakeGuideModel, type BeatDraft, type GuideModel } from '@sothspell/authoring';
import { parseSothspell, type SothspellDocument } from '@sothspell/core';
import {
  createMemoryTourSource,
  createReviewService,
  createReviewStore,
  type ReviewService,
} from '@sothspell/review';
import { createApp } from './app.js';
import { registerReviewRoutes } from './reviews.js';

const GOLDEN_TOUR_PATH = new URL(
  '../../../examples/bunbun-tour/tour.json',
  import.meta.url,
);

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

async function goldenDocument(): Promise<SothspellDocument> {
  return parseSothspell(JSON.parse(await readFile(GOLDEN_TOUR_PATH, 'utf8')) as unknown);
}

/** The golden tour with one excerpt edited after hashing: a stale evidence set. */
function tamperedDocument(document: SothspellDocument): SothspellDocument {
  const [firstChapter, ...rest] = document.chapters;
  const [firstBeat, ...otherBeats] = firstChapter!.beats;
  const [firstAnchor, ...otherAnchors] = firstBeat!.anchors;
  return {
    ...document,
    chapters: [
      {
        ...firstChapter!,
        beats: [
          {
            ...firstBeat!,
            anchors: [
              { ...firstAnchor!, excerpt: 'the excerpt was edited after hashing' },
              ...otherAnchors,
            ],
          },
          ...otherBeats,
        ],
      },
      ...rest,
    ],
  };
}

function makeFakeModel(): FakeGuideModel {
  return new FakeGuideModel(({ schemaName, prompt }) => {
    if (schemaName !== 'BeatDraft') {
      throw new Error(`unexpected schema ${schemaName}`);
    }
    const anchorIds = [...prompt.matchAll(/- id: (\S+)/g)].map((match) => match[1]!);
    const nodes = /focused nodes: ([^\n]*)/.exec(prompt)?.[1] ?? 'none';
    const edges = /focused edges: ([^\n]*)/.exec(prompt)?.[1] ?? 'none';
    return {
      title: 'A regenerated opening beat',
      narration:
        'The regenerated beat restates the opening claim with the same evidence and a different emphasis. It keeps the anchors the original beat cited, so the reader can trace every sentence back to the repository, and it leaves the rest of the tour alone because regeneration is scoped to one beat. Comparing the two versions is the point: the review stores the previous narration so the change can be reverted.',
      anchorIds,
      nodeIds: nodes === 'none' ? [] : nodes.split(', '),
      edgeIds: edges === 'none' ? [] : edges.split(', '),
      suggestedQuestions: ['What changed in the regenerated beat?'],
    } satisfies BeatDraft;
  }, 'fake-api-review');
}

interface HarnessOptions {
  document: SothspellDocument;
  model?: GuideModel | null;
}

function makeService(options: HarnessOptions): {
  service: ReviewService;
  model: FakeGuideModel;
} {
  const model =
    options.model === undefined ? makeFakeModel() : (options.model as FakeGuideModel);
  const service = createReviewService({
    store: createReviewStore(':memory:'),
    tours: createMemoryTourSource({ tour_bunbun_golden: options.document }),
    sourceRoot: null,
    resolveModel: async () => model,
    clock: () => new Date('2026-10-17T00:00:00.000Z'),
  });
  return { service, model };
}

function directApp(service: ReviewService): Hono {
  const app = new Hono();
  registerReviewRoutes(app, { service });
  return app;
}

async function jsonBody<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

describe('review routes (mounted directly)', () => {
  it('starts a review once per tour revision', async () => {
    const { service } = makeService({ document: await goldenDocument() });
    const app = directApp(service);

    const first = await app.request('/api/reviews', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tourId: 'tour_bunbun_golden' }),
    });
    expect(first.status).toBe(201);
    const started = await jsonBody<{ review: { id: string; state: string } }>(first);
    expect(started.review.state).toBe('in_review');

    const second = await app.request('/api/reviews', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tourId: 'tour_bunbun_golden' }),
    });
    expect(second.status).toBe(200);
    expect((await jsonBody<{ review: { id: string } }>(second)).review.id).toBe(
      started.review.id,
    );

    const invalid = await app.request('/api/reviews', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tourId: '' }),
    });
    expect(invalid.status).toBe(400);

    const unknown = await app.request('/api/reviews', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tourId: 'tour_missing' }),
    });
    expect(unknown.status).toBe(404);
  });

  it('returns the review detail with the effective tour and anchor checks', async () => {
    const { service } = makeService({ document: await goldenDocument() });
    const app = directApp(service);
    const started = await jsonBody<{ review: { id: string } }>(
      await app.request('/api/reviews', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tourId: 'tour_bunbun_golden' }),
      }),
    );

    const response = await app.request(`/api/reviews/${started.review.id}`);
    expect(response.status).toBe(200);
    const detail = await jsonBody<{
      review: { id: string };
      tour: { id: string; chapters: unknown[] };
      quality: unknown;
      anchors: Array<{ status: string }>;
    }>(response);

    expect(detail.tour.id).toBe('tour_bunbun_golden');
    expect(detail.tour.chapters.length).toBe(6);
    expect(detail.quality).toBeNull();
    expect(detail.anchors.length).toBeGreaterThan(0);
    expect(detail.anchors.every((check) => check.status === 'verified')).toBe(true);

    const missing = await app.request('/api/reviews/review_missing');
    expect(missing.status).toBe(404);
  });

  it('adds comments and rejects an unknown beat', async () => {
    const { service } = makeService({ document: await goldenDocument() });
    const app = directApp(service);
    const started = await jsonBody<{ review: { id: string } }>(
      await app.request('/api/reviews', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tourId: 'tour_bunbun_golden' }),
      }),
    );

    const created = await app.request(`/api/reviews/${started.review.id}/comments`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ beatId: 'beat_purpose_01', body: 'Tighten this claim.' }),
    });
    expect(created.status).toBe(201);
    const body = await jsonBody<{ review: { comments: Array<{ body: string }> } }>(
      created,
    );
    expect(body.review.comments[0]?.body).toBe('Tighten this claim.');

    const unknownBeat = await app.request(`/api/reviews/${started.review.id}/comments`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ beatId: 'beat_missing', body: 'Hello there.' }),
    });
    expect(unknownBeat.status).toBe(404);

    const invalid = await app.request(`/api/reviews/${started.review.id}/comments`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ body: '' }),
    });
    expect(invalid.status).toBe(400);
  });

  it('edits a beat and reports validation issues as 422', async () => {
    const { service } = makeService({ document: await goldenDocument() });
    const app = directApp(service);
    const started = await jsonBody<{ review: { id: string } }>(
      await app.request('/api/reviews', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tourId: 'tour_bunbun_golden' }),
      }),
    );

    const edited = await app.request(
      `/api/reviews/${started.review.id}/beats/beat_purpose_01`,
      {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: 'Two sources, one conversation, revised' }),
      },
    );
    expect(edited.status).toBe(200);
    const body = await jsonBody<{
      review: { edits: Array<{ title: string; source: string }> };
    }>(edited);
    expect(body.review.edits[0]).toMatchObject({
      title: 'Two sources, one conversation, revised',
      source: 'manual',
    });

    const invalid = await app.request(
      `/api/reviews/${started.review.id}/beats/beat_purpose_01`,
      {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ narration: 'too short' }),
      },
    );
    expect(invalid.status).toBe(422);
    const issues = await jsonBody<{
      code: string;
      issues: Array<{ field: string }>;
    }>(invalid);
    expect(issues.code).toBe('invalid_input');
    expect(issues.issues).toContainEqual(expect.objectContaining({ field: 'narration' }));

    const unknownBeat = await app.request(
      `/api/reviews/${started.review.id}/beats/beat_missing`,
      {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: 'Nothing here' }),
      },
    );
    expect(unknownBeat.status).toBe(404);
  });

  it('regenerates and reverts a beat with the injected model', async () => {
    const { service, model } = makeService({ document: await goldenDocument() });
    const app = directApp(service);
    const started = await jsonBody<{ review: { id: string } }>(
      await app.request('/api/reviews', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tourId: 'tour_bunbun_golden' }),
      }),
    );

    const response = await app.request(
      `/api/reviews/${started.review.id}/beats/beat_purpose_01/regenerate`,
      { method: 'POST' },
    );
    expect(response.status).toBe(200);
    const body = await jsonBody<{
      regeneration: {
        id: string;
        modelId: string;
        previous: { narration: string };
        generated: { narration: string };
      };
    }>(response);
    expect(body.regeneration.modelId).toBe('fake-api-review');
    expect(body.regeneration.previous.narration).not.toBe(
      body.regeneration.generated.narration,
    );
    expect(model.calls).toHaveLength(1);

    const detail = await jsonBody<{
      tour: { chapters: Array<{ beats: Array<{ id: string; title: string }> }> };
    }>(await app.request(`/api/reviews/${started.review.id}`));
    expect(detail.tour.chapters[0]?.beats[0]?.title).toBe('A regenerated opening beat');

    const revert = await app.request(
      `/api/reviews/${started.review.id}/regenerations/${body.regeneration.id}/revert`,
      { method: 'POST' },
    );
    expect(revert.status).toBe(200);
    const reverted = await jsonBody<{
      review: { regenerations: Array<{ revertedAt: string | null }> };
    }>(revert);
    expect(reverted.review.regenerations[0]?.revertedAt).not.toBeNull();
  });

  it('refuses regeneration when no model is configured', async () => {
    const { service } = makeService({
      document: await goldenDocument(),
      model: null,
    });
    const app = directApp(service);
    const started = await jsonBody<{ review: { id: string } }>(
      await app.request('/api/reviews', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tourId: 'tour_bunbun_golden' }),
      }),
    );

    const response = await app.request(
      `/api/reviews/${started.review.id}/beats/beat_purpose_01/regenerate`,
      { method: 'POST' },
    );
    expect(response.status).toBe(503);
    expect((await jsonBody<{ code: string }>(response)).code).toBe('model_unavailable');
  });

  it('approves with verified anchors and blocks a stale tour', async () => {
    const { service } = makeService({ document: await goldenDocument() });
    const app = directApp(service);
    const started = await jsonBody<{ review: { id: string } }>(
      await app.request('/api/reviews', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tourId: 'tour_bunbun_golden' }),
      }),
    );

    const approved = await app.request(`/api/reviews/${started.review.id}/decide`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ decision: 'approve' }),
    });
    expect(approved.status).toBe(200);
    const body = await jsonBody<{
      review: {
        state: string;
        decisions: Array<{ anchorVerification: { ok: boolean } }>;
      };
    }>(approved);
    expect(body.review.state).toBe('approved');
    expect(body.review.decisions[0]?.anchorVerification.ok).toBe(true);
  });

  it('blocks approval on a stale anchor and requires a rejection reason', async () => {
    const stale = tamperedDocument(await goldenDocument());
    const { service } = makeService({ document: stale });
    const app = directApp(service);
    const started = await jsonBody<{ review: { id: string } }>(
      await app.request('/api/reviews', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tourId: 'tour_bunbun_golden' }),
      }),
    );

    const blocked = await app.request(`/api/reviews/${started.review.id}/decide`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ decision: 'approve' }),
    });
    expect(blocked.status).toBe(409);
    const blockedBody = await jsonBody<{ code: string; details: string[] }>(blocked);
    expect(blockedBody.code).toBe('anchor_verification_failed');
    expect(blockedBody.details[0]).toMatch(/anchor_readme_overview \(mismatch/);

    const noReason = await app.request(`/api/reviews/${started.review.id}/decide`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ decision: 'reject' }),
    });
    expect(noReason.status).toBe(422);
    expect((await jsonBody<{ code: string }>(noReason)).code).toBe('reason_required');

    const rejected = await app.request(`/api/reviews/${started.review.id}/decide`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        decision: 'reject',
        reason: 'The excerpt no longer matches.',
      }),
    });
    expect(rejected.status).toBe(200);
    expect((await jsonBody<{ review: { state: string } }>(rejected)).review.state).toBe(
      'rejected',
    );
  });

  it('exports the report as markdown and JSON', async () => {
    const { service } = makeService({ document: await goldenDocument() });
    const app = directApp(service);
    const started = await jsonBody<{ review: { id: string } }>(
      await app.request('/api/reviews', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tourId: 'tour_bunbun_golden' }),
      }),
    );
    await app.request(`/api/reviews/${started.review.id}/comments`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ beatId: null, body: 'Reads well.' }),
    });

    const markdown = await app.request(`/api/reviews/${started.review.id}/export`);
    expect(markdown.status).toBe(200);
    expect(markdown.headers.get('content-type')).toContain('text/markdown');
    expect(await markdown.text()).toContain('Reads well.');

    const json = await app.request(
      `/api/reviews/${started.review.id}/export?format=json`,
    );
    expect(json.status).toBe(200);
    expect(json.headers.get('content-type')).toContain('application/json');
    const report = await jsonBody<{ formatVersion: number }>(json);
    expect(report.formatVersion).toBe(1);

    const badFormat = await app.request(
      `/api/reviews/${started.review.id}/export?format=xml`,
    );
    expect(badFormat.status).toBe(400);
  });
});

describe('review routes (through createApp)', () => {
  it('serves the review round trip with an injected store and fake model', async () => {
    const { service } = makeService({ document: await goldenDocument() });
    const app = createApp({ databasePath: ':memory:', reviewService: service });

    const started = await app.request('/api/reviews', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tourId: 'tour_bunbun_golden' }),
    });
    expect(started.status).toBe(201);
    const reviewId = (await jsonBody<{ review: { id: string } }>(started)).review.id;

    const detail = await app.request(`/api/reviews/${reviewId}`);
    expect(detail.status).toBe(200);

    const commented = await app.request(`/api/reviews/${reviewId}/comments`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        beatId: 'beat_purpose_01',
        body: 'One more source, please.',
      }),
    });
    expect(commented.status).toBe(201);

    const decided = await app.request(`/api/reviews/${reviewId}/decide`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ decision: 'approve', reason: 'Ready for the demo.' }),
    });
    expect(decided.status).toBe(200);
    expect((await jsonBody<{ review: { state: string } }>(decided)).review.state).toBe(
      'approved',
    );
  });

  it('wires the golden tour and the excerpt fallback by default', async () => {
    const app = createApp({ databasePath: ':memory:', projectRoot: null });

    const started = await app.request('/api/reviews', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tourId: 'tour_bunbun_golden' }),
    });
    expect(started.status).toBe(201);
    const reviewId = (await jsonBody<{ review: { id: string } }>(started)).review.id;

    const approved = await app.request(`/api/reviews/${reviewId}/decide`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ decision: 'approve' }),
    });
    expect(approved.status).toBe(200);
    const body = await jsonBody<{
      review: {
        decisions: Array<{ anchorVerification: { checks: Array<{ status: string }> } }>;
      };
    }>(approved);
    expect(body.review.decisions[0]?.anchorVerification.checks).not.toContainEqual(
      expect.objectContaining({ status: 'mismatch' }),
    );
  });

  it('blocks approval when the configured project root no longer matches', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'sothspell-api-review-'));
    roots.push(root);
    const app = createApp({ databasePath: ':memory:', projectRoot: root });

    const started = await app.request('/api/reviews', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tourId: 'tour_bunbun_golden' }),
    });
    const reviewId = (await jsonBody<{ review: { id: string } }>(started)).review.id;

    const blocked = await app.request(`/api/reviews/${reviewId}/decide`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ decision: 'approve' }),
    });
    expect(blocked.status).toBe(409);
    const body = await jsonBody<{ code: string; details: string[] }>(blocked);
    expect(body.code).toBe('anchor_verification_failed');
    expect(body.details.length).toBeGreaterThan(0);
    expect(body.details[0]).toMatch(/\(missing: the anchored file is not present/);
  });
});
