import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { hashText } from '@sothspell/core';

interface CacheRecord<T> {
  version: string;
  key: string;
  value: T;
}

/**
 * Disk cache for model calls. The key includes the model, prompt version,
 * schema name, system prompt, and user prompt, so a changed input can never
 * reuse an older object.
 */
export class AuthoringCache {
  private readonly directory: string;
  private readonly version: string;
  hits = 0;
  misses = 0;

  constructor(directory: string, version: string) {
    this.directory = directory;
    this.version = version;
  }

  private fileFor(key: string): string {
    return path.join(this.directory, `${hashText(key).slice('sha256:'.length)}.json`);
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const raw = await readFile(this.fileFor(key), 'utf8');
      const parsed = JSON.parse(raw) as CacheRecord<T>;
      if (parsed.version === this.version && parsed.key === key) {
        this.hits += 1;
        return parsed.value;
      }
    } catch {
      // A missing cache entry is a normal miss.
    }
    this.misses += 1;
    return null;
  }

  async set<T>(key: string, value: T): Promise<void> {
    try {
      await mkdir(this.directory, { recursive: true });
      await writeFile(
        this.fileFor(key),
        JSON.stringify({ version: this.version, key, value } satisfies CacheRecord<T>),
        'utf8',
      );
    } catch {
      // Caching is an optimization; a read-only home must not fail authoring.
    }
  }
}
