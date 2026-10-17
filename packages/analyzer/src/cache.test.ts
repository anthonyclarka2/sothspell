import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { analyzeProject } from './analyze.js';

const roots: string[] = [];

async function makeProject(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'sothspell-cache-'));
  roots.push(root);
  await mkdir(path.join(root, 'src'), { recursive: true });
  await writeFile(
    path.join(root, 'package.json'),
    JSON.stringify({ name: 'cache-fixture' }),
  );
  await writeFile(
    path.join(root, 'src', 'one.ts'),
    'export class One { run(): number { return 1; } }\n',
  );
  await writeFile(
    path.join(root, 'src', 'two.ts'),
    'export function two(): number { return 2; }\n',
  );
  return root;
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe('incremental parse cache', () => {
  it('reuses parsed files when content is unchanged', async () => {
    const root = await makeProject();
    const cacheDirectory = path.join(root, '..', `cache-${path.basename(root)}`);
    roots.push(cacheDirectory);

    const first = await analyzeProject(root, { cacheDirectory });
    const second = await analyzeProject(root, { cacheDirectory });

    expect(second.id).toBe(first.id);
    expect(first.analysis.cacheMisses).toBeGreaterThan(0);
    expect(second.analysis.cacheHits).toBeGreaterThan(0);
    expect(second.analysis.cacheMisses).toBe(0);
  });

  it('re-parses only the changed file', async () => {
    const root = await makeProject();
    const cacheDirectory = path.join(root, '..', `cache-${path.basename(root)}`);
    roots.push(cacheDirectory);

    await analyzeProject(root, { cacheDirectory });
    await writeFile(
      path.join(root, 'src', 'two.ts'),
      'export function two(): number { return 3; }\n',
    );
    const changed = await analyzeProject(root, { cacheDirectory });

    expect(changed.analysis.cacheMisses).toBe(1);
    expect(changed.analysis.cacheHits).toBeGreaterThan(0);
  });
});
