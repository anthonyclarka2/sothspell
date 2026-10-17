import type { Hono } from 'hono';
import { z } from 'zod';
import {
  ImportCloneError,
  ImportLimitError,
  ImportNotFoundError,
  ImportTimeoutError,
  ImportUrlError,
  type ImportService,
} from '@sothspell/import';

export interface ImportRouteOptions {
  service: ImportService;
}

const ImportBodySchema = z.object({
  url: z.string().min(1).max(2048),
  ref: z.string().min(1).max(256).optional(),
});

/**
 * Maps the import service's named errors to HTTP status codes. Anything else
 * is a bug and rethrows so the app's error handler reports it as a 500.
 */
function importErrorResponse(
  context: { json: (body: unknown, status: number) => Response },
  error: unknown,
): Response {
  if (error instanceof ImportUrlError) {
    return context.json({ error: error.message, code: error.code }, 400);
  }
  if (error instanceof ImportNotFoundError) {
    return context.json({ error: error.message }, 404);
  }
  if (error instanceof ImportTimeoutError) {
    return context.json({ error: error.message }, 504);
  }
  if (error instanceof ImportLimitError) {
    return context.json({ error: error.message, limit: error.limit }, 507);
  }
  if (error instanceof ImportCloneError) {
    return context.json({ error: error.message }, 502);
  }
  throw error;
}

/**
 * The import HTTP boundary. Imports are local, read-only clones: the routes
 * only validate input, call the service, and translate named errors into
 * statuses the UI can branch on (400, 404, 409, 502, 504, 507).
 */
export function registerImportRoutes(app: Hono, options: ImportRouteOptions): void {
  app.post('/api/imports', async (context) => {
    const body = await context.req.json().catch(() => null);
    const parsed = ImportBodySchema.safeParse(body);
    if (!parsed.success) {
      return context.json(
        { error: 'invalid import payload', issues: parsed.error.issues },
        400,
      );
    }

    try {
      const result = await options.service.import(parsed.data);
      if (!result.created) {
        return context.json(
          {
            error: `${result.record.owner}/${result.record.repo} is already imported`,
            existing: result.record,
          },
          409,
        );
      }
      return context.json({ import: result.record }, 201);
    } catch (error) {
      return importErrorResponse(context, error);
    }
  });

  app.get('/api/imports', async (context) => {
    return context.json({ imports: await options.service.list() });
  });

  app.get('/api/imports/:id', async (context) => {
    const record = await options.service.get(context.req.param('id'));
    if (!record) {
      return context.json({ error: `unknown import: ${context.req.param('id')}` }, 404);
    }
    return context.json({ import: record });
  });

  app.delete('/api/imports/:id', async (context) => {
    const removed = await options.service.remove(context.req.param('id'));
    if (!removed) {
      return context.json({ error: `unknown import: ${context.req.param('id')}` }, 404);
    }
    return context.json({ ok: true });
  });

  app.post('/api/imports/:id/refresh', async (context) => {
    try {
      const result = await options.service.refresh(context.req.param('id'));
      return context.json({ import: result.record, created: result.created });
    } catch (error) {
      return importErrorResponse(context, error);
    }
  });
}
