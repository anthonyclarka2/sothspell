import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { walkProjectFiles } from './walk.js';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

async function makeTree(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'sothspell-walk-'));
  roots.push(root);
  await mkdir(path.join(root, 'src', 'nested'), { recursive: true });
  await mkdir(path.join(root, 'node_modules', 'pkg'), { recursive: true });
  await mkdir(path.join(root, '.hidden'), { recursive: true });
  await writeFile(path.join(root, 'README.md'), '# demo\n');
  await writeFile(path.join(root, 'src', 'index.ts'), 'export {};\n');
  await writeFile(path.join(root, 'src', 'nested', 'deep.ts'), 'export {};\n');
  await writeFile(
    path.join(root, 'node_modules', 'pkg', 'index.js'),
    'module.exports = 1;\n',
  );
  await writeFile(path.join(root, '.hidden', 'note.md'), 'hidden\n');
  await writeFile(path.join(root, '.dotfile'), 'dot\n');
  return root;
}

describe('walkProjectFiles', () => {
  it('lists files at every depth, skipping ignored directories', async () => {
    const root = await makeTree();
    const files = await walkProjectFiles(root);

    expect(files).toContain('README.md');
    expect(files).toContain('src/index.ts');
    expect(files).toContain('src/nested/deep.ts');
    expect(files).toContain('.dotfile');
    expect(files).toContain('.hidden/note.md');
    expect(files.some((file) => file.startsWith('node_modules/'))).toBe(false);
  });

  it('honours maxDepth and the dot option', async () => {
    const root = await makeTree();

    const shallow = await walkProjectFiles(root, { maxDepth: 1, dot: false });
    expect(shallow).toEqual(['README.md', 'src/index.ts']);
  });

  it('lists a file symlink and skips a directory symlink', async () => {
    const root = await makeTree();
    await symlink(path.join(root, 'src', 'index.ts'), path.join(root, 'link.ts'));
    await symlink(path.join(root, 'src'), path.join(root, 'src-link'));

    const files = await walkProjectFiles(root);

    expect(files).toContain('link.ts');
    expect(files).not.toContain('src-link');
    expect(files.some((file) => file.startsWith('src-link/'))).toBe(false);
  });
});
