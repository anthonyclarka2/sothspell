#!/usr/bin/env node
/**
 * Minimal static server for the embed docs fixture. It exists so the Playwright
 * spec can exercise the exported bundle exactly as a docs host would serve it:
 * no Sóþspell API, no dev server, no rewrite rules.
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.EMBED_DOCS_PORT ?? 4320);

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
};

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? '/', `http://127.0.0.1:${port}`);
    const requested = path.resolve(path.join(root, decodeURIComponent(url.pathname)));
    if (requested !== root && !requested.startsWith(`${root}${path.sep}`)) {
      response.writeHead(403, { 'content-type': 'text/plain' });
      response.end('forbidden');
      return;
    }
    const info = await stat(requested);
    const filePath = info.isDirectory() ? path.join(requested, 'index.html') : requested;
    const body = await readFile(filePath);
    response.writeHead(200, {
      'content-type':
        MIME_TYPES[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream',
      'cache-control': 'no-store',
    });
    response.end(body);
  } catch {
    response.writeHead(404, { 'content-type': 'text/plain' });
    response.end('not found');
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`embed-docs: serving ${root} at http://127.0.0.1:${port}/`);
});
