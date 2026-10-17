import type { Hono } from 'hono';
import { z } from 'zod';
import type { SyncService } from '@sothspell/accounts';
import {
  clearSessionCookie,
  ensureTrustedOrigin,
  publicSession,
  publicUser,
  requireAuth,
  type AuthRuntime,
} from './auth.js';

export interface AccountRouteDeps {
  auth: AuthRuntime;
  sync: SyncService;
}

/** The sync payload mirrors the v1 run body, plus the writer's timestamp. */
const SyncRunInputSchema = z.object({
  tourId: z.string().min(1).max(256),
  beatId: z.string().min(1).max(128),
  offsetMs: z.number().int().min(0).max(3_600_000),
  completedBeatIds: z.array(z.string().min(1).max(128)).max(500),
  mode: z.enum(['read', 'listen', 'explore']),
  speed: z.number().min(0.5).max(3),
  updatedAt: z.number().int().min(0),
});

const SyncPushBodySchema = z.object({
  runs: z.array(SyncRunInputSchema).max(500),
});

const SyncClaimBodySchema = z.object({
  clientId: z.string().min(8).max(128),
});

/**
 * Account and sync routes. Everything here requires a session; the account
 * routes read and delete the signed-in user's own data, and the sync routes
 * move the user's runs between devices under the merge rules.
 */
export function registerAccountRoutes(app: Hono, deps: AccountRouteDeps): void {
  const { auth, sync } = deps;

  app.get('/api/account', (context) => {
    const authenticated = requireAuth(context, auth);
    if (authenticated instanceof Response) {
      return authenticated;
    }
    const now = auth.now();
    const sessions = auth.accountStore
      .listSessions(authenticated.user.id)
      .filter((session) => session.revokedAt === null && session.expiresAt > now)
      .map(publicSession);
    return context.json({
      user: publicUser(authenticated.user),
      sessions,
    });
  });

  app.get('/api/account/export', (context) => {
    const authenticated = requireAuth(context, auth);
    if (authenticated instanceof Response) {
      return authenticated;
    }
    const bundle = sync.export(authenticated.user.id);
    context.header(
      'content-disposition',
      'attachment; filename="sothspell-account-export.json"',
    );
    context.header('cache-control', 'no-store');
    return context.json(bundle);
  });

  app.delete('/api/account', (context) => {
    const originError = ensureTrustedOrigin(context, auth);
    if (originError) {
      return originError;
    }
    const authenticated = requireAuth(context, auth);
    if (authenticated instanceof Response) {
      return authenticated;
    }
    sync.deleteAccount(authenticated.user.id);
    clearSessionCookie(context, auth);
    return context.json({ ok: true });
  });

  app.post('/api/sync/pull', (context) => {
    const originError = ensureTrustedOrigin(context, auth);
    if (originError) {
      return originError;
    }
    const authenticated = requireAuth(context, auth);
    if (authenticated instanceof Response) {
      return authenticated;
    }
    context.header('cache-control', 'no-store');
    return context.json(sync.pull(authenticated.user.id));
  });

  app.post('/api/sync/push', async (context) => {
    const originError = ensureTrustedOrigin(context, auth);
    if (originError) {
      return originError;
    }
    const authenticated = requireAuth(context, auth);
    if (authenticated instanceof Response) {
      return authenticated;
    }
    const body = await context.req.json().catch(() => null);
    const parsed = SyncPushBodySchema.safeParse(body);
    if (!parsed.success) {
      return context.json(
        { error: 'invalid sync payload', issues: parsed.error.issues },
        400,
      );
    }
    return context.json(sync.push(authenticated.user.id, parsed.data.runs));
  });

  app.post('/api/sync/claim', async (context) => {
    const originError = ensureTrustedOrigin(context, auth);
    if (originError) {
      return originError;
    }
    const authenticated = requireAuth(context, auth);
    if (authenticated instanceof Response) {
      return authenticated;
    }
    const body = await context.req.json().catch(() => null);
    const parsed = SyncClaimBodySchema.safeParse(body);
    if (!parsed.success) {
      return context.json({ error: 'invalid claim payload' }, 400);
    }
    return context.json(sync.claim(authenticated.user.id, parsed.data.clientId));
  });
}
