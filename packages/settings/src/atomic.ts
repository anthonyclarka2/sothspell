import { randomUUID } from 'node:crypto';
import { chmod, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * Local configuration is user-private: profiles and secrets are written with
 * owner-only permissions and replaced atomically so a crash can never leave a
 * half-written JSON file behind.
 */

export const PRIVATE_FILE_MODE = 0o600;
const PRIVATE_DIRECTORY_MODE = 0o700;

export async function writeFileAtomic(
  filePath: string,
  contents: string,
  mode: number = PRIVATE_FILE_MODE,
): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true, mode: PRIVATE_DIRECTORY_MODE });
  const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporaryPath, contents, { encoding: 'utf8', mode });
    await rename(temporaryPath, filePath);
    // rename preserves the temp file's mode, but enforce it explicitly: some
    // platforms ignore the mode passed to writeFile.
    await chmod(filePath, mode).catch(() => undefined);
  } catch (error) {
    await rm(temporaryPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

/**
 * Moves a file the parser could not read aside so the next write starts clean.
 * Recovery must never lose the evidence silently, but it also must never make
 * startup fail.
 */
export async function quarantineFile(filePath: string): Promise<void> {
  await rename(filePath, `${filePath}.corrupt-${Date.now()}`).catch(() => undefined);
}

/**
 * Reads and parses JSON, returning `null` when the file is missing, unreadable,
 * or corrupt. A corrupt file is quarantined; callers recover with empty state.
 */
export async function readJsonWithRecovery(filePath: string): Promise<unknown | null> {
  let raw: string;
  try {
    raw = await readFile(filePath, 'utf8');
  } catch {
    return null;
  }
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    await quarantineFile(filePath);
    return null;
  }
}
