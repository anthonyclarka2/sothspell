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

  it('resolves the comments controller and service call edges', async () => {
    const snapshot = await analyzeProject(bunbunRoot);
    const calls = snapshot.graph.edges.filter((edge) => edge.kind === 'calls');

    expect(calls.length).toBeGreaterThan(0);
    expect(snapshot.analysis.unresolvedCalls).toBeGreaterThan(0);

    // The controller talks to the service through a constructor parameter
    // property, so this edge requires following an imported class type. The
    // call line is checked against the pinned source rather than a magic
    // number, so the claim stays truthful if the checkout is re-pinned.
    const controllerPath = 'apps/api/src/comments/comments.controller.ts';
    const controllerLines = readFileSync(
      path.join(bunbunRoot, controllerPath),
      'utf8',
    ).split('\n');
    const controllerCallLine =
      controllerLines.findIndex((line) => line.includes('this.commentsService.create(')) +
      1;
    expect(controllerCallLine).toBeGreaterThan(0);

    const controllerToService = calls.find(
      (edge) =>
        edge.from ===
          'symbol:apps/api/src/comments/comments.controller.ts#CommentsController.create' &&
        edge.to ===
          'symbol:apps/api/src/comments/comments.service.ts#CommentsService.create',
    );
    expect(controllerToService).toMatchObject({
      kind: 'calls',
      confidence: 'import',
      atLine: controllerCallLine,
    });

    const servicePath = 'apps/api/src/comments/comments.service.ts';
    const serviceLines = readFileSync(path.join(bunbunRoot, servicePath), 'utf8').split(
      '\n',
    );
    const serviceCallLine =
      serviceLines.findIndex((line) => line.includes('this.parseText(')) + 1;
    expect(serviceCallLine).toBeGreaterThan(0);

    expect(calls).toContainEqual({
      from: 'symbol:apps/api/src/comments/comments.service.ts#CommentsService.create',
      to: 'symbol:apps/api/src/comments/comments.service.ts#CommentsService.parseText',
      kind: 'calls',
      confidence: 'syntax',
      atLine: serviceCallLine,
    });
  });
});
