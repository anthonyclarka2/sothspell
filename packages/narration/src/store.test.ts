import { Buffer } from 'node:buffer';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createFileNarrationStore } from './store.js';
import type { NarrationAssetRecord } from './types.js';

const contentHash = `sha256:${'a'.repeat(64)}`;

const record: NarrationAssetRecord = {
  contentHash,
  mimeType: 'audio/mpeg',
  durationMs: 1234,
  provider: 'elevenlabs',
  voiceId: 'voice_1',
  modelId: 'model_1',
  alignment: {
    characters: ['H', 'i'],
    characterStartTimesSeconds: [0, 0.1],
    characterEndTimesSeconds: [0.1, 0.2],
  },
};

let root: string;

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'sothspell-narration-'));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('createFileNarrationStore', () => {
  it('reports missing assets without throwing', async () => {
    const store = createFileNarrationStore(root);

    expect(await store.has(contentHash)).toBe(false);
    expect(await store.read(contentHash)).toBeNull();
  });

  it('writes and reads audio beside its record', async () => {
    const store = createFileNarrationStore(root);
    const audio = Buffer.from('fake-mp3-bytes');

    await store.write(contentHash, audio, record);

    expect(await store.has(contentHash)).toBe(true);
    const stored = await store.read(contentHash);
    expect(stored?.audio.equals(audio)).toBe(true);
    expect(stored?.record).toEqual(record);
  });

  it('names files by the digest and leaves no temporary files behind', async () => {
    const store = createFileNarrationStore(root);
    const digest = contentHash.slice('sha256:'.length);

    await store.write(contentHash, Buffer.from('audio'), record);

    expect((await readdir(root)).toSorted()).toEqual([`${digest}.json`, `${digest}.mp3`]);
  });

  it('creates the root directory when it does not exist yet', async () => {
    const nested = path.join(root, 'projects', 'bunbun', 'audio');
    const store = createFileNarrationStore(nested);

    await store.write(contentHash, Buffer.from('audio'), record);

    expect(await store.has(contentHash)).toBe(true);
  });

  it('treats an entry without audio as a miss', async () => {
    const store = createFileNarrationStore(root);
    const digest = contentHash.slice('sha256:'.length);
    await writeFile(path.join(root, `${digest}.json`), JSON.stringify(record), 'utf8');

    expect(await store.has(contentHash)).toBe(false);
    expect(await store.read(contentHash)).toBeNull();
  });

  it('treats a corrupt record as a miss', async () => {
    const store = createFileNarrationStore(root);
    const digest = contentHash.slice('sha256:'.length);
    await store.write(contentHash, Buffer.from('audio'), record);
    await writeFile(path.join(root, `${digest}.json`), 'not json', 'utf8');

    expect(await store.read(contentHash)).toBeNull();
  });

  it('replaces an existing asset on rewrite', async () => {
    const store = createFileNarrationStore(root);
    await store.write(contentHash, Buffer.from('first'), record);
    await store.write(contentHash, Buffer.from('second'), record);

    const stored = await store.read(contentHash);
    expect(stored?.audio.toString()).toBe('second');
  });

  it('keeps the audio private to each content hash', async () => {
    const store = createFileNarrationStore(root);
    const otherHash = `sha256:${'b'.repeat(64)}`;

    await store.write(contentHash, Buffer.from('first'), record);

    expect(await store.has(otherHash)).toBe(false);
    expect(await store.read(otherHash)).toBeNull();
  });

  it('writes valid JSON that can be read from disk', async () => {
    const store = createFileNarrationStore(root);
    const digest = contentHash.slice('sha256:'.length);
    await store.write(contentHash, Buffer.from('audio'), record);

    const raw = await readFile(path.join(root, `${digest}.json`), 'utf8');
    expect(JSON.parse(raw)).toEqual(record);
  });
});
