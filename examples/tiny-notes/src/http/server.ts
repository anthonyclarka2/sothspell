/**
 * A minimal JSON API over the note service. HTTP is an adapter: it translates
 * requests into service calls and results into status codes, and owns no
 * business rules, so the CLI and the API can never drift apart.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { NoteNotFoundError, NoteValidationError, type NoteDraft } from '../types.ts';
import type { NoteService } from '../notes/service.ts';

/** Request bodies are capped so a runaway client cannot exhaust memory. */
const MAX_BODY_CHARS = 1024 * 1024;

export interface RunningNotesServer {
  server: Server;
  url: string;
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  const payload = `${JSON.stringify(body, null, 2)}\n`;
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
  });
  response.end(payload);
}

async function readJsonBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  let text = '';
  request.setEncoding('utf8');
  for await (const chunk of request) {
    text += chunk;
    if (text.length > MAX_BODY_CHARS) {
      throw new NoteValidationError('request body is too large');
    }
  }
  if (text.trim().length === 0) {
    return {};
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new NoteValidationError('request body is not valid JSON');
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new NoteValidationError('request body must be a JSON object');
  }
  return parsed as Record<string, unknown>;
}

function draftFromBody(body: Record<string, unknown>): NoteDraft {
  const { title, body: text, tags } = body;
  if (typeof title !== 'string') {
    throw new NoteValidationError('title must be a string');
  }
  if (text !== undefined && typeof text !== 'string') {
    throw new NoteValidationError('body must be a string');
  }
  if (tags !== undefined && (!Array.isArray(tags) || tags.some((tag) => typeof tag !== 'string'))) {
    throw new NoteValidationError('tags must be an array of strings');
  }
  return { title, body: text ?? '', tags: (tags ?? []) as string[] };
}

async function route(
  service: NoteService,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const method = request.method ?? 'GET';
  const url = new URL(request.url ?? '/', 'http://localhost');
  const segments = url.pathname.split('/').filter((segment) => segment.length > 0);
  const id = segments[2] === undefined ? undefined : decodeURIComponent(segments[2]);

  if (segments[0] !== 'api') {
    sendJson(response, 404, { error: 'not found' });
    return;
  }
  if (segments[1] === 'summary' && segments.length === 2 && method === 'GET') {
    sendJson(response, 200, await service.summary());
    return;
  }
  if (segments[1] === 'notes' && segments.length === 2) {
    if (method === 'GET') {
      const notes = await service.search({
        tag: url.searchParams.get('tag') ?? undefined,
        text: url.searchParams.get('text') ?? undefined,
        includeArchived: url.searchParams.get('includeArchived') === 'true',
      });
      sendJson(response, 200, { notes });
      return;
    }
    if (method === 'POST') {
      sendJson(response, 201, await service.add(draftFromBody(await readJsonBody(request))));
      return;
    }
  }
  if (segments[1] === 'notes' && segments.length === 3 && id !== undefined) {
    if (method === 'GET') {
      sendJson(response, 200, await service.get(id));
      return;
    }
    if (method === 'DELETE') {
      sendJson(response, 200, await service.remove(id));
      return;
    }
  }

  const knownMethod = method === 'GET' || method === 'POST' || method === 'DELETE';
  sendJson(response, knownMethod ? 404 : 405, { error: `${method} ${url.pathname} is not a route` });
}

export function createNotesServer(service: NoteService): Server {
  return createServer((request, response) => {
    route(service, request, response).catch((error: unknown) => {
      if (error instanceof NoteNotFoundError || error instanceof NoteValidationError) {
        sendJson(response, error instanceof NoteNotFoundError ? 404 : 400, {
          error: error.message,
        });
        return;
      }
      sendJson(response, 500, { error: 'internal error' });
    });
  });
}

export async function startNotesServer(
  service: NoteService,
  options: { host?: string; port?: number } = {},
): Promise<RunningNotesServer> {
  const host = options.host ?? '127.0.0.1';
  const server = createNotesServer(service);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port ?? 4321, host, resolve);
  });
  const address = server.address();
  const port = typeof address === 'object' && address !== null ? address.port : 0;
  return { server, url: `http://${host}:${port}` };
}
