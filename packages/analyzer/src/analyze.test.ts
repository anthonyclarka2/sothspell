import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { analyzeProject } from './analyze.js';

const roots: string[] = [];

async function makeProject(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'sothspell-analyzer-'));
  roots.push(root);

  await mkdir(path.join(root, 'src'), { recursive: true });
  await mkdir(path.join(root, 'node_modules', 'leftpad'), { recursive: true });
  await mkdir(path.join(root, '.git'), { recursive: true });

  await writeFile(
    path.join(root, 'package.json'),
    JSON.stringify({ name: 'fixture-app', version: '1.0.0' }),
  );
  await writeFile(
    path.join(root, 'README.md'),
    '# Fixture App\n\nA small project used by the analyzer tests.\n',
  );
  await writeFile(
    path.join(root, 'src', 'index.ts'),
    [
      'export const answer = 42;',
      'export function greet(name: string): string {',
      '  return `hello ${name}`;',
      '}',
    ].join('\n'),
  );
  await writeFile(
    path.join(root, 'src', 'secret.ts'),
    "export const apiKey = 'sk-test-0123456789abcdefghijklmnop';\n",
  );
  await writeFile(
    path.join(root, 'node_modules', 'leftpad', 'index.js'),
    'module.exports = () => 1;\n',
  );
  await writeFile(path.join(root, '.git', 'config'), '[core]\n');
  return root;
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe('analyzeProject snapshot basics', () => {
  it('lists source files and ignores node_modules and .git', async () => {
    const root = await makeProject();
    const snapshot = await analyzeProject(root);

    const paths = snapshot.files.map((file) => file.path);
    expect(paths).toContain('package.json');
    expect(paths).toContain('README.md');
    expect(paths).toContain('src/index.ts');
    expect(paths.some((value) => value.startsWith('node_modules/'))).toBe(false);
    expect(paths.some((value) => value.startsWith('.git/'))).toBe(false);
  });

  it('is deterministic for unchanged content', async () => {
    const root = await makeProject();
    const first = await analyzeProject(root);
    const second = await analyzeProject(root);

    expect(second.id).toBe(first.id);
    expect(second.project.fingerprint).toBe(first.project.fingerprint);
  });

  it('changes the snapshot id when content changes', async () => {
    const root = await makeProject();
    const first = await analyzeProject(root);
    await writeFile(path.join(root, 'src', 'index.ts'), 'export const answer = 43;\n');
    const second = await analyzeProject(root);

    expect(second.id).not.toBe(first.id);
  });

  it('marks a secret-like file as redacted without storing its content', async () => {
    const root = await makeProject();
    const snapshot = await analyzeProject(root);

    const secret = snapshot.files.find((file) => file.path === 'src/secret.ts');
    expect(secret?.redacted).toBe(true);
    expect(JSON.stringify(snapshot)).not.toContain('sk-test-0123456789');
    expect(
      snapshot.symbols.some(
        (symbol) => symbol.path === 'src/secret.ts' && symbol.name === 'apiKey',
      ),
    ).toBe(true);
  });

  it('computes language statistics and package manifests', async () => {
    const root = await makeProject();
    const snapshot = await analyzeProject(root);

    expect(snapshot.languages.some((entry) => entry.language === 'typescript')).toBe(
      true,
    );
    expect(snapshot.packages.some((entry) => entry.name === 'fixture-app')).toBe(true);
    expect(snapshot.docs[0]?.title).toBe('Fixture App');
  });
});
