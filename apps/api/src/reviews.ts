import type { Context, Hono } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { ZodError } from 'zod';
import {
  BeatEditPatchSchema,
  CommentInputSchema,
  DecideInputSchema,
  ReviewError,
  StartReviewInputSchema,
  type ReviewErrorCode,
  type ReviewService,
} from '@sothspell/review';

/**
 * The review HTTP surface. It is deliberately thin: the state machine,
 * validation, and the anchor gate live in `@sothspell/review`, and this module
 * only maps request shapes to the service and domain outcomes to status codes
 * with their named reason.
 */

export interface ReviewRouteOptions {
  service: ReviewService;
}

const STATUS_BY_CODE: Record<ReviewErrorCode, ContentfulStatusCode> = {
  not_found: 404,
  unknown_beat: 404,
  invalid_input: 422,
  review_closed: 409,
  invalid_transition: 409,
  reason_required: 422,
  anchor_verification_failed: 409,
  reviewer_mismatch: 409,
  model_unavailable: 503,
  regeneration_failed: 422,
};

function formatIssues(error: ZodError): Array<{ path: string; message: string }> {
  return error.issues.map((issue) => ({
    path: issue.path.map(String).join('.'),
    message: issue.message,
  }));
}

function errorResponse(context: Context, error: unknown): Response {
  if (error instanceof ReviewError) {
    return context.json(
      {
        error: error.message,
        code: error.code,
        ...(error.details.length > 0 ? { details: error.details } : {}),
        ...(error.issues.length > 0 ? { issues: error.issues } : {}),
      },
      STATUS_BY_CODE[error.code],
    );
  }
  throw error;
}

export function registerReviewRoutes(app: Hono, options: ReviewRouteOptions): void {
  const { service } = options;

  app.post('/api/reviews', async (context) => {
    const body = await context.req.json().catch(() => null);
    const parsed = StartReviewInputSchema.safeParse(body);
    if (!parsed.success) {
      return context.json(
        { error: 'invalid review payload', issues: formatIssues(parsed.error) },
        400,
      );
    }
    try {
      const { review, created } = await service.start(parsed.data);
      return context.json({ review }, created ? 201 : 200);
    } catch (error) {
      return errorResponse(context, error);
    }
  });

  app.get('/api/reviews/:id', async (context) => {
    try {
      const detail = await service.detail(context.req.param('id'));
      if (!detail) {
        return context.json({ error: 'review not found' }, 404);
      }
      context.header('cache-control', 'no-store');
      return context.json(detail);
    } catch (error) {
      return errorResponse(context, error);
    }
  });

  app.post('/api/reviews/:id/comments', async (context) => {
    const body = await context.req.json().catch(() => null);
    const parsed = CommentInputSchema.safeParse(body);
    if (!parsed.success) {
      return context.json(
        { error: 'invalid comment', issues: formatIssues(parsed.error) },
        400,
      );
    }
    try {
      const review = await service.addComment(context.req.param('id'), parsed.data);
      return context.json({ review }, 201);
    } catch (error) {
      return errorResponse(context, error);
    }
  });

  app.put('/api/reviews/:id/beats/:beatId', async (context) => {
    const body = await context.req.json().catch(() => null);
    const parsed = BeatEditPatchSchema.safeParse(body);
    if (!parsed.success) {
      return context.json(
        { error: 'invalid beat edit', issues: formatIssues(parsed.error) },
        400,
      );
    }
    try {
      const review = await service.editBeat(
        context.req.param('id'),
        context.req.param('beatId'),
        parsed.data,
      );
      return context.json({ review });
    } catch (error) {
      return errorResponse(context, error);
    }
  });

  app.post('/api/reviews/:id/beats/:beatId/regenerate', async (context) => {
    try {
      const result = await service.regenerateBeat(
        context.req.param('id'),
        context.req.param('beatId'),
      );
      return context.json(result);
    } catch (error) {
      return errorResponse(context, error);
    }
  });

  app.post('/api/reviews/:id/regenerations/:regenerationId/revert', async (context) => {
    try {
      const review = await service.revertRegeneration(
        context.req.param('id'),
        context.req.param('regenerationId'),
      );
      return context.json({ review });
    } catch (error) {
      return errorResponse(context, error);
    }
  });

  app.post('/api/reviews/:id/decide', async (context) => {
    const body = await context.req.json().catch(() => null);
    const parsed = DecideInputSchema.safeParse(body);
    if (!parsed.success) {
      return context.json(
        { error: 'invalid decision', issues: formatIssues(parsed.error) },
        400,
      );
    }
    try {
      const review = await service.decide(context.req.param('id'), parsed.data);
      return context.json({ review });
    } catch (error) {
      return errorResponse(context, error);
    }
  });

  app.get('/api/reviews/:id/export', async (context) => {
    const requested = context.req.query('format') ?? 'markdown';
    if (requested !== 'markdown' && requested !== 'json') {
      return context.json({ error: `unsupported export format: ${requested}` }, 400);
    }
    try {
      const report = await service.exportReport(context.req.param('id'), requested);
      return context.body(
        report,
        200,
        requested === 'json'
          ? { 'content-type': 'application/json; charset=utf-8' }
          : { 'content-type': 'text/markdown; charset=utf-8' },
      );
    } catch (error) {
      return errorResponse(context, error);
    }
  });
}
