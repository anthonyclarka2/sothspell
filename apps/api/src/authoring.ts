import type { Hono } from 'hono';
import { z } from 'zod';
import {
  AuthoringJobNotFoundError,
  AuthoringSourceError,
  AuthoringUnavailableError,
  type AuthoringService,
} from './authoring-service.js';

export interface AuthoringRouteOptions {
  service: AuthoringService;
}

const AuthoringBodySchema = z.object({
  source: z.discriminatedUnion('kind', [
    z.object({
      kind: z.literal('local'),
      path: z.string().min(1).max(1024),
    }),
    z.object({
      kind: z.literal('import'),
      importId: z.string().min(1).max(256),
    }),
    z.object({
      kind: z.literal('github'),
      url: z.string().min(1).max(2048),
      ref: z.string().min(1).max(256).nullish(),
    }),
  ]),
  model: z.enum(['fixture', 'profile']).default('fixture'),
  audience: z.enum(['new-contributor', 'technical-evaluator', 'maintainer']).optional(),
  maxMinutes: z.number().int().min(1).max(120).optional(),
});

const InspectBodySchema = z.object({
  path: z.string().min(1).max(1024),
});

/**
 * Maps the authoring service's named errors to HTTP statuses. Import errors
 * surface inside a job rather than at start, so the start route only fails on
 * a malformed request; the job reports source failures to the polling UI.
 */
function authoringErrorResponse(
  context: { json: (body: unknown, status: number) => Response },
  error: unknown,
): Response {
  if (error instanceof AuthoringSourceError) {
    return context.json({ error: error.message }, 400);
  }
  if (error instanceof AuthoringUnavailableError) {
    return context.json({ error: error.message }, 503);
  }
  if (error instanceof AuthoringJobNotFoundError) {
    return context.json({ error: error.message }, 404);
  }
  throw error;
}

export function registerAuthoringRoutes(app: Hono, options: AuthoringRouteOptions): void {
  app.post('/api/authoring', async (context) => {
    const body = await context.req.json().catch(() => null);
    const parsed = AuthoringBodySchema.safeParse(body);
    if (!parsed.success) {
      return context.json(
        { error: 'invalid authoring payload', issues: parsed.error.issues },
        400,
      );
    }
    try {
      const job = await options.service.start(parsed.data);
      return context.json({ job }, 202);
    } catch (error) {
      return authoringErrorResponse(context, error);
    }
  });

  app.get('/api/authoring/:jobId', (context) => {
    const job = options.service.get(context.req.param('jobId'));
    if (!job) {
      return context.json({ error: 'authoring job not found' }, 404);
    }
    return context.json({ job });
  });

  app.post('/api/authoring/:jobId/cancel', (context) => {
    const cancelled = options.service.cancel(context.req.param('jobId'));
    if (!cancelled) {
      return context.json({ error: 'authoring job is not running' }, 409);
    }
    return context.json({ cancelled: true });
  });

  app.post('/api/projects/inspect', async (context) => {
    const body = await context.req.json().catch(() => null);
    const parsed = InspectBodySchema.safeParse(body);
    if (!parsed.success) {
      return context.json(
        { error: 'invalid inspect payload', issues: parsed.error.issues },
        400,
      );
    }
    try {
      const project = await options.service.inspectLocalProject(parsed.data.path);
      return context.json({ project });
    } catch (error) {
      return authoringErrorResponse(context, error);
    }
  });
}
