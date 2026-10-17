import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { NarrationAssetRecord, NarrationAssetStore } from './types.js';

/**
 * Local, content-addressed narration assets. Audio and its alignment record
 * live side by side under the Sóþspell home directory, keyed by the content
 * hash, so the same beat never pays the provider twice on the same machine.
 * A half-written entry is treated as a miss, never as valid audio.
 */

function fileStem(contentHash: string): string {
  // The digest is the filename. Dropping the scheme keeps paths portable (a
  // colon in a Windows filename is illegal) and matches the repository's other
  // content-addressed caches.
  return contentHash.startsWith('sha256:')
    ? contentHash.slice('sha256:'.length)
    : contentHash;
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is NarrationAssetRecord {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { contentHash?: unknown }).contentHash === 'string'
  );
}

async function writeAtomic(filePath: string, data: string | Uint8Array): Promise<void> {
  const temporary = `${filePath}.${randomUUID()}.tmp`;
  await writeFile(temporary, data);
  await rename(temporary, filePath);
}

/**
 * Creates the file-backed narration asset store. Writes go through a temporary
 * file and a rename so a reader never sees a truncated MP3 or a half-written
 * JSON record.
 */
export function createFileNarrationStore(rootDirectory: string): NarrationAssetStore {
  const audioPathFor = (contentHash: string): string =>
    path.join(rootDirectory, `${fileStem(contentHash)}.mp3`);
  const recordPathFor = (contentHash: string): string =>
    path.join(rootDirectory, `${fileStem(contentHash)}.json`);

  return {
    async has(contentHash) {
      const [audio, record] = await Promise.all([
        pathExists(audioPathFor(contentHash)),
        pathExists(recordPathFor(contentHash)),
      ]);
      return audio && record;
    },

    async read(contentHash) {
      try {
        const [audio, raw] = await Promise.all([
          readFile(audioPathFor(contentHash)),
          readFile(recordPathFor(contentHash), 'utf8'),
        ]);
        const parsed: unknown = JSON.parse(raw);
        if (!isRecord(parsed)) {
          return null;
        }
        return { audio, record: parsed };
      } catch {
        // A missing or corrupt cache entry is a normal miss.
        return null;
      }
    },

    async write(contentHash, audio, record) {
      await mkdir(rootDirectory, { recursive: true });
      // Audio first: an interrupted write leaves a miss, not a record that
      // points at audio that was never stored.
      await writeAtomic(audioPathFor(contentHash), audio);
      await writeAtomic(recordPathFor(contentHash), JSON.stringify(record, null, 2));
    },
  };
}
