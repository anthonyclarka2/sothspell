import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { parseSothspell, type SothspellDocument } from '@sothspell/core';
import {
  createMemoryTourSource,
  createReviewService,
  createReviewStore,
  type ReviewService,
} from '@sothspell/review';
import { runCli, type CliIO } from './cli.js';
import { runReview } from './review.js';

const GOLDEN_TOUR_PATH = new URL(
  '../../../examples/bunbun-tour/tour.json',
  import.meta.url,
);

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

interface Io {
  io: CliIO;
  stdout: string[];
  stderr: string[];
}

function makeIo(): Io {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    stdout,
    stderr,
    io: {
      stdout: (line) => stdout.push(line),
      stderr: (line) => stderr.push(line),
    },
  };
}

function makeService(document: SothspellDocument): ReviewService {
  return createReviewService({
    store: createReviewStore(':memory:'),
    tours: createMemoryTourSource({ tour_bunbun_golden: document }),
    sourceRoot: null,
    resolveModel: async () => null,
    clock: () => new Date('2026-10-17T00:00:00.000Z'),
  });
}

async function startedId(service: ReviewService): Promise<string> {
  const { review } = await service.start({ tourId: 'tour_bunbun_golden' });
  return review.id;
}

describe('sothspell review', () => {
  it('lists an empty store and then the started session', async () => {
    const service = makeService(await goldenDocument());
    const empty = makeIo();
    expect(await runReview(['list'], empty.io, { service })).toBe(0);
    expect(empty.stdout.join('\n')).toContain('No review sessions.');

    const id = await startedId(service);
    const list = makeIo();
    expect(await runReview(['list'], list.io, { service })).toBe(0);
    expect(list.stdout.join('\n')).toContain(id);
    expect(list.stdout.join('\n')).toContain('in_review');
    expect(list.stdout.join('\n')).toContain('tour_bunbun_golden');

    const filtered = makeIo();
    expect(
      await runReview(['list', '--tour', 'tour_other'], filtered.io, { service }),
    ).toBe(0);
    expect(filtered.stdout.join('\n')).toContain('No review sessions.');
  });

  it('lists as JSON and filters by state', async () => {
    const service = makeService(await goldenDocument());
    const id = await startedId(service);
    await service.decide(id, { decision: 'reject', reason: 'Not yet.' });

    const json = makeIo();
    expect(
      await runReview(['list', '--state', 'rejected', '--json'], json.io, { service }),
    ).toBe(0);
    const parsed = JSON.parse(json.stdout.join('\n')) as Array<{
      id: string;
      state: string;
    }>;
    expect(parsed).toEqual([expect.objectContaining({ id, state: 'rejected' })]);

    const badState = makeIo();
    expect(
      await runReview(['list', '--state', 'nonsense'], badState.io, { service }),
    ).toBe(2);
    expect(badState.stderr.join('\n')).toContain('--state must be one of');
  });

  it('shows a session and its audit trail', async () => {
    const service = makeService(await goldenDocument());
    const id = await startedId(service);
    await service.addComment(id, { beatId: 'beat_purpose_01', body: 'Tighten this.' });
    await service.editBeat(id, 'beat_purpose_01', { title: 'A revised opening' });

    const io = makeIo();
    expect(await runReview(['show', id], io.io, { service })).toBe(0);
    const output = io.stdout.join('\n');
    expect(output).toContain(`Review: ${id}`);
    expect(output).toContain('Tour revision: sha256:');
    expect(output).toContain('Tighten this.');
    expect(output).toContain('beat_purpose_01 · manual');
    expect(output).toContain('A revised opening');

    const json = makeIo();
    expect(await runReview(['show', id, '--json'], json.io, { service })).toBe(0);
    const parsed = JSON.parse(json.stdout.join('\n')) as { comments: unknown[] };
    expect(parsed.comments).toHaveLength(1);

    const missing = makeIo();
    expect(await runReview(['show', 'review_missing'], missing.io, { service })).toBe(1);
    expect(missing.stderr.join('\n')).toContain('unknown review');
  });

  it('approves after verifying anchors', async () => {
    const service = makeService(await goldenDocument());
    const id = await startedId(service);

    const io = makeIo();
    expect(await runReview(['approve', id], io.io, { service })).toBe(0);
    expect(io.stdout.join('\n')).toMatch(
      /Approved review_[0-9a-f]+ — \d+ anchors verified/,
    );
    expect((await service.get(id))?.state).toBe('approved');
  });

  it('blocks approval on a stale anchor with the named reason', async () => {
    const service = makeService(tamperedDocument(await goldenDocument()));
    const id = await startedId(service);

    const io = makeIo();
    expect(await runReview(['approve', id], io.io, { service })).toBe(1);
    expect(io.stderr.join('\n')).toContain('approval is blocked');
    expect(io.stderr.join('\n')).toContain('anchor_readme_overview (mismatch');
    expect((await service.get(id))?.state).toBe('in_review');
  });

  it('requires a reason to reject', async () => {
    const service = makeService(await goldenDocument());
    const id = await startedId(service);

    const missing = makeIo();
    expect(await runReview(['reject', id], missing.io, { service })).toBe(2);
    expect(missing.stderr.join('\n')).toContain('a rejection requires --reason');

    const io = makeIo();
    expect(
      await runReview(
        ['reject', id, '--reason', 'The third claim is unsupported.'],
        io.io,
        {
          service,
        },
      ),
    ).toBe(0);
    expect(io.stdout.join('\n')).toBe(`Rejected ${id}`);
    const session = await service.get(id);
    expect(session?.state).toBe('rejected');
    expect(session?.decisions[0]?.reason).toBe('The third claim is unsupported.');
  });

  it('reports usage errors and unknown commands', async () => {
    const io = makeIo();
    expect(
      await runReview([], io.io, { service: makeService(await goldenDocument()) }),
    ).toBe(0);
    expect(io.stdout.join('\n')).toContain('Usage:');

    const unknown = makeIo();
    expect(await runReview(['nonsense'], unknown.io, {})).toBe(2);
    expect(unknown.stderr.join('\n')).toContain('review needs a command');

    const noId = makeIo();
    expect(await runReview(['show'], noId.io, {})).toBe(2);
    expect(noId.stderr.join('\n')).toContain('review show needs a review id');
  });

  it('dispatches through runCli with an injected service', async () => {
    const service = makeService(await goldenDocument());
    const id = await startedId(service);

    const list = makeIo();
    expect(await runCli(['review', 'list'], list.io, { review: service })).toBe(0);
    expect(list.stdout.join('\n')).toContain(id);

    const approve = makeIo();
    expect(await runCli(['review', 'approve', id], approve.io, { review: service })).toBe(
      0,
    );
    expect(approve.stdout.join('\n')).toContain('Approved');
  });
});
