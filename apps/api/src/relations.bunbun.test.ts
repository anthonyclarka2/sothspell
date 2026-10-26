import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import type { CanvasRelationResponse } from '@sothspell/canvas';
import { createApp } from './app.js';

const bunbunRoot = process.env.BUNBUN_ROOT ?? '/Users/ajc/Projects/codegens/bunbun';
const bunbunAvailable = existsSync(bunbunRoot);
const originalHome = process.env.SOTHSPELL_HOME;
const homes: string[] = [];

afterAll(async () => {
  if (originalHome === undefined) {
    delete process.env.SOTHSPELL_HOME;
  } else {
    process.env.SOTHSPELL_HOME = originalHome;
  }
  await Promise.all(homes.map((home) => rm(home, { recursive: true, force: true })));
});

function bunbunStatus(): string {
  return execFileSync('git', ['-C', bunbunRoot, 'status', '--porcelain'], {
    encoding: 'utf8',
  });
}

describe.skipIf(!bunbunAvailable)('canvas relation API on Bunbun', () => {
  it('opens the comments service definition, callers, and callees without writing', async () => {
    const before = bunbunStatus();
    const home = await mkdtemp(path.join(tmpdir(), 'sothspell-relations-bunbun-'));
    homes.push(home);
    process.env.SOTHSPELL_HOME = home;

    const app = createApp({
      databasePath: ':memory:',
      // No project record exists yet for Bunbun; the configured root stands in
      // for the golden project only.
      projectRoot: bunbunRoot,
    });
    const symbolId =
      'symbol:apps/api/src/comments/comments.service.ts#CommentsService.create';
    const query = (direction: string) =>
      `/api/tours/tour_bunbun_golden/canvas/symbol?symbolId=${encodeURIComponent(symbolId)}&direction=${direction}`;

    const definition = await app.request(query('definition'));
    expect(definition.status).toBe(200);
    const definitionBody = (await definition.json()) as CanvasRelationResponse;
    expect(definitionBody.symbol.id).toBe(symbolId);
    expect(definitionBody.container.excerpt).toContain('create(');
    expect(definitionBody.relations).toEqual([]);

    const incoming = await app.request(query('incoming'));
    expect(incoming.status).toBe(200);
    const incomingText = await incoming.text();
    const incomingBody = JSON.parse(incomingText) as CanvasRelationResponse;
    expect(incomingBody.relations).toContainEqual(
      expect.objectContaining({
        relation: 'calls',
        symbol: expect.objectContaining({
          id: 'symbol:apps/api/src/comments/comments.controller.ts#CommentsController.create',
        }),
      }),
    );
    expect(incomingText).not.toContain(bunbunRoot);

    const outgoing = await app.request(query('outgoing'));
    expect(outgoing.status).toBe(200);
    const outgoingBody = (await outgoing.json()) as CanvasRelationResponse;
    expect(outgoingBody.relations).toContainEqual(
      expect.objectContaining({
        relation: 'calls',
        symbol: expect.objectContaining({
          id: 'symbol:apps/api/src/comments/comments.service.ts#CommentsService.parseText',
        }),
      }),
    );

    expect(bunbunStatus()).toBe(before);
    expect(bunbunStatus()).toBe('');
  }, 60_000);
});
