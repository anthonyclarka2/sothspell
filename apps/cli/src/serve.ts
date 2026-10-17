import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { createApp } from '@sothspell/api/app';
import type { CliIO } from './cli.js';

export interface ServeArgs {
  port: number;
  host: string;
  open: boolean;
}

export function openUrl(url: string): void {
  const command =
    process.platform === 'darwin'
      ? 'open'
      : process.platform === 'win32'
        ? 'cmd'
        : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', url] : [url];
  execFile(command, args, () => undefined);
}

/**
 * Starts the local Sóþspell server. The built web app is served when present;
 * otherwise the API is still available for the player and plugins.
 */
export function runServe(args: ServeArgs, io: CliIO): Promise<number> {
  const app = createApp();
  const webRoot = path.resolve(import.meta.dirname, '../../web/dist');
  if (existsSync(webRoot)) {
    const relativeRoot = path.relative(process.cwd(), webRoot);
    app.use('*', serveStatic({ root: relativeRoot }));
    app.get('*', serveStatic({ path: path.join(relativeRoot, 'index.html') }));
  } else {
    io.stderr('web build not found; serving the API only');
  }

  return new Promise((resolve) => {
    const server = serve(
      { fetch: app.fetch, hostname: args.host, port: args.port },
      (info) => {
        const url = `http://${args.host}:${info.port}`;
        io.stdout(`Sóþspell listening on ${url}`);
        if (args.open) {
          openUrl(url);
        }
      },
    );

    const shutdown = () => {
      server.close(() => resolve(0));
    };
    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);
  });
}
