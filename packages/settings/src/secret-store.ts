import { readJsonWithRecovery, writeFileAtomic } from './atomic.js';

/**
 * The `SecretStore` port keeps credential storage behind one seam. The file
 * adapter is the v2 default; a keychain adapter can replace it without touching
 * the settings service or the API. Values are only ever read by the server-side
 * callers that need them, and no method returns the whole store.
 */
export interface SecretStore {
  get(ref: string): Promise<string | null>;
  set(ref: string, value: string): Promise<void>;
  delete(ref: string): Promise<boolean>;
  has(ref: string): Promise<boolean>;
}

export interface FileSecretStoreOptions {
  filePath: string;
}

function stringEntries(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  const entries: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (typeof entry === 'string') {
      entries[key] = entry;
    }
  }
  return entries;
}

export function createFileSecretStore(options: FileSecretStoreOptions): SecretStore {
  const readAll = async (): Promise<Record<string, string>> =>
    stringEntries(await readJsonWithRecovery(options.filePath));

  const writeAll = async (entries: Record<string, string>): Promise<void> => {
    await writeFileAtomic(options.filePath, `${JSON.stringify(entries, null, 2)}\n`);
  };

  return {
    async get(ref) {
      const entries = await readAll();
      return entries[ref] ?? null;
    },
    async has(ref) {
      const entries = await readAll();
      return ref in entries;
    },
    async set(ref, value) {
      const entries = await readAll();
      entries[ref] = value;
      await writeAll(entries);
    },
    async delete(ref) {
      const entries = await readAll();
      if (!(ref in entries)) {
        return false;
      }
      delete entries[ref];
      await writeAll(entries);
      return true;
    },
  };
}

/** Test double for API and web tests; never touches the filesystem. */
export function createMemorySecretStore(seed: Record<string, string> = {}): SecretStore {
  const entries = new Map<string, string>(Object.entries(seed));
  return {
    async get(ref) {
      return entries.get(ref) ?? null;
    },
    async has(ref) {
      return entries.has(ref);
    },
    async set(ref, value) {
      entries.set(ref, value);
    },
    async delete(ref) {
      return entries.delete(ref);
    },
  };
}
