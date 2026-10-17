import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { hashText, readSourceRange, resolveContainedPath } from './source.js';

const temporaryRoots: string[] = [];

async function makeProject(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'sothspell-source-'));
  temporaryRoots.push(root);
  await mkdir(path.join(root, 'src'), { recursive: true });
  await writeFile(
    path.join(root, 'src', 'example.ts'),
    ['const first = 1;', 'const second = 2;', 'const third = 3;'].join('\n'),
    'utf8',
  );
  return root;
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe('read-only source access', () => {
  it('reads a 1-based inclusive line range', async () => {
    const root = await makeProject();
    const range = await readSourceRange(root, 'src/example.ts', 1, 2);

    expect(range.text).toBe('const first = 1;\nconst second = 2;');
    expect(range.contentHash).toBe(hashText(range.text));
  });

  it('rejects absolute paths and parent traversal', async () => {
    const root = await makeProject();

    await expect(resolveContainedPath(root, '/etc/passwd')).rejects.toThrow(/absolute/i);
    await expect(resolveContainedPath(root, '../outside.ts')).rejects.toThrow(
      /traversal/i,
    );
  });

  it('rejects a symlink that escapes the project root', async () => {
    const root = await makeProject();
    const outside = await mkdtemp(path.join(tmpdir(), 'sothspell-outside-'));
    temporaryRoots.push(outside);
    await writeFile(path.join(outside, 'secret.ts'), 'export const secret = true;');
    const { symlink } = await import('node:fs/promises');
    await symlink(path.join(outside, 'secret.ts'), path.join(root, 'src', 'link.ts'));

    await expect(resolveContainedPath(root, 'src/link.ts')).rejects.toThrow(/outside/i);
  });

  it('rejects a range beyond the end of the file', async () => {
    const root = await makeProject();

    await expect(readSourceRange(root, 'src/example.ts', 1, 99)).rejects.toThrow(
      /range/i,
    );
  });
});
