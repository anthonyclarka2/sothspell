import type { Page, Route } from '@playwright/test';
import type { CompiledBeat, CompiledChapter, CompiledTour } from '@sothspell/core';
import type {
  AnchorCheck,
  BeatEdit,
  BeatRegeneration,
  ReviewComment,
  ReviewDecision,
  ReviewQuality,
  ReviewSession,
} from '../src/lib/review-api.js';

/**
 * A stateful fake of the review API for browser tests. The real API is covered
 * by vitest; the e2e specs care about the UI contract, so this fake mirrors the
 * route shapes, the effective-tour rule (edits change what the reader shows),
 * and the named guard failures (stale anchors, a rejection without a reason)
 * without a server or a model provider.
 */

export const FIXTURE_TOUR_ID = 'tour_review_fixture';
export const FIXTURE_REVIEW_ID = 'review_fixture_1';

const NARRATION_ONE =
  'The fixture opens with the README overview. It names the project and gives the reader a first concrete place to stand, so the tour can build on a shared understanding before it looks at any code.';
const NARRATION_TWO =
  'The second beat points at the entry point instead of the documentation. The excerpt shows the exported function that starts the application, which is the smallest interesting unit a tour can explain without guessing at behavior.';
const NARRATION_THREE =
  'The third beat sits in a second chapter so the review can prove chapter-scoped validation. It cites the glossary file and focuses a diagram from its own chapter rather than reusing the first one.';
const REGENERATED_NARRATION =
  'The regenerated narration restates the opening claim with the same evidence and a different emphasis. It keeps the README excerpt as its anchor, explains why the overview matters before the tour reaches any code, and leaves the other beats alone because regeneration is scoped to one beat at a time.';

function anchor(
  id: string,
  path: string,
  label: string,
  startLine: number,
  endLine: number,
): CompiledBeat['anchors'][number] {
  return {
    id,
    path,
    startLine,
    endLine,
    language: path.endsWith('.md') ? 'markdown' : 'typescript',
    contentHash: `sha256:${id.padEnd(64, '0').slice(0, 64)}`,
    excerpt: `${label} excerpt`,
    html: `<span class="line">${label}</span>`,
    label,
  };
}

function beat(input: {
  id: string;
  title: string;
  narration: string;
  anchors: CompiledBeat['anchors'];
  diagramId: string;
  nodeIds: string[];
  edgeIds: string[];
  suggestedQuestions?: string[];
}): CompiledBeat {
  return {
    id: input.id,
    title: input.title,
    narration: input.narration,
    durationMs: 12000,
    anchors: input.anchors,
    stage: {
      anchorIds: input.anchors.map((entry) => entry.id),
      diagramId: input.diagramId,
      nodeIds: input.nodeIds,
      edgeIds: input.edgeIds,
    },
    suggestedQuestions: input.suggestedQuestions ?? [],
  };
}

export function makeFixtureTour(): CompiledTour {
  const chapters: CompiledChapter[] = [
    {
      id: 'chapter_one',
      title: 'The shape',
      summary: 'The overview and the entry point, read together.',
      diagrams: [
        {
          id: 'diagram_one',
          kind: 'architecture',
          title: 'Overview to entry point',
          // Deliberately wide: the diagram's intrinsic width must not push the
          // reader column over the review panel (a regression this guards).
          width: 1180,
          height: 260,
          nodes: [
            {
              id: 'n_source',
              label: 'README',
              type: 'file',
              x: 40,
              y: 40,
              width: 176,
              height: 56,
            },
            {
              id: 'n_api',
              label: 'API',
              type: 'service',
              x: 330,
              y: 40,
              width: 176,
              height: 56,
            },
            {
              id: 'n_pds',
              label: 'PDS',
              type: 'external',
              x: 620,
              y: 40,
              width: 176,
              height: 56,
            },
            {
              id: 'n_target',
              label: 'Entry point',
              type: 'module',
              x: 910,
              y: 150,
              width: 176,
              height: 56,
            },
          ],
          edges: [
            { id: 'e_flow', from: 'n_source', to: 'n_target', kind: 'depends' },
            { id: 'e_api', from: 'n_api', to: 'n_pds', kind: 'calls' },
          ],
        },
      ],
      beats: [
        beat({
          id: 'beat_one',
          title: 'The overview',
          narration: NARRATION_ONE,
          anchors: [anchor('anchor_readme', 'README.md', 'Fixture project', 1, 3)],
          diagramId: 'diagram_one',
          nodeIds: ['n_source'],
          edgeIds: ['e_flow'],
          suggestedQuestions: ['What does the project do?'],
        }),
        beat({
          id: 'beat_two',
          title: 'The entry point',
          narration: NARRATION_TWO,
          anchors: [anchor('anchor_main', 'src/main.ts', 'bootstrap()', 1, 3)],
          diagramId: 'diagram_one',
          nodeIds: ['n_target'],
          edgeIds: [],
        }),
      ],
    },
    {
      id: 'chapter_two',
      title: 'The shared language',
      summary: 'The glossary the tour leans on.',
      diagrams: [
        {
          id: 'diagram_two',
          kind: 'tree',
          title: 'Glossary',
          width: 360,
          height: 200,
          nodes: [
            {
              id: 'm_one',
              label: 'Context',
              type: 'file',
              x: 60,
              y: 60,
              width: 176,
              height: 56,
            },
          ],
          edges: [],
        },
      ],
      beats: [
        beat({
          id: 'beat_three',
          title: 'The glossary',
          narration: NARRATION_THREE,
          anchors: [anchor('anchor_context', 'CONTEXT.md', 'Fixture context', 1, 2)],
          diagramId: 'diagram_two',
          nodeIds: ['m_one'],
          edgeIds: [],
        }),
      ],
    },
  ];

  return {
    schemaVersion: '1.0.0',
    id: FIXTURE_TOUR_ID,
    title: 'Fixture review tour',
    subtitle: 'A small tour used by the review UI tests',
    audience: 'new-contributor',
    project: {
      slug: 'fixture',
      name: 'Fixture',
      revision: { commit: 'abc1234', branch: 'main', dirty: false },
    },
    estimatedDurationMs: 180000,
    chapters,
  };
}

const QUALITY: ReviewQuality = {
  planChapters: 2,
  chapters: 2,
  beats: 3,
  anchors: 3,
  droppedChapters: 0,
  issues: [],
  modelCalls: 4,
  cacheHits: 1,
  modelId: 'fixture',
  estimatedDurationMs: 180000,
};

function anchorChecks(stale: boolean): AnchorCheck[] {
  const verified: AnchorCheck[] = ['anchor_readme', 'anchor_main', 'anchor_context'].map(
    (anchorId) => ({
      anchorId,
      beatId: anchorId === 'anchor_readme' ? 'beat_one' : 'beat_two',
      path: 'README.md',
      status: 'verified',
      expectedHash: `sha256:${anchorId}`,
      liveHash: `sha256:${anchorId}`,
      detail: 'the live source matches the anchor hash',
    }),
  );
  if (!stale) {
    return verified;
  }
  return verified.map((check) =>
    check.anchorId === 'anchor_readme'
      ? {
          ...check,
          status: 'mismatch' as const,
          liveHash: 'sha256:changed',
          detail:
            'the live source hash sha256:changed does not match the recorded anchor hash',
        }
      : check,
  );
}

export interface FakeReviewState {
  review: ReviewSession;
  staleAnchors: boolean;
  modelUnavailable: boolean;
  quality: ReviewQuality | null;
  requests: Array<{ method: string; path: string }>;
}

function json(route: Route, status: number, body: unknown): Promise<void> {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

function applyEdits(tour: CompiledTour, edits: BeatEdit[]): CompiledTour {
  return {
    ...tour,
    chapters: tour.chapters.map((chapter) => ({
      ...chapter,
      beats: chapter.beats.map((entry) => {
        const edit = edits.filter((candidate) => candidate.beatId === entry.id).at(-1);
        if (!edit) {
          return entry;
        }
        return {
          ...entry,
          title: edit.title,
          narration: edit.narration,
          suggestedQuestions: edit.suggestedQuestions,
          stage: {
            anchorIds: entry.stage.anchorIds,
            diagramId: edit.diagramFocus.diagramId ?? undefined,
            nodeIds: edit.diagramFocus.nodeIds,
            edgeIds: edit.diagramFocus.edgeIds,
          },
        };
      }),
    })),
  };
}

export async function installFakeReview(
  page: Page,
  initial: Partial<
    Pick<FakeReviewState, 'staleAnchors' | 'modelUnavailable' | 'quality'>
  > = {},
): Promise<FakeReviewState> {
  const state: FakeReviewState = {
    review: {
      id: FIXTURE_REVIEW_ID,
      tourId: FIXTURE_TOUR_ID,
      tourRevision: 'sha256:fixture-revision-0000000000000000',
      state: 'in_review',
      reviewer: 'local',
      createdAt: '2026-10-17T00:00:00.000Z',
      updatedAt: '2026-10-17T00:00:00.000Z',
      comments: [],
      edits: [],
      regenerations: [],
      decisions: [],
    },
    staleAnchors: false,
    modelUnavailable: false,
    quality: QUALITY,
    requests: [],
    ...initial,
  };

  let idCounter = 0;
  const nextId = (prefix: string): string => {
    idCounter += 1;
    return `${prefix}_${idCounter}`;
  };
  const now = (): string => `2026-10-17T00:0${Math.min(idCounter, 9)}:00.000Z`;

  function detail(): unknown {
    return {
      review: state.review,
      tour: applyEdits(makeFixtureTour(), state.review.edits),
      quality: state.quality,
      anchors: anchorChecks(state.staleAnchors),
    };
  }

  await page.route('**/api/reviews**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const segments = url.pathname.split('/').filter(Boolean);
    state.requests.push({ method, path: url.pathname });

    const body = (() => {
      try {
        return (request.postDataJSON() ?? {}) as Record<string, unknown>;
      } catch {
        return {} as Record<string, unknown>;
      }
    })();

    // POST /api/reviews — start (or resume) the fixture session.
    if (segments.length === 2) {
      if (method !== 'POST') {
        return json(route, 405, { error: `unsupported ${method}` });
      }
      return json(route, 201, { review: state.review });
    }

    const reviewId = segments[2];
    if (reviewId !== state.review.id) {
      return json(route, 404, { error: 'review not found', code: 'not_found' });
    }

    // GET /api/reviews/:id
    if (segments.length === 3 && method === 'GET') {
      return json(route, 200, detail());
    }

    // POST /api/reviews/:id/comments
    if (segments.length === 4 && segments[3] === 'comments' && method === 'POST') {
      const text = String(body.body ?? '').trim();
      if (text.length === 0) {
        return json(route, 400, { error: 'invalid comment' });
      }
      const comment: ReviewComment = {
        id: nextId('comment'),
        beatId: (body.beatId as string | null) ?? null,
        author: 'local',
        body: text,
        createdAt: now(),
      };
      state.review = {
        ...state.review,
        comments: [...state.review.comments, comment],
        updatedAt: now(),
      };
      return json(route, 201, { review: state.review });
    }

    // PUT /api/reviews/:id/beats/:beatId
    if (segments.length === 5 && segments[3] === 'beats' && method === 'PUT') {
      const beatId = segments[4] ?? '';
      const tour = makeFixtureTour();
      const chapter = tour.chapters.find((candidate) =>
        candidate.beats.some((entry) => entry.id === beatId),
      );
      const existing = chapter?.beats.find((entry) => entry.id === beatId);
      if (!chapter || !existing) {
        return json(route, 404, {
          error: `unknown beat: ${beatId}`,
          code: 'unknown_beat',
        });
      }
      const title = String(body.title ?? existing.title);
      const narration = String(body.narration ?? existing.narration);
      const issues: Array<{ field: string; message: string }> = [];
      if (title.trim().length === 0 || title.length > 96) {
        issues.push({ field: 'title', message: 'the title must be 1–96 characters' });
      } else if (
        chapter.beats.some(
          (entry) =>
            entry.id !== beatId &&
            entry.title.trim().toLowerCase() === title.trim().toLowerCase(),
        )
      ) {
        issues.push({
          field: 'title',
          message: 'another beat in this chapter already uses this title',
        });
      }
      if (narration.trim().length < 20 || narration.length > 1200) {
        issues.push({
          field: 'narration',
          message: 'the narration must be 20–1200 characters',
        });
      }
      if (issues.length > 0) {
        return json(route, 422, {
          error: 'the beat edit did not pass validation',
          code: 'invalid_input',
          issues,
        });
      }

      const edit: BeatEdit = {
        id: nextId('edit'),
        beatId,
        source: 'manual',
        reviewer: 'local',
        createdAt: now(),
        title,
        narration,
        suggestedQuestions: (body.suggestedQuestions as string[] | undefined) ?? [],
        diagramFocus:
          (body.diagramFocus as BeatEdit['diagramFocus'] | undefined) ??
          ({
            diagramId: existing.stage.diagramId ?? null,
            nodeIds: existing.stage.nodeIds,
            edgeIds: existing.stage.edgeIds,
          } satisfies BeatEdit['diagramFocus']),
      };
      state.review = {
        ...state.review,
        state: 'in_review',
        edits: [...state.review.edits, edit],
        updatedAt: now(),
      };
      return json(route, 200, { review: state.review });
    }

    // POST /api/reviews/:id/beats/:beatId/regenerate
    if (
      segments.length === 6 &&
      segments[3] === 'beats' &&
      segments[5] === 'regenerate' &&
      method === 'POST'
    ) {
      if (state.modelUnavailable) {
        return json(route, 503, {
          error: 'no authoring model is configured',
          code: 'model_unavailable',
        });
      }
      const beatId = segments[4] ?? '';
      const tour = applyEdits(makeFixtureTour(), state.review.edits);
      const existing = tour.chapters
        .flatMap((chapter) => chapter.beats)
        .find((entry) => entry.id === beatId);
      if (!existing) {
        return json(route, 404, {
          error: `unknown beat: ${beatId}`,
          code: 'unknown_beat',
        });
      }
      const editId = nextId('edit');
      const regeneration: BeatRegeneration = {
        id: nextId('regen'),
        beatId,
        previous: {
          title: existing.title,
          narration: existing.narration,
          suggestedQuestions: existing.suggestedQuestions,
          diagramFocus: {
            diagramId: existing.stage.diagramId ?? null,
            nodeIds: existing.stage.nodeIds,
            edgeIds: existing.stage.edgeIds,
          },
        },
        generated: {
          title: `${existing.title}, regenerated`,
          narration: REGENERATED_NARRATION,
          suggestedQuestions: ['What changed in the regeneration?'],
          diagramFocus: {
            diagramId: existing.stage.diagramId ?? null,
            nodeIds: existing.stage.nodeIds,
            edgeIds: existing.stage.edgeIds,
          },
        },
        modelId: 'fixture-model',
        createdAt: now(),
        revertedAt: null,
        editId,
      };
      state.review = {
        ...state.review,
        state: 'in_review',
        edits: [
          ...state.review.edits,
          {
            id: editId,
            beatId,
            source: 'regeneration',
            reviewer: 'local',
            createdAt: now(),
            ...regeneration.generated,
          },
        ],
        regenerations: [...state.review.regenerations, regeneration],
        updatedAt: now(),
      };
      return json(route, 200, { review: state.review, regeneration });
    }

    // POST /api/reviews/:id/regenerations/:regenerationId/revert
    if (
      segments.length === 6 &&
      segments[3] === 'regenerations' &&
      segments[5] === 'revert' &&
      method === 'POST'
    ) {
      const regenerationId = segments[4];
      const regeneration = state.review.regenerations.find(
        (candidate) => candidate.id === regenerationId,
      );
      if (!regeneration) {
        return json(route, 404, { error: 'unknown regeneration', code: 'not_found' });
      }
      state.review = {
        ...state.review,
        edits: [
          ...state.review.edits,
          {
            id: nextId('edit'),
            beatId: regeneration.beatId,
            source: 'revert',
            reviewer: 'local',
            createdAt: now(),
            ...regeneration.previous,
          },
        ],
        regenerations: state.review.regenerations.map((candidate) =>
          candidate.id === regenerationId
            ? { ...candidate, revertedAt: now() }
            : candidate,
        ),
        updatedAt: now(),
      };
      return json(route, 200, { review: state.review });
    }

    // POST /api/reviews/:id/decide
    if (segments.length === 4 && segments[3] === 'decide' && method === 'POST') {
      const decision = body.decision === 'reject' ? 'reject' : 'approve';
      const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
      if (decision === 'reject' && reason.length === 0) {
        return json(route, 422, {
          error: 'a rejection requires a reason',
          code: 'reason_required',
        });
      }
      if (decision === 'approve' && state.staleAnchors) {
        return json(route, 409, {
          error: 'approval is blocked: 1 anchor(s) did not verify',
          code: 'anchor_verification_failed',
          details: [
            'anchor_readme (mismatch: the live source hash sha256:changed does not match the recorded anchor hash)',
          ],
        });
      }
      const record: ReviewDecision = {
        id: nextId('decision'),
        kind: decision === 'approve' ? 'approved' : 'rejected',
        reviewer: 'local',
        reason: reason.length > 0 ? reason : null,
        anchorVerification:
          decision === 'approve'
            ? {
                checkedAt: now(),
                ok: true,
                checks: anchorChecks(false),
              }
            : null,
        qualityOverride: false,
        decidedAt: now(),
      };
      state.review = {
        ...state.review,
        state: decision === 'approve' ? 'approved' : 'rejected',
        decisions: [...state.review.decisions, record],
        updatedAt: now(),
      };
      return json(route, 200, { review: state.review });
    }

    // GET /api/reviews/:id/export
    if (segments.length === 4 && segments[3] === 'export' && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'text/markdown',
        body: `# Review report — Fixture review tour\n`,
      });
    }

    return json(route, 405, { error: `unsupported ${method} ${url.pathname}` });
  });

  return state;
}
