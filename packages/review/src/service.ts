import { randomUUID } from 'node:crypto';
import type { BeatDraft, GuideModel } from '@sothspell/authoring';
import {
  compileSothspell,
  hashText,
  type CompiledTour,
  type SothspellDocument,
} from '@sothspell/core';
import {
  applyBeatEdits,
  effectiveBeat,
  effectiveBeatSnapshot,
  findBeat,
  snapshotFromBeat,
} from './edits.js';
import { ReviewError } from './errors.js';
import { renderReviewReportJson, renderReviewReportMarkdown } from './export.js';
import {
  generateBeatRegeneration,
  REGENERATION_PROMPT_VERSION,
  validateRegeneratedBeat,
} from './regenerate.js';
import {
  hasQualityConcerns,
  type AnchorCheck,
  type BeatEdit,
  type BeatEditInput,
  type BeatEditPatch,
  type BeatRegeneration,
  type BeatSnapshot,
  type CommentInput,
  type DecideInput,
  type ReviewListFilter,
  type ReviewQuality,
  type ReviewSession,
  type StartReviewInput,
} from './schemas.js';
import {
  assertApprovalAllowed,
  assertCanComment,
  assertCanDecide,
  assertReviewer,
  resolveActor,
  startReview,
  stateAfterEdit,
} from './state.js';
import type { ReviewStore } from './store.js';
import type { ReviewTour, ReviewTourSource } from './tour-source.js';
import { validateBeatEdit, validateEffectiveDocument } from './validate.js';
import { verifyAnchors } from './verify.js';

/**
 * The review service: the domain seam the API and the CLI both call. It owns
 * the state machine, the validation rules, the anchor gate, and the audit
 * trail; it knows nothing about Hono, React, or how a model is reached.
 */

export interface ReviewDetail {
  review: ReviewSession;
  /** The effective tour: the artifact plus every stored beat edit. */
  tour: CompiledTour;
  quality: ReviewQuality | null;
  anchors: AnchorCheck[];
}

export interface RegenerationResult {
  review: ReviewSession;
  regeneration: BeatRegeneration;
}

export interface StartReviewResult {
  review: ReviewSession;
  /** False when an existing review for this tour revision was returned. */
  created: boolean;
}

export interface ReviewService {
  start(input: StartReviewInput): Promise<StartReviewResult>;
  get(id: string): Promise<ReviewSession | null>;
  list(filter?: ReviewListFilter): Promise<ReviewSession[]>;
  detail(id: string): Promise<ReviewDetail | null>;
  addComment(id: string, input: CommentInput): Promise<ReviewSession>;
  editBeat(
    id: string,
    beatId: string,
    input: BeatEditPatch,
    actor?: string,
  ): Promise<ReviewSession>;
  regenerateBeat(id: string, beatId: string, actor?: string): Promise<RegenerationResult>;
  revertRegeneration(
    id: string,
    regenerationId: string,
    actor?: string,
  ): Promise<ReviewSession>;
  decide(id: string, input: DecideInput): Promise<ReviewSession>;
  exportReport(id: string, format: 'markdown' | 'json'): Promise<string>;
}

export interface ReviewServiceOptions {
  store: ReviewStore;
  tours: ReviewTourSource;
  /** Read-only project root for anchor verification; `null` uses excerpts. */
  sourceRoot?: string | null;
  /** Resolves the authoring model for regeneration; `null` disables it. */
  resolveModel?: () => Promise<GuideModel | null>;
  clock?: () => Date;
  generateId?: (prefix: string) => string;
}

function defaultId(prefix: string): string {
  return `${prefix}_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
}

/** The effective document: the tour with every stored beat edit applied. */
function effectiveDocument(session: ReviewSession, tour: ReviewTour): SothspellDocument {
  return applyBeatEdits(tour.document, session.edits);
}

export function createReviewService(options: ReviewServiceOptions): ReviewService {
  const { store, tours } = options;
  const clock = options.clock ?? (() => new Date());
  const sourceRoot = options.sourceRoot ?? null;
  const newId = options.generateId ?? defaultId;
  // One beat is one model call; an unchanged prompt (a regenerate, revert,
  // regenerate cycle) is served from this in-memory cache.
  const regenerationCache = new Map<string, BeatDraft>();

  function now(): string {
    return clock().toISOString();
  }

  function requireSession(id: string): ReviewSession {
    const session = store.getSession(id);
    if (!session) {
      throw new ReviewError('not_found', `unknown review: ${id}`);
    }
    return session;
  }

  async function requireTour(session: ReviewSession): Promise<ReviewTour> {
    const tour = await tours.load(session.tourId);
    if (!tour) {
      throw new ReviewError('not_found', `unknown tour: ${session.tourId}`);
    }
    return tour;
  }

  async function verify(document: SothspellDocument, at: string): Promise<AnchorCheck[]> {
    const verification = await verifyAnchors(document, {
      sourceRoot,
      clock: () => new Date(at),
    });
    return verification.checks;
  }

  function requireModel(): Promise<GuideModel | null> {
    return options.resolveModel ? options.resolveModel() : Promise.resolve(null);
  }

  return {
    async start(input) {
      const tour = await tours.load(input.tourId);
      if (!tour) {
        throw new ReviewError('not_found', `unknown tour: ${input.tourId}`);
      }

      const existing = store.findByRevision(input.tourId, tour.revision);
      if (existing) {
        return { review: existing, created: false };
      }

      const timestamp = now();
      const session: ReviewSession = {
        id: newId('review'),
        tourId: input.tourId,
        tourRevision: tour.revision,
        // Creation runs the machine's first transition: a session is created
        // as a draft and immediately started.
        state: startReview('draft'),
        reviewer: input.reviewer ?? 'local',
        createdAt: timestamp,
        updatedAt: timestamp,
        comments: [],
        edits: [],
        regenerations: [],
        decisions: [],
      };
      store.createSession(session);
      return { review: session, created: true };
    },

    async get(id) {
      return store.getSession(id);
    },

    async list(filter) {
      return store.listSessions(filter);
    },

    async detail(id) {
      const session = store.getSession(id);
      if (!session) {
        return null;
      }
      const tour = await requireTour(session);
      const document = effectiveDocument(session, tour);
      const compiled = await compileSothspell(
        document,
        sourceRoot === null ? {} : { sourceRoot },
      );
      return {
        review: session,
        tour: compiled,
        quality: tour.quality,
        anchors: await verify(document, now()),
      };
    },

    async addComment(id, input) {
      const session = requireSession(id);
      assertCanComment(session.state);
      const tour = await requireTour(session);

      const beatId = input.beatId ?? null;
      if (beatId !== null && !findBeat(tour.document, beatId)) {
        throw new ReviewError('unknown_beat', `unknown beat: ${beatId}`);
      }

      const actor = resolveActor(session.reviewer, input.author);
      assertReviewer(session.reviewer, input.author);
      const timestamp = now();
      store.appendComment(
        id,
        {
          id: newId('comment'),
          beatId,
          author: actor,
          body: input.body,
          createdAt: timestamp,
        },
        timestamp,
      );
      return requireSession(id);
    },

    async editBeat(id, beatId, input, actor) {
      const session = requireSession(id);
      assertReviewer(session.reviewer, actor);
      const tour = await requireTour(session);
      const located = findBeat(tour.document, beatId);
      if (!located) {
        throw new ReviewError('unknown_beat', `unknown beat: ${beatId}`);
      }

      const current = effectiveBeatSnapshot(tour.document, session.edits, beatId);
      if (!current) {
        throw new ReviewError('unknown_beat', `unknown beat: ${beatId}`);
      }
      const next: BeatEditInput = {
        title: input.title ?? current.title,
        narration: input.narration ?? current.narration,
        suggestedQuestions: input.suggestedQuestions ?? current.suggestedQuestions,
        diagramFocus: input.diagramFocus ?? current.diagramFocus,
      };

      const validation = validateBeatEdit(next, {
        document: tour.document,
        chapter: located.chapter,
        beatId,
      });
      if (validation.errors.length > 0) {
        throw new ReviewError('invalid_input', 'the beat edit did not pass validation', {
          issues: validation.errors,
        });
      }

      const timestamp = now();
      const edit: BeatEdit = {
        id: newId('edit'),
        beatId,
        source: 'manual',
        reviewer: resolveActor(session.reviewer, actor),
        createdAt: timestamp,
        ...next,
      };

      const documentIssues = validateEffectiveDocument(tour.document, [
        ...session.edits,
        edit,
      ]);
      if (documentIssues.length > 0) {
        throw new ReviewError('invalid_input', 'the beat edit did not pass validation', {
          issues: documentIssues,
        });
      }

      store.appendEdit(id, edit, timestamp);
      store.updateState(id, stateAfterEdit(session.state), timestamp);
      return requireSession(id);
    },

    async regenerateBeat(id, beatId, actor) {
      const session = requireSession(id);
      assertReviewer(session.reviewer, actor);
      const tour = await requireTour(session);
      const located = findBeat(tour.document, beatId);
      if (!located) {
        throw new ReviewError('unknown_beat', `unknown beat: ${beatId}`);
      }

      const model = await requireModel();
      if (!model) {
        throw new ReviewError(
          'model_unavailable',
          'no authoring model is configured; activate one in /settings or set SOTHSPELL_MODEL',
        );
      }

      const current = effectiveBeat(tour.document, session.edits, beatId);
      if (!current) {
        throw new ReviewError('unknown_beat', `unknown beat: ${beatId}`);
      }

      const input = { document: tour.document, chapter: located.chapter, beat: current };
      const draft = await generateBeatRegeneration({
        ...input,
        model,
        cache: regenerationCache,
        cacheKey: hashText(
          [
            model.id,
            REGENERATION_PROMPT_VERSION,
            beatId,
            current.narration,
            located.chapter.id,
          ].join('\u0000'),
        ),
      });

      const issues = validateRegeneratedBeat(draft, input);
      if (issues.length > 0) {
        throw new ReviewError(
          'regeneration_failed',
          'the regenerated beat did not pass validation',
          { issues },
        );
      }

      const timestamp = now();
      const previous = snapshotFromBeat(current);
      const generated: BeatSnapshot = {
        title: draft.title,
        narration: draft.narration,
        suggestedQuestions: [...(draft.suggestedQuestions ?? [])],
        diagramFocus: {
          diagramId: current.stage.diagramId ?? null,
          nodeIds: [...(draft.nodeIds ?? [])],
          edgeIds: [...(draft.edgeIds ?? [])],
        },
      };
      const editId = newId('edit');
      const regeneration: BeatRegeneration = {
        id: newId('regen'),
        beatId,
        previous,
        generated,
        modelId: model.id,
        createdAt: timestamp,
        revertedAt: null,
        editId,
      };
      const edit: BeatEdit = {
        id: editId,
        beatId,
        source: 'regeneration',
        reviewer: resolveActor(session.reviewer, actor),
        createdAt: timestamp,
        ...generated,
      };
      const documentIssues = validateEffectiveDocument(tour.document, [
        ...session.edits,
        edit,
      ]);
      if (documentIssues.length > 0) {
        throw new ReviewError(
          'regeneration_failed',
          'the regenerated beat did not pass validation',
          { issues: documentIssues },
        );
      }

      store.appendEdit(id, edit, timestamp);
      store.appendRegeneration(id, regeneration, timestamp);
      store.updateState(id, stateAfterEdit(session.state), timestamp);
      return { review: requireSession(id), regeneration };
    },

    async revertRegeneration(id, regenerationId, actor) {
      const session = requireSession(id);
      assertReviewer(session.reviewer, actor);
      const tour = await requireTour(session);

      const regeneration = session.regenerations.find(
        (candidate) => candidate.id === regenerationId,
      );
      if (!regeneration) {
        throw new ReviewError('not_found', `unknown regeneration: ${regenerationId}`);
      }
      if (regeneration.revertedAt !== null) {
        throw new ReviewError('invalid_input', 'this regeneration was already reverted');
      }

      const located = findBeat(tour.document, regeneration.beatId);
      if (!located) {
        throw new ReviewError('unknown_beat', `unknown beat: ${regeneration.beatId}`);
      }
      const validation = validateBeatEdit(regeneration.previous, {
        document: tour.document,
        chapter: located.chapter,
        beatId: regeneration.beatId,
      });
      if (validation.errors.length > 0) {
        throw new ReviewError(
          'invalid_input',
          'the stored previous narration did not pass validation',
          { issues: validation.errors },
        );
      }

      const timestamp = now();
      const edit: BeatEdit = {
        id: newId('edit'),
        beatId: regeneration.beatId,
        source: 'revert',
        reviewer: resolveActor(session.reviewer, actor),
        createdAt: timestamp,
        ...regeneration.previous,
      };
      const documentIssues = validateEffectiveDocument(tour.document, [
        ...session.edits,
        edit,
      ]);
      if (documentIssues.length > 0) {
        throw new ReviewError(
          'invalid_input',
          'the stored previous narration did not pass validation',
          { issues: documentIssues },
        );
      }

      store.appendEdit(id, edit, timestamp);
      store.markRegenerationReverted(id, regenerationId, timestamp, timestamp);
      store.updateState(id, stateAfterEdit(session.state), timestamp);
      return requireSession(id);
    },

    async decide(id, input) {
      const session = requireSession(id);
      assertReviewer(session.reviewer, input.reviewer);
      const tour = await requireTour(session);

      const reason = input.reason ?? null;
      assertCanDecide(session.state, input.decision, reason);

      const timestamp = now();
      const actor = resolveActor(session.reviewer, input.reviewer);
      let anchorVerification = null;
      let qualityOverride = false;

      if (input.decision === 'approve') {
        // Approval is only as good as the anchors it was made against, so the
        // check runs fresh here rather than trusting a cached list.
        const document = effectiveDocument(session, tour);
        const verification = await verifyAnchors(document, {
          sourceRoot,
          clock: () => new Date(timestamp),
        });
        assertApprovalAllowed(verification);
        anchorVerification = verification;
        qualityOverride = hasQualityConcerns(tour.quality);
      }

      store.appendDecision(
        id,
        {
          id: newId('decision'),
          kind: input.decision === 'approve' ? 'approved' : 'rejected',
          reviewer: actor,
          reason,
          anchorVerification,
          qualityOverride,
          decidedAt: timestamp,
        },
        timestamp,
      );
      store.updateState(
        id,
        input.decision === 'approve' ? 'approved' : 'rejected',
        timestamp,
      );
      return requireSession(id);
    },

    async exportReport(id, format) {
      const session = requireSession(id);
      const tour = await requireTour(session);
      const document = effectiveDocument(session, tour);
      const anchors = await verify(document, now());
      const context = { document, quality: tour.quality, anchors };
      return format === 'json'
        ? renderReviewReportJson(session, context)
        : renderReviewReportMarkdown(session, context);
    },
  };
}
