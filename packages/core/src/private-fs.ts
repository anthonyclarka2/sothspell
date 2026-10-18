import { chmodSync, mkdirSync } from 'node:fs';

/**
 * Local state is user-private. SQLite databases, WAL sidecars, and their
 * directories hold accounts, sessions, runs, and review data, so they are
 * created and re-chmodded owner-only even when an older install left them
 * world-readable.
 */

export const PRIVATE_FILE_MODE = 0o600;
export const PRIVATE_DIRECTORY_MODE = 0o700;

export function ensurePrivateDirectorySync(directory: string): void {
  try {
    mkdirSync(directory, { recursive: true, mode: PRIVATE_DIRECTORY_MODE });
  } catch {
    // An existing or unreadable directory is handled by the chmod below.
  }
  try {
    chmodSync(directory, PRIVATE_DIRECTORY_MODE);
  } catch {
    // Windows and read-only mounts may refuse; the file modes still apply.
  }
}

export function privatizeFileSync(filePath: string): void {
  for (const candidate of [filePath, `${filePath}-wal`, `${filePath}-shm`]) {
    try {
      chmodSync(candidate, PRIVATE_FILE_MODE);
    } catch {
      // A missing sidecar or a platform that ignores modes is not an error.
    }
  }
}
