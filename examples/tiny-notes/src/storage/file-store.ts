/**
 * A JSON document store with atomic writes. Storage sits behind this module so
 * the notes layer never touches the filesystem, and so a crash mid-write can
 * never leave a half-written notes file for the next read.
 */
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

export interface JsonStore<T> {
  read(): Promise<T>;
  write(value: T): Promise<void>;
}

/**
 * Opens the JSON document at `filePath`. A missing file reads as `empty()`;
 * every write replaces the document through a same-directory rename.
 */
export function createJsonStore<T>(filePath: string, empty: () => T): JsonStore<T> {
  return {
    async read() {
      try {
        return JSON.parse(await readFile(filePath, 'utf8')) as T;
      } catch (error) {
        if (isMissingFile(error)) {
          return empty();
        }
        throw error;
      }
    },
    async write(value) {
      const directory = path.dirname(filePath);
      await mkdir(directory, { recursive: true });
      const temporary = path.join(
        directory,
        `.${path.basename(filePath)}.${randomUUID()}.tmp`,
      );
      await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
      try {
        await rename(temporary, filePath);
      } catch (error) {
        await rm(temporary, { force: true });
        throw error;
      }
    },
  };
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && (error as NodeJS.ErrnoException).code === 'ENOENT';
}
