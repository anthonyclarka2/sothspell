import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { Hono } from 'hono';
import { afterEach, describe, expect, it } from 'vitest';
import { registerAuthoringRoutes } from './authoring.js';
import {
  AuthoringSourceError,
  createAuthoringService,
  type AuthoringJob,
  type AuthoringService,
} from './authoring-service.js';

const execFileAsync = promisify(execFile);
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

async function temporaryDirectory(prefix: string): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), prefix));
  roots.push(root);
  return root;
}

async function makeGitProject(): Promise<string> {
  const root = await temporaryDirectory('sothspell-authoring-project-');
  await mkdir(path.join(root, 'src'), { recursive: true });
  await writeFile(
    path.join(root, 'README.md'),
    '# Tiny notes\n\nA tiny project used by the authoring tests.\n',
  );
  await writeFile(
    path.join(root, 'src', 'types.ts'),
    [
      'export interface Note {',
      '  id: string;',
      '  text: string;',
      '  tags: string[];',
      '}',
      '',
      'export class NoteError extends Error {}',
      '',
    ].join('\n'),
  );
  await writeFile(
    path.join(root, 'src', 'store.ts'),
    [
      "import type { Note } from './types.js';",
      '',
      'export class MemoryStore {',
      '  private readonly notes = new Map<string, Note>();',
      '',
      '  add(note: Note): void {',
      '    this.notes.set(note.id, note);',
      '  }',
      '',
      '  list(): Note[] {',
      '    return [...this.notes.values()];',
      '  }',
      '',
      '  find(id: string): Note | null {',
      '    return this.notes.get(id) ?? null;',
      '  }',
      '}',
      '',
    ].join('\n'),
  );
  await writeFile(
    path.join(root, 'src', 'service.ts'),
    [
      "import type { Note } from './types.js';",
      "import { MemoryStore } from './store.js';",
      '',
      'export class NoteService {',
      '  constructor(private readonly store: MemoryStore) {}',
      '',
      '  create(id: string, text: string): Note {',
      '    const note: Note = { id, text, tags: [] };',
      '    this.store.add(note);',
      '    return note;',
      '  }',
      '',
      '  search(term: string): Note[] {',
      '    const needle = term.toLowerCase();',
      '    return this.store.list().filter((note) => note.text.toLowerCase().includes(needle));',
      '  }',
      '}',
      '',
    ].join('\n'),
  );
  await writeFile(
    path.join(root, 'src', 'index.ts'),
    [
      "import { NoteService } from './service.js';",
      "import { MemoryStore } from './store.js';",
      '',
      'export function main(): void {',
      '  const service = new NoteService(new MemoryStore());',
      "  service.create('note_1', 'hello');",
      '}',
      '',
    ].join('\n'),
  );

  await execFileAsync('git', ['init', '-b', 'main'], { cwd: root });
  await execFileAsync('git', ['add', '-A'], { cwd: root });
  await execFileAsync(
    'git',
    ['-c', 'user.email=test@example.com', '-c', 'user.name=Test', 'commit', '-m', 'init'],
    { cwd: root },
  );
  return root;
}

async function waitForJob(
  service: AuthoringService,
  jobId: string,
  timeoutMs = 20_000,
): Promise<AuthoringJob> {
  const started = Date.now();
  for (;;) {
    const job = service.get(jobId);
    if (
      job &&
      (job.status === 'done' || job.status === 'failed' || job.status === 'cancelled')
    ) {
      return job;
    }
    if (Date.now() - started > timeoutMs) {
      throw new Error(`job ${jobId} did not finish in time`);
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

function makeService(
  home: string,
  resolveConnection = async () => null,
): AuthoringService {
  return createAuthoringService({
    home,
    importService: {
      async import() {
        throw new Error('import is not used in this test');
      },
      async get() {
        return null;
      },
    },
    resolveAuthoringConnection: resolveConnection,
    analysisCacheDirectory: path.join(home, 'cache', 'analysis'),
    authoringCacheDirectory: path.join(home, 'cache', 'authoring'),
  });
}

describe('authoring service', () => {
  it('inspects a local git repository read-only', async () => {
    const project = await makeGitProject();
    const home = await temporaryDirectory('sothspell-authoring-home-');
    const service = makeService(home);

    const inspection = await service.inspectLocalProject(project);

    expect(inspection.path).toBe(project);
    expect(inspection.fileCount).toBeGreaterThanOrEqual(4);
    expect(inspection.symbolCount).toBeGreaterThan(0);
    expect(inspection.languages.some((language) => language.id === 'typescript')).toBe(
      true,
    );
    expect(inspection.revision.branch).toBe('main');
  });

  it('authors a fixture tour end to end and writes it under SOTHSPELL_HOME', async () => {
    const project = await makeGitProject();
    const home = await temporaryDirectory('sothspell-authoring-home-');
    const service = makeService(home);

    const job = await service.start({
      source: { kind: 'local', path: project },
      model: 'fixture',
      maxMinutes: 6,
    });
    const finished = await waitForJob(service, job.id);

    expect(finished.status).toBe('done');
    expect(finished.error).toBeNull();
    expect(finished.result?.chapters).toBeGreaterThanOrEqual(1);
    expect(finished.result?.beats).toBeGreaterThanOrEqual(1);
    expect(finished.result?.playerPath).toMatch(/^\/t\//);
    expect(finished.result?.tourPath).toContain(
      path.join('tours', finished.result?.tourId ?? ''),
    );

    const { readFile } = await import('node:fs/promises');
    const tour = JSON.parse(await readFile(finished.result?.tourPath ?? '', 'utf8')) as {
      chapters: unknown[];
    };
    expect(tour.chapters.length).toBeGreaterThanOrEqual(1);
  });

  it('rejects a path that is not a git repository', async () => {
    const project = await temporaryDirectory('sothspell-authoring-nogit-');
    const home = await temporaryDirectory('sothspell-authoring-home-');
    const service = makeService(home);

    await expect(service.inspectLocalProject(project)).rejects.toThrow(
      /not a git repository/i,
    );
  });

  it('fails profile authoring when no profile is active', async () => {
    const project = await makeGitProject();
    const home = await temporaryDirectory('sothspell-authoring-home-');
    const service = makeService(home);

    const job = await service.start({
      source: { kind: 'local', path: project },
      model: 'profile',
    });
    const finished = await waitForJob(service, job.id);

    expect(finished.status).toBe('failed');
    expect(finished.error).toMatch(/no authoring profile/i);
  });
});

describe('authoring routes', () => {
  const fakeJob: AuthoringJob = {
    id: 'job_test',
    status: 'queued',
    source: { kind: 'local', label: '/tmp/project' },
    steps: [],
    detail: null,
    result: null,
    error: null,
    createdAt: 0,
    updatedAt: 0,
  };

  function fakeService(overrides: Partial<AuthoringService> = {}): AuthoringService {
    return {
      async start() {
        return fakeJob;
      },
      get() {
        return null;
      },
      cancel() {
        return false;
      },
      async inspectLocalProject() {
        throw new AuthoringSourceError('the path is not a directory');
      },
      ...overrides,
    };
  }

  it('starts a job and returns 202', async () => {
    const app = new Hono();
    registerAuthoringRoutes(app, { service: fakeService() });
    const response = await app.request('/api/authoring', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ source: { kind: 'local', path: '/tmp/project' } }),
    });

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toMatchObject({ job: { id: 'job_test' } });
  });

  it('rejects an invalid payload', async () => {
    const app = new Hono();
    registerAuthoringRoutes(app, { service: fakeService() });
    const response = await app.request('/api/authoring', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ source: { kind: 'local' } }),
    });

    expect(response.status).toBe(400);
  });

  it('returns 404 for an unknown job and maps inspect errors', async () => {
    const app = new Hono();
    registerAuthoringRoutes(app, { service: fakeService() });

    const missing = await app.request('/api/authoring/job_missing');
    expect(missing.status).toBe(404);

    const inspect = await app.request('/api/projects/inspect', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path: '/tmp/nope' }),
    });
    expect(inspect.status).toBe(400);
  });
});
