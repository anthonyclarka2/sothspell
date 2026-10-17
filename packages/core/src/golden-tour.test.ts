import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { compileSothspell } from './compiler.js';
import type { SothspellDocument } from './schema.js';

const tourUrl = new URL('../../../examples/bunbun-tour/tour.json', import.meta.url);
const bunbunRoot = '/Users/ajc/Projects/codegens/bunbun';

function loadGoldenDocument(): SothspellDocument {
  return JSON.parse(readFileSync(tourUrl, 'utf8')) as SothspellDocument;
}

describe('golden Bunbun tour', () => {
  it('compiles every anchor and diagram', async () => {
    const document = loadGoldenDocument();
    const compiled = await compileSothspell(document);

    expect(compiled.project.revision.commit).toBe('9fef24d');
    expect(compiled.chapters).toHaveLength(6);

    const beats = compiled.chapters.flatMap((chapter) => chapter.beats);
    const anchors = beats.flatMap((beat) => beat.anchors);
    const diagrams = compiled.chapters.flatMap((chapter) => chapter.diagrams);

    expect(beats.length).toBeGreaterThanOrEqual(18);
    expect(anchors.length).toBeGreaterThanOrEqual(beats.length);

    for (const anchor of anchors) {
      expect(anchor.html).toContain('shiki');
      expect(anchor.excerpt.length).toBeGreaterThan(0);
      expect(anchor.contentHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    }

    for (const diagram of diagrams) {
      expect(diagram.nodes.length).toBeGreaterThan(0);
      for (const node of diagram.nodes) {
        expect(Number.isFinite(node.x)).toBe(true);
        expect(Number.isFinite(node.y)).toBe(true);
      }
    }

    expect(compiled.estimatedDurationMs).toBeGreaterThan(8 * 60 * 1000);
  });

  it('does not modify the pinned Bunbun checkout', () => {
    if (!existsSync(bunbunRoot)) {
      return;
    }

    const status = execFileSync('git', ['-C', bunbunRoot, 'status', '--porcelain'], {
      encoding: 'utf8',
    });

    expect(status).toBe('');
  });
});
