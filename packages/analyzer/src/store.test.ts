import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { analyzeProject } from './analyze.js';
import { loadSnapshot, saveSnapshot, snapshotPathFor } from './store.js';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

async function makeProject(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'sothspell-store-'));
  roots.push(root);
  await mkdir(path.join(root, 'src'), { recursive: true });
  await writeFile(
    path.join(root, 'package.json'),
    JSON.stringify({ name: 'store-fixture' }),
  );
  await writeFile(path.join(root, 'src', 'index.ts'), 'export const value = 1;\n');
  return root;
}

describe('snapshot store', () => {
  it('saves and loads a snapshot atomically', async () => {
    const root = await makeProject();
    const home = await mkdtemp(path.join(tmpdir(), 'sothspell-home-'));
    roots.push(home);
    const snapshot = await analyzeProject(root);
    const outputPath = snapshotPathFor(home, snapshot.project.slug);

    await saveSnapshot(snapshot, outputPath);
    const loaded = await loadSnapshot(outputPath);

    expect(loaded.id).toBe(snapshot.id);
    expect(loaded.files).toEqual(snapshot.files);
  });

  it('rejects a file that is not a snapshot', async () => {
    const home = await mkdtemp(path.join(tmpdir(), 'sothspell-home-'));
    roots.push(home);
    const file = path.join(home, 'bad.json');
    await writeFile(file, '{"hello":"world"}\n');

    await expect(loadSnapshot(file)).rejects.toThrow(/not a snapshot/i);
  });
});
