import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { analyzeProject } from '@sothspell/analyzer';
import { parseSothspell, type SothspellDocument } from '@sothspell/core';
import { saveAnalysisArtifacts, saveTourArtifacts } from './save.js';
import type { AuthoringQuality } from './schemas.js';

const roots: string[] = [];

async function makeProject(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'sothspell-save-project-'));
  roots.push(root);
  await mkdir(path.join(root, 'src'), { recursive: true });
  await writeFile(
    path.join(root, 'package.json'),
    JSON.stringify({ name: 'save-fixture' }),
  );
  await writeFile(
    path.join(root, 'src', 'service.ts'),
    'export class Service { run(): void {} }\n',
  );
  return root;
}

async function makeHome(): Promise<string> {
  const home = await mkdtemp(path.join(tmpdir(), 'sothspell-save-home-'));
  roots.push(home);
  return home;
}

function qualityFixture(): AuthoringQuality {
  return {
    planChapters: 1,
    chapters: 1,
    beats: 1,
    anchors: 1,
    droppedChapters: 0,
    issues: [],
    modelCalls: 1,
    cacheHits: 0,
    usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
    promptVersion: 'test',
    modelId: 'fixture',
    estimatedDurationMs: 8000,
  };
}

function documentFixture(
  snapshot: Awaited<ReturnType<typeof analyzeProject>>,
): SothspellDocument {
  const excerpt = 'export class Service { run(): void {} }';
  return parseSothspell({
    schemaVersion: '1.2.0',
    id: 'tour_save_fixture',
    title: 'Save fixture',
    subtitle: 'A fixture used to exercise the artifact writer',
    audience: 'new-contributor',
    locale: 'en',
    project: {
      slug: snapshot.project.slug,
      name: snapshot.project.name,
      revision: {
        commit: snapshot.revision.commit ?? 'no-git',
        branch: snapshot.revision.branch,
        dirty: snapshot.revision.dirty,
      },
    },
    chapters: [
      {
        id: 'chapter_one',
        title: 'The service',
        summary: 'One chapter used to exercise the artifact writer.',
        diagrams: [
          {
            id: 'diagram_one',
            kind: 'architecture',
            title: 'Service',
            nodes: [
              {
                id: 'node_service',
                label: 'Service',
                type: 'class',
                symbolId: 'symbol:src/service.ts#Service',
              },
            ],
            edges: [],
          },
        ],
        beats: [
          {
            id: 'beat_one',
            title: 'The service',
            narration:
              'The service is the smallest unit this fixture can explain in a beat.',
            durationMs: 8000,
            anchors: [
              {
                id: 'anchor_service',
                path: 'src/service.ts',
                symbol: 'Service',
                symbolId: 'symbol:src/service.ts#Service',
                lines: { start: 1, end: 1 },
                contentHash: `sha256:${'a'.repeat(64)}`,
                excerpt,
                language: 'typescript',
              },
            ],
            stage: { anchorIds: ['anchor_service'], diagramId: 'diagram_one' },
          },
        ],
      },
    ],
  });
}

function projectDirectory(home: string, snapshot: { project: { slug: string } }): string {
  return path.join(home, 'projects', snapshot.project.slug);
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe('saveAnalysisArtifacts', () => {
  it('writes the snapshot and a local project record', async () => {
    const root = await makeProject();
    const snapshot = await analyzeProject(root);
    const home = await makeHome();

    const saved = await saveAnalysisArtifacts({
      home,
      snapshot,
      sourceRoot: root,
      sourceKind: 'local',
    });

    const directory = projectDirectory(home, snapshot);
    expect(saved.snapshotPath).toBe(path.join(directory, 'snapshot.json'));
    expect(saved.projectPath).toBe(path.join(directory, 'project.json'));

    const storedSnapshot = JSON.parse(await readFile(saved.snapshotPath, 'utf8'));
    expect(storedSnapshot.id).toBe(snapshot.id);

    const record = JSON.parse(await readFile(saved.projectPath, 'utf8'));
    expect(record).toMatchObject({
      slug: snapshot.project.slug,
      name: snapshot.project.name,
      sourceRoot: root,
      sourceKind: 'local',
      revision: {
        commit: snapshot.revision.commit,
        branch: snapshot.revision.branch,
        dirty: snapshot.revision.dirty,
      },
    });
    expect(record.updatedAt).toBeTypeOf('string');
    expect(Number.isNaN(Date.parse(record.updatedAt))).toBe(false);
  });

  it('replaces an existing record atomically without leaving temp files', async () => {
    const root = await makeProject();
    const snapshot = await analyzeProject(root);
    const home = await makeHome();
    const directory = projectDirectory(home, snapshot);
    await mkdir(directory, { recursive: true });
    await writeFile(
      path.join(directory, 'project.json'),
      `${JSON.stringify({ slug: 'stale', name: 'Stale' })}\n`,
      'utf8',
    );

    await saveAnalysisArtifacts({
      home,
      snapshot,
      sourceRoot: root,
      sourceKind: 'local',
    });
    const updated = {
      ...snapshot,
      revision: { ...snapshot.revision, commit: 'fedcba9' },
    };
    await saveAnalysisArtifacts({
      home,
      snapshot: updated,
      sourceRoot: root,
      sourceKind: 'imported',
    });

    const record = JSON.parse(
      await readFile(path.join(directory, 'project.json'), 'utf8'),
    );
    expect(record.slug).toBe(snapshot.project.slug);
    expect(record.sourceKind).toBe('imported');
    expect(record.revision.commit).toBe('fedcba9');

    const entries = await readdir(directory);
    expect(entries.filter((entry) => entry.endsWith('.tmp'))).toEqual([]);
  });
});

describe('saveTourArtifacts', () => {
  it('writes analysis artifacts and the tour into a directory destination', async () => {
    const root = await makeProject();
    const snapshot = await analyzeProject(root);
    const home = await makeHome();
    const destination = path.join(home, 'out', 'tour-directory');
    const document = documentFixture(snapshot);

    const saved = await saveTourArtifacts({
      home,
      document,
      quality: qualityFixture(),
      snapshot,
      sourceRoot: root,
      sourceKind: 'local',
      destination,
    });

    expect(saved.tourPath).toBe(path.join(destination, 'tour.json'));
    expect(saved.qualityPath).toBe(path.join(destination, 'quality.json'));
    expect(saved.snapshotPath).toBe(
      path.join(projectDirectory(home, snapshot), 'snapshot.json'),
    );
    expect(saved.projectPath).toBe(
      path.join(projectDirectory(home, snapshot), 'project.json'),
    );

    const tour = await readFile(saved.tourPath, 'utf8');
    expect(JSON.parse(tour).id).toBe(document.id);
    expect(tour).not.toContain(root);
    expect(JSON.parse(await readFile(saved.qualityPath, 'utf8')).modelId).toBe('fixture');

    const record = JSON.parse(await readFile(saved.projectPath, 'utf8'));
    expect(record.sourceRoot).toBe(root);
  });

  it('writes the tour beside a file destination and names the quality file', async () => {
    const root = await makeProject();
    const snapshot = await analyzeProject(root);
    const home = await makeHome();
    const destination = path.join(home, 'out', 'custom-tour.json');
    const document = documentFixture(snapshot);

    const saved = await saveTourArtifacts({
      home,
      document,
      quality: qualityFixture(),
      snapshot,
      sourceRoot: root,
      sourceKind: 'imported',
      destination,
    });

    expect(saved.tourPath).toBe(destination);
    expect(saved.qualityPath).toBe(path.join(home, 'out', 'custom-tour-quality.json'));
    expect(await readFile(saved.tourPath, 'utf8')).toContain(document.id);
    expect(JSON.parse(await readFile(saved.qualityPath, 'utf8'))).toEqual(
      qualityFixture(),
    );
    expect(JSON.parse(await readFile(saved.projectPath, 'utf8'))).toMatchObject({
      sourceKind: 'imported',
      sourceRoot: root,
    });
  });
});
