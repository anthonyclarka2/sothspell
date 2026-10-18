import { existsSync } from 'node:fs';
import path from 'node:path';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { createApp } from './app.js';

const port = Number.parseInt(process.env.PORT ?? '4319', 10);
const hostname = process.env.HOST ?? '127.0.0.1';

const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1', 'localhost']);
if (!LOOPBACK_HOSTS.has(hostname)) {
  console.warn(
    `warning: binding to ${hostname} exposes the API beyond this machine; ` +
      'the API has no authentication, so only do this behind a trusted proxy',
  );
}

const app = createApp();

// The dev loop serves the web app through Vite; a production build drops the
// static bundle here. Serving it from the API keeps the loopback origin
// single-origin, which the signed session model expects.
const webRoot = path.resolve(import.meta.dirname, '../../web/dist');
if (existsSync(webRoot)) {
  const relativeRoot = path.relative(process.cwd(), webRoot);
  app.use('*', serveStatic({ root: relativeRoot }));
  app.get('*', serveStatic({ path: path.join(relativeRoot, 'index.html') }));
}

serve({ fetch: app.fetch, hostname, port }, (info) => {
  console.log(`Sóþspell listening on http://${hostname}:${info.port}`);
});
