import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { hashText, parseSothspell } from '@sothspell/core';
import { createApp } from './app.js';

const roots: string[] = [];
const originalHome = process.env.SOTHSPELL_HOME;
const originalProjectRoot = process.env.SOTHSPELL_PROJECT_ROOT;

const tourId = 'tour_source_fixture';
const slug = 'source-fixture';

interface Fixture {
  root: string;
  home: string;
}

async function temporaryDirectory(prefix: string): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), prefix));
  roots.push(directory);
  return directory;
}

function mainSource(): string {
  return ['export function main(): void {', "  console.log('live fixture');", '}'].join(
    '\n',
  );
}

async function makeFixture(options: { record?: boolean } = {}): Promise<Fixture> {
  const root = await temporaryDirectory('sothspell-source-project-');
  await mkdir(path.join(root, 'src'), { recursive: true });
  await writeFile(path.join(root, 'src', 'main.ts'), `${mainSource()}\n`);
  await writeFile(
    path.join(root, 'src', 'secret.ts'),
    "export const API_KEY = 'abcdefghijklmnop1234';\n",
  );

  const home = await temporaryDirectory('sothspell-source-home-');
  process.env.SOTHSPELL_HOME = home;
  const projectDirectory = path.join(home, 'projects', slug);
  await mkdir(path.join(projectDirectory, 'tours', tourId), { recursive: true });
  if (options.record !== false) {
    await writeFile(
      path.join(projectDirectory, 'project.json'),
      `${JSON.stringify(
        {
          slug,
          name: 'Source fixture',
          sourceRoot: root,
          sourceKind: 'imported',
          revision: { commit: null, branch: null, dirty: false },
          updatedAt: new Date().toISOString(),
        },
        null,
        2,
      )}\n`,
      'utf8',
    );
  }

  const twoLines = mainSource().split('\n').slice(0, 2).join('\n');
  const document = parseSothspell({
    schemaVersion: '1.2.0',
    id: tourId,
    title: 'Source fixture',
    subtitle: 'A small tour used to prove the source route resolves a project record',
    audience: 'new-contributor',
    locale: 'en',
    project: {
      slug,
      name: 'Source fixture',
      revision: { commit: 'test', branch: 'main', dirty: false },
    },
    chapters: [
      {
        id: 'chapter_one',
        title: 'Source',
        summary: 'One chapter with the anchors the source route needs.',
        diagrams: [
          {
            id: 'diagram_one',
            kind: 'architecture',
            title: 'Source',
            nodes: [{ id: 'node_main', label: 'Main', type: 'file' }],
            edges: [],
          },
        ],
        beats: [
          {
            id: 'beat_one',
            title: 'Main',
            narration:
              'This fixture gives the source route a real anchor and a local record to resolve.',
            durationMs: 8000,
            anchors: [
              {
                id: 'anchor_main',
                path: 'src/main.ts',
                symbol: 'main',
                lines: { start: 1, end: 2 },
                contentHash: hashText(twoLines),
                excerpt: twoLines,
                language: 'typescript',
              },
              {
                id: 'anchor_secret',
                path: 'src/secret.ts',
                lines: { start: 1, end: 1 },
                contentHash: hashText("export const API_KEY = 'abcdefghijklmnop1234';"),
                excerpt: "export const API_KEY = 'abcdefghijklmnop1234';",
                language: 'typescript',
              },
            ],
            stage: { anchorIds: ['anchor_main'], diagramId: 'diagram_one' },
          },
        ],
      },
    ],
  });
  await writeFile(
    path.join(projectDirectory, 'tours', tourId, 'tour.json'),
    `${JSON.stringify(document, null, 2)}\n`,
    'utf8',
  );

  return { root, home };
}

function appFor(projectRoot: string | null = null) {
  const previous = process.env.SOTHSPELL_PROJECT_ROOT;
  delete process.env.SOTHSPELL_PROJECT_ROOT;
  const app = createApp({ databasePath: ':memory:', projectRoot });
  if (previous !== undefined) {
    process.env.SOTHSPELL_PROJECT_ROOT = previous;
  }
  return app;
}

function sourceRequest(
  app: ReturnType<typeof createApp>,
  options: {
    projectId?: string;
    sourcePath?: string;
    anchor?: string;
    tourId?: string;
  } = {},
): Promise<Response> {
  const projectId = options.projectId ?? slug;
  const sourcePath = options.sourcePath ?? 'src/main.ts';
  const anchor = options.anchor ?? 'anchor_main';
  const requestTour = options.tourId ?? tourId;
  const query = new URLSearchParams({
    anchor,
    tourId: requestTour,
  });
  return Promise.resolve(
    app.request(`/api/projects/${projectId}/source/${sourcePath}?${query.toString()}`),
  );
}

afterEach(async () => {
  if (originalHome === undefined) {
    delete process.env.SOTHSPELL_HOME;
  } else {
    process.env.SOTHSPELL_HOME = originalHome;
  }
  if (originalProjectRoot === undefined) {
    delete process.env.SOTHSPELL_PROJECT_ROOT;
  } else {
    process.env.SOTHSPELL_PROJECT_ROOT = originalProjectRoot;
  }
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe('project source route', () => {
  it('reads the live file through the tour project record', async () => {
    await makeFixture();
    const response = await sourceRequest(appFor());

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      projectId: string;
      tourId: string;
      totalLines: number;
      stale: boolean;
      html: string;
    };
    expect(body.projectId).toBe(slug);
    expect(body.tourId).toBe(tourId);
    expect(body.totalLines).toBe(4);
    expect(body.stale).toBe(false);
    expect(body.html).toContain('live fixture');
  });

  it('validates the project id against the tour project slug', async () => {
    await makeFixture();
    const response = await sourceRequest(appFor(), { projectId: 'another-project' });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringMatching(/unknown project/i),
    });
  });

  it('refuses a redacted file with 409', async () => {
    await makeFixture();
    const response = await sourceRequest(appFor(), {
      sourcePath: 'src/secret.ts',
      anchor: 'anchor_secret',
    });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringMatching(/redacted/i),
    });
  });

  it('does not use the configured root for a non-golden slug without a record', async () => {
    const fixture = await makeFixture({ record: false });
    const response = await sourceRequest(appFor(fixture.root));

    expect(response.status).toBe(200);
    const body = (await response.json()) as { totalLines: number; stale: boolean };
    // The embedded excerpt has two lines; the live file has four. A stale live
    // read would prove the configured root leaked into another project.
    expect(body.totalLines).toBe(2);
    expect(body.stale).toBe(false);
  });

  it('falls back to the embedded excerpt when no record exists', async () => {
    await makeFixture({ record: false });
    const response = await sourceRequest(appFor());

    expect(response.status).toBe(200);
    const body = (await response.json()) as { excerpt: string; stale: boolean };
    expect(body.excerpt).toContain('export function main');
    expect(body.stale).toBe(false);
  });
});
