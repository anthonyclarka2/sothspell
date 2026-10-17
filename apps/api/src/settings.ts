import type { Hono } from 'hono';
import { ZodError } from 'zod';
import {
  DuplicateProfileNameError,
  ProfileCreateSchema,
  ProfileUpdateSchema,
  type ProfileTester,
  type ResolvedConnection,
  type SettingsService,
} from '@sothspell/settings';
import { redactProviderMessage } from './settings-tester.js';

/**
 * The settings HTTP surface. It is deliberately thin: validation and resolution
 * live in `@sothspell/settings`, provider calls live behind the `ProfileTester`
 * seam, and this module only maps domain outcomes to status codes and shapes
 * that can never contain a secret value.
 */

export interface SettingsRouteOptions {
  service: SettingsService;
  /** Provider-test seam; tests inject a fake. */
  tester?: ProfileTester | null;
}

function formatIssues(error: ZodError): Array<{ path: string; message: string }> {
  return error.issues.map((issue) => ({
    path: issue.path.map(String).join('.'),
    message: issue.message,
  }));
}

function testTarget(connection: ResolvedConnection): {
  modelId: string | null;
  voiceId: string | null;
} {
  if (connection.kind === 'authoring') {
    return { modelId: connection.modelId, voiceId: null };
  }
  return { modelId: connection.modelId, voiceId: connection.voiceId };
}

export function registerSettingsRoutes(app: Hono, options: SettingsRouteOptions): void {
  app.get('/api/settings/profiles', async (context) => {
    const profiles = await options.service.listProfiles();
    return context.json({ profiles, env: options.service.envOverrides() });
  });

  app.post('/api/settings/profiles', async (context) => {
    const body = await context.req.json().catch(() => null);
    const parsed = ProfileCreateSchema.safeParse(body);
    if (!parsed.success) {
      return context.json(
        { error: 'invalid profile', issues: formatIssues(parsed.error) },
        400,
      );
    }
    try {
      const profile = await options.service.createProfile(parsed.data);
      return context.json(profile, 201);
    } catch (error) {
      if (error instanceof DuplicateProfileNameError) {
        return context.json({ error: error.message }, 409);
      }
      if (error instanceof ZodError) {
        return context.json(
          { error: 'invalid profile', issues: formatIssues(error) },
          400,
        );
      }
      throw error;
    }
  });

  app.put('/api/settings/profiles/:id', async (context) => {
    const body = await context.req.json().catch(() => null);
    const parsed = ProfileUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return context.json(
        { error: 'invalid profile update', issues: formatIssues(parsed.error) },
        400,
      );
    }
    try {
      const profile = await options.service.updateProfile(
        context.req.param('id'),
        parsed.data,
      );
      if (!profile) {
        return context.json({ error: 'unknown profile' }, 404);
      }
      return context.json(profile);
    } catch (error) {
      if (error instanceof DuplicateProfileNameError) {
        return context.json({ error: error.message }, 409);
      }
      if (error instanceof ZodError) {
        return context.json(
          { error: 'invalid profile update', issues: formatIssues(error) },
          400,
        );
      }
      throw error;
    }
  });

  app.delete('/api/settings/profiles/:id', async (context) => {
    const removed = await options.service.deleteProfile(context.req.param('id'));
    if (!removed) {
      return context.json({ error: 'unknown profile' }, 404);
    }
    return context.json({ ok: true });
  });

  app.post('/api/settings/profiles/:id/activate', async (context) => {
    const profile = await options.service.activateProfile(context.req.param('id'));
    if (!profile) {
      return context.json({ error: 'unknown profile' }, 404);
    }
    return context.json(profile);
  });

  app.post('/api/settings/profiles/:id/test', async (context) => {
    const id = context.req.param('id');
    const connection = await options.service.resolveProfileConnection(id);
    if (!connection) {
      return context.json({ error: 'unknown profile' }, 404);
    }
    if (!options.tester) {
      return context.json({ error: 'provider tests are unavailable' }, 503);
    }

    const report = await options.tester.test(connection);
    const target = testTarget(connection);
    if (!report.ok) {
      const message = report.error ?? 'the provider test failed';
      return context.json(
        {
          ok: false,
          error: redactProviderMessage(message, connection.apiKey),
          latencyMs: report.latencyMs,
        },
        502,
      );
    }
    return context.json({
      ok: true,
      latencyMs: report.latencyMs,
      detail: report.detail,
      ...target,
    });
  });
}
