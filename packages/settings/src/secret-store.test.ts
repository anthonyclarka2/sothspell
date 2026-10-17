import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createFileSecretStore, createMemorySecretStore } from './secret-store.js';

const roots: string[] = [];

async function makeStore(): Promise<{
  filePath: string;
  store: ReturnType<typeof createFileSecretStore>;
}> {
  const root = await mkdtemp(path.join(tmpdir(), 'sothspell-secrets-'));
  roots.push(root);
  const filePath = path.join(root, 'config', 'secrets.json');
  return { filePath, store: createFileSecretStore({ filePath }) };
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe('createFileSecretStore', () => {
  it('round-trips a secret value', async () => {
    const { store } = await makeStore();

    await store.set('profiles/prof_1', 'sk-secret-value');

    await expect(store.get('profiles/prof_1')).resolves.toBe('sk-secret-value');
    await expect(store.has('profiles/prof_1')).resolves.toBe(true);
  });

  it('returns null for a missing file and a missing ref', async () => {
    const { store } = await makeStore();

    await expect(store.get('profiles/prof_1')).resolves.toBeNull();
    await expect(store.has('profiles/prof_1')).resolves.toBe(false);
  });

  it('deletes a secret and reports whether it existed', async () => {
    const { store } = await makeStore();
    await store.set('profiles/prof_1', 'sk-secret-value');

    await expect(store.delete('profiles/prof_1')).resolves.toBe(true);
    await expect(store.delete('profiles/prof_1')).resolves.toBe(false);
    await expect(store.get('profiles/prof_1')).resolves.toBeNull();
  });

  it('writes the secret file with owner-only permissions', async () => {
    const { filePath, store } = await makeStore();

    await store.set('profiles/prof_1', 'sk-secret-value');

    const mode = (await stat(filePath)).mode & 0o777;
    expect(mode).toBe(0o600);
    const directoryMode = (await stat(path.dirname(filePath))).mode & 0o777;
    expect(directoryMode).toBe(0o700);
  });

  it('recovers from a corrupt file by quarantining it and starting empty', async () => {
    const { filePath, store } = await makeStore();
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, '{ this is not json', 'utf8');

    await expect(store.get('profiles/prof_1')).resolves.toBeNull();

    const entries = await readdir(path.dirname(filePath));
    expect(entries.some((entry) => entry.startsWith('secrets.json.corrupt-'))).toBe(true);

    await store.set('profiles/prof_1', 'sk-secret-value');
    await expect(store.get('profiles/prof_1')).resolves.toBe('sk-secret-value');
    expect(JSON.parse(await readFile(filePath, 'utf8'))).toEqual({
      'profiles/prof_1': 'sk-secret-value',
    });
  });

  it('replaces the file atomically without leaving temp files', async () => {
    const { filePath, store } = await makeStore();

    await store.set('profiles/a', 'first');
    await store.set('profiles/b', 'second');

    const entries = await readdir(path.dirname(filePath));
    expect(entries).toEqual(['secrets.json']);
    expect(JSON.parse(await readFile(filePath, 'utf8'))).toEqual({
      'profiles/a': 'first',
      'profiles/b': 'second',
    });
  });

  it('ignores non-string entries in a hand-edited file', async () => {
    const { filePath, store } = await makeStore();
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(
      filePath,
      JSON.stringify({ 'profiles/a': 'kept', 'profiles/b': 42 }),
      'utf8',
    );

    await expect(store.get('profiles/a')).resolves.toBe('kept');
    await expect(store.has('profiles/b')).resolves.toBe(false);
  });
});

describe('createMemorySecretStore', () => {
  it('behaves like the file store', async () => {
    const store = createMemorySecretStore({ seeded: 'value' });

    await expect(store.get('seeded')).resolves.toBe('value');
    await store.set('other', 'x');
    await expect(store.has('other')).resolves.toBe(true);
    await expect(store.delete('other')).resolves.toBe(true);
    await expect(store.get('other')).resolves.toBeNull();
  });
});
