import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  readTourProjectSlug,
  resolveProjectSource,
  type ProjectRecordResolution,
} from './project-record.js';

const roots: string[] = [];

async function temporaryDirectory(prefix: string): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), prefix));
  roots.push(directory);
  return directory;
}

async function writeTour(directory: string, slug: string): Promise<string> {
  const tourPath = path.join(directory, 'tour.json');
  await writeFile(
    tourPath,
    `${JSON.stringify({ id: 'tour_record_fixture', project: { slug } })}\n`,
    'utf8',
  );
  return tourPath;
}

async function writeRecord(
  home: string,
  slug: string,
  record: Record<string, unknown>,
): Promise<string> {
  const directory = path.join(home, 'projects', slug);
  await mkdir(directory, { recursive: true });
  const recordPath = path.join(directory, 'project.json');
  await writeFile(recordPath, `${JSON.stringify(record, null, 2)}\n`, 'utf8');
  return recordPath;
}

function expectUnavailable(resolution: ProjectRecordResolution, reason: string): void {
  expect(resolution.available).toBe(false);
  expect(resolution.root).toBeNull();
  if (!resolution.available) {
    expect(resolution.reason).toBe(reason);
  }
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe('project record resolver', () => {
  it('reads the project slug from the tour JSON and the root from the record', async () => {
    const home = await temporaryDirectory('sothspell-record-home-');
    const source = await temporaryDirectory('sothspell-record-source-');
    const tourDirectory = await temporaryDirectory('sothspell-record-tour-');
    const tourPath = await writeTour(tourDirectory, 'record-fixture');
    await writeRecord(home, 'record-fixture', {
      slug: 'record-fixture',
      name: 'Record fixture',
      sourceRoot: source,
      sourceKind: 'local',
      revision: { commit: 'abc123', branch: 'main', dirty: false },
      updatedAt: '2026-10-21T00:00:00.000Z',
    });

    const slug = await readTourProjectSlug(tourPath);
    expect(slug).toBe('record-fixture');

    const resolution = await resolveProjectSource(slug ?? '', {
      home,
      configuredRoot: null,
    });
    expect(resolution).toMatchObject({
      available: true,
      slug: 'record-fixture',
      root: source,
      record: {
        slug: 'record-fixture',
        sourceRoot: source,
        sourceKind: 'local',
      },
    });
  });

  it('uses the configured root for the golden slug when no record exists', async () => {
    const home = await temporaryDirectory('sothspell-record-home-');
    const source = await temporaryDirectory('sothspell-record-source-');

    const resolution = await resolveProjectSource('bunbun', {
      home,
      configuredRoot: source,
    });

    expect(resolution).toMatchObject({
      available: true,
      slug: 'bunbun',
      root: source,
      record: null,
    });
  });

  it('reports unavailable when the record is missing and no root is configured', async () => {
    const home = await temporaryDirectory('sothspell-record-home-');

    const resolution = await resolveProjectSource('missing-project', {
      home,
      configuredRoot: null,
    });

    expectUnavailable(resolution, 'missing-record');
    expect(resolution.record).toBeNull();
  });

  it('does not use the configured root for a slug that is not the golden project', async () => {
    const home = await temporaryDirectory('sothspell-record-home-');
    const source = await temporaryDirectory('sothspell-record-source-');

    const resolution = await resolveProjectSource('another-project', {
      home,
      configuredRoot: source,
    });

    expectUnavailable(resolution, 'missing-record');
  });

  it('rejects a record whose slug does not match the tour', async () => {
    const home = await temporaryDirectory('sothspell-record-home-');
    const source = await temporaryDirectory('sothspell-record-source-');
    await writeRecord(home, 'requested-project', {
      slug: 'some-other-project',
      name: 'Wrong',
      sourceRoot: source,
      sourceKind: 'local',
      revision: { commit: null, branch: null, dirty: false },
      updatedAt: '2026-10-21T00:00:00.000Z',
    });

    const resolution = await resolveProjectSource('requested-project', {
      home,
      configuredRoot: null,
    });

    expectUnavailable(resolution, 'slug-mismatch');
  });

  it('reports missing-root when the record points at a directory that is gone', async () => {
    const home = await temporaryDirectory('sothspell-record-home-');
    const source = await temporaryDirectory('sothspell-record-source-');
    await rm(source, { recursive: true, force: true });
    await writeRecord(home, 'gone-project', {
      slug: 'gone-project',
      name: 'Gone',
      sourceRoot: source,
      sourceKind: 'local',
      revision: { commit: null, branch: null, dirty: false },
      updatedAt: '2026-10-21T00:00:00.000Z',
    });

    const resolution = await resolveProjectSource('gone-project', {
      home,
      configuredRoot: null,
    });

    expectUnavailable(resolution, 'missing-root');
    expect(resolution.record).not.toBeNull();
  });

  it('reports invalid-record for malformed JSON', async () => {
    const home = await temporaryDirectory('sothspell-record-home-');
    const directory = path.join(home, 'projects', 'broken-project');
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, 'project.json'), '{ not json', 'utf8');

    const resolution = await resolveProjectSource('broken-project', {
      home,
      configuredRoot: null,
    });

    expectUnavailable(resolution, 'invalid-record');
  });
});
