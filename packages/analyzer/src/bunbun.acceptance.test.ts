import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { analyzeProject } from './analyze.js';
import { resolveAnchor } from './anchor.js';
import { buildProjectBrief } from './brief.js';
import type { SothspellDocument } from '@sothspell/core';

const bunbunRoot = process.env.BUNBUN_ROOT ?? '/Users/ajc/Projects/codegens/bunbun';
const bunbunAvailable = existsSync(bunbunRoot);
const cacheDirectories: string[] = [];

afterAll(async () => {
  await Promise.all(
    cacheDirectories.map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe.skipIf(!bunbunAvailable)('Bunbun acceptance', () => {
  it('analyzes the pinned checkout without modifying it', async () => {
    const before = execFileSync('git', ['-C', bunbunRoot, 'status', '--porcelain'], {
      encoding: 'utf8',
    });
    const cacheDirectory = await mkdtemp(path.join(tmpdir(), 'sothspell-bunbun-cache-'));
    cacheDirectories.push(cacheDirectory);

    const snapshot = await analyzeProject(bunbunRoot, { cacheDirectory });
    const brief = buildProjectBrief(snapshot);

    expect(snapshot.revision.commit).toBe('9fef24d51355318603ce5006156a3ec56a668594');
    expect(snapshot.analysis.durationMs).toBeLessThan(60_000);
    expect(snapshot.files.length).toBeGreaterThan(500);
    expect(snapshot.symbols.length).toBeGreaterThan(8_000);
    expect(snapshot.graph.fileImports.length).toBeGreaterThan(50);
    expect(
      snapshot.files.some(
        (file) =>
          file.path === 'apps/web/src/islands/comment-composer/CommentComposer.svelte',
      ),
    ).toBe(true);
    expect(snapshot.files.every((file) => !file.path.startsWith('node_modules/'))).toBe(
      true,
    );

    expect(brief.workspace.kind).toBe('pnpm');
    expect(brief.applications.map((application) => application.path)).toEqual(
      expect.arrayContaining(['apps/api', 'apps/web', 'apps/browser-acceptance']),
    );
    expect(brief.featureModules).toHaveLength(21);
    expect(brief.docs.some((doc) => doc.path === 'docs/comments.md')).toBe(true);
    expect(brief.plans.some((plan) => plan.path === 'plans/ROADMAP.md')).toBe(true);
    expect(brief.graphStats.entryPoints).toEqual(
      expect.arrayContaining(['apps/api/src/main.ts', 'apps/web/src/main.ts']),
    );

    const expectedSymbols = [
      'symbol:apps/api/src/main.ts#bootstrap',
      'symbol:apps/api/src/app.module.ts#AppModule',
      'symbol:apps/api/src/comments/comments.service.ts#CommentsService.create',
      'symbol:apps/api/src/comments/thread-page.loader.ts#ThreadPageLoader.load',
      'symbol:apps/api/src/comments/comment-thread.query.ts#CommentThreadQuery.listThread',
      'symbol:apps/api/src/comments/atproto-comment-writer.ts#AtprotoCommentPdsAdapter.create',
      'symbol:apps/api/src/sync/sync-worker.worker.ts',
      'symbol:apps/api/src/sync/index-writer.ts#IndexWriter',
      'symbol:apps/api/src/tags/tag.service.ts#TagService',
      'symbol:apps/web/src/main.ts#mountIslands',
    ];
    const symbolIds = new Set(snapshot.symbols.map((symbol) => symbol.id));
    for (const symbolId of expectedSymbols) {
      expect(symbolIds.has(symbolId), symbolId).toBe(true);
    }

    const tourPath = new URL('../../../examples/bunbun-tour/tour.json', import.meta.url);
    const tour = JSON.parse(readFileSync(tourPath, 'utf8')) as SothspellDocument;
    const anchors = tour.chapters.flatMap((chapter) =>
      chapter.beats.flatMap((beat) => beat.anchors),
    );

    expect(anchors).toHaveLength(20);
    for (const anchor of anchors) {
      const resolved = await resolveAnchor(snapshot, bunbunRoot, anchor);
      expect(resolved, anchor.id).not.toBeNull();
      expect(resolved?.contentHash).toBe(anchor.contentHash);
    }

    const after = execFileSync('git', ['-C', bunbunRoot, 'status', '--porcelain'], {
      encoding: 'utf8',
    });
    expect(before).toBe('');
    expect(after).toBe('');
  });
});
