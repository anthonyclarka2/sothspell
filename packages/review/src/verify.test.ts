import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { verifyAnchors } from './verify.js';
import { makeReviewDocument, writeFixtureSource } from './test-fixtures.js';
import type { SothspellDocument } from '@sothspell/core';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

async function makeRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'sothspell-review-verify-'));
  roots.push(root);
  await writeFixtureSource(root);
  return root;
}

describe('anchor verification', () => {
  it('verifies every anchor against the live source', async () => {
    const root = await makeRoot();
    const verification = await verifyAnchors(makeReviewDocument(), {
      sourceRoot: root,
      clock: () => new Date('2026-10-17T00:00:00.000Z'),
    });

    expect(verification.ok).toBe(true);
    expect(verification.checkedAt).toBe('2026-10-17T00:00:00.000Z');
    expect(verification.checks.map((check) => check.anchorId)).toEqual([
      'anchor_readme',
      'anchor_main',
      'anchor_context',
    ]);
    expect(verification.checks.every((check) => check.status === 'verified')).toBe(true);
  });

  it('reports a changed file as a mismatch with both hashes', async () => {
    const root = await makeRoot();
    await writeFixtureSource(root, {
      'src/main.ts': ['export function bootstrap() {', '  return "changed";', '}'],
    });

    const verification = await verifyAnchors(makeReviewDocument(), { sourceRoot: root });

    expect(verification.ok).toBe(false);
    const stale = verification.checks.find((check) => check.anchorId === 'anchor_main');
    expect(stale?.status).toBe('mismatch');
    expect(stale?.liveHash).not.toBe(stale?.expectedHash);
    expect(stale?.detail).toMatch(/does not match/);
  });

  it('reports a deleted file as missing rather than stale', async () => {
    const root = await makeRoot();
    await rm(path.join(root, 'CONTEXT.md'));

    const verification = await verifyAnchors(makeReviewDocument(), { sourceRoot: root });

    expect(verification.ok).toBe(false);
    const missing = verification.checks.find(
      (check) => check.anchorId === 'anchor_context',
    );
    expect(missing?.status).toBe('missing');
    expect(missing?.liveHash).toBeNull();
  });

  it('falls back to the embedded excerpt when no project root is configured', async () => {
    const verification = await verifyAnchors(makeReviewDocument(), { sourceRoot: null });

    expect(verification.ok).toBe(true);
    expect(verification.checks[0]?.detail).toMatch(/embedded excerpt/);
  });

  it('flags a tampered excerpt as a mismatch without a project root', async () => {
    const document = makeReviewDocument();
    const tampered: SothspellDocument = {
      ...document,
      chapters: document.chapters.map((chapter) => ({
        ...chapter,
        beats: chapter.beats.map((beat) => ({
          ...beat,
          anchors: beat.anchors.map((anchor) => ({
            ...anchor,
            excerpt: `${anchor.excerpt ?? ''}\n// edited after hashing`,
          })),
        })),
      })),
    };

    const verification = await verifyAnchors(tampered, { sourceRoot: null });

    expect(verification.ok).toBe(false);
    expect(verification.checks.every((check) => check.status === 'mismatch')).toBe(true);
  });

  it('flags an anchor with neither source nor excerpt as unverifiable', async () => {
    const document = makeReviewDocument();
    const stripped: SothspellDocument = {
      ...document,
      chapters: document.chapters.map((chapter) => ({
        ...chapter,
        beats: chapter.beats.map((beat) => ({
          ...beat,
          anchors: beat.anchors.map(({ excerpt: _excerpt, ...anchor }) => anchor),
        })),
      })),
    };

    const verification = await verifyAnchors(stripped, { sourceRoot: null });

    expect(verification.ok).toBe(false);
    expect(verification.checks[0]?.status).toBe('unverifiable');
  });
});
