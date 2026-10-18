import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { createApiSecurityMiddleware } from './security.js';

/**
 * The middleware is the browser-facing boundary: a page the user visits must
 * not be able to write to the local API or read it through DNS rebinding.
 */
function makeApp(options: Parameters<typeof createApiSecurityMiddleware>[0] = {}) {
  const app = new Hono();
  app.use('*', createApiSecurityMiddleware(options));
  app.get('/api/health', (context) => context.json({ ok: true }));
  app.post('/api/echo', async (context) =>
    context.json({ body: await context.req.json().catch(() => null) }),
  );
  return app;
}

describe('api security middleware', () => {
  it('allows requests with no host or origin (in-process and CLI clients)', async () => {
    const app = makeApp();
    const get = await app.request('/api/health');
    expect(get.status).toBe(200);

    const post = await app.request('/api/echo', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ hello: 'world' }),
    });
    expect(post.status).toBe(200);
  });

  it('rejects a foreign host header on every method', async () => {
    const app = makeApp();

    const get = await app.request('/api/health', {
      headers: { host: 'evil.example' },
    });
    expect(get.status).toBe(403);

    const post = await app.request('/api/echo', {
      method: 'POST',
      headers: {
        host: 'evil.example',
        'content-type': 'application/json',
      },
      body: '{}',
    });
    expect(post.status).toBe(403);
  });

  it('allows loopback, IP literals, and configured hosts', async () => {
    const app = makeApp({ publicUrl: 'https://sothspell.example' });

    for (const host of [
      '127.0.0.1:4319',
      'localhost:5173',
      '[::1]:4319',
      '192.168.1.20:4319',
      'sothspell.example',
    ]) {
      const response = await app.request('/api/health', { headers: { host } });
      expect(response.status, host).toBe(200);
    }
  });

  it('rejects a cross-site origin on a write', async () => {
    const app = makeApp();
    const response = await app.request('/api/echo', {
      method: 'POST',
      headers: {
        origin: 'https://evil.example',
        'content-type': 'application/json',
      },
      body: '{}',
    });
    expect(response.status).toBe(403);
  });

  it('allows a loopback origin on a write', async () => {
    const app = makeApp();
    const response = await app.request('/api/echo', {
      method: 'POST',
      headers: {
        origin: 'http://127.0.0.1:5173',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ ok: true }),
    });
    expect(response.status).toBe(200);
  });

  it('refuses a cross-site fetch even with an allowed origin', async () => {
    const app = makeApp();
    const response = await app.request('/api/echo', {
      method: 'POST',
      headers: {
        'sec-fetch-site': 'cross-site',
        'content-type': 'application/json',
      },
      body: '{}',
    });
    expect(response.status).toBe(403);
  });

  it('requires JSON content for a body-bearing write', async () => {
    const app = makeApp();

    const textPlain = await app.request('/api/echo', {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: '{"a":1}',
    });
    expect(textPlain.status).toBe(415);

    const form = await app.request('/api/echo', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'a=1',
    });
    expect(form.status).toBe(415);

    const json = await app.request('/api/echo', {
      method: 'POST',
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: '{"a":1}',
    });
    expect(json.status).toBe(200);
  });

  it('allows a body-less write without a content type', async () => {
    const app = new Hono();
    app.use('*', createApiSecurityMiddleware());
    app.post('/api/cancel', (context) => context.json({ ok: true }));

    const response = await app.request('/api/cancel', { method: 'POST' });
    expect(response.status).toBe(200);
  });
});
