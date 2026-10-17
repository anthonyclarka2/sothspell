import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { compileSothspell } from '@sothspell/core';
import { analyzeProject, buildProjectBrief } from '@sothspell/analyzer';
import { authorTour, buildContextPack, createFixtureGuideModel } from './index.js';

const bunbunRoot = process.env.BUNBUN_ROOT ?? '/Users/ajc/Projects/codegens/bunbun';
const bunbunAvailable = existsSync(bunbunRoot);
const temporaryDirectories: string[] = [];

afterAll(async () => {
  await Promise.all(
    temporaryDirectories.map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe.skipIf(!bunbunAvailable)('Bunbun authoring acceptance', () => {
  it('authors and compiles a fixture tour without modifying Bunbun', async () => {
    const before = execFileSync('git', ['-C', bunbunRoot, 'status', '--porcelain'], {
      encoding: 'utf8',
    });
    const cacheDirectory = await mkdtemp(path.join(tmpdir(), 'sothspell-author-cache-'));
    temporaryDirectories.push(cacheDirectory);

    const snapshot = await analyzeProject(bunbunRoot, { cacheDirectory });
    const brief = buildProjectBrief(snapshot);
    const context = await buildContextPack(snapshot, brief, {
      sourceRoot: bunbunRoot,
      maxCandidates: 24,
    });
    const result = await authorTour(snapshot, createFixtureGuideModel(context), {
      sourceRoot: bunbunRoot,
      contextPack: context,
    });

    expect(result.quality.droppedChapters).toBe(0);
    expect(result.document.chapters).toHaveLength(4);
    expect(result.document.chapters.flatMap((chapter) => chapter.beats)).toHaveLength(8);

    const compiled = await compileSothspell(result.document);
    expect(compiled.chapters).toHaveLength(4);
    expect(compiled.estimatedDurationMs).toBeGreaterThan(60_000);

    const after = execFileSync('git', ['-C', bunbunRoot, 'status', '--porcelain'], {
      encoding: 'utf8',
    });
    expect(before).toBe('');
    expect(after).toBe('');
  });
});
