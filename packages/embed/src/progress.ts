/**
 * Local progress for the embed. The embed is often served from a docs origin
 * that has no Sóþspell server, so progress lives in the host origin's
 * `localStorage` and never leaves it. Every function tolerates a missing or
 * broken store: an embed must play even when storage is unavailable (private
 * mode, blocked cookies, an opt-out).
 */

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface StoredEmbedProgress {
  tourId: string;
  beatId: string;
  offsetMs: number;
  completedBeatIds: string[];
  speed: number;
  updatedAt: number;
}

export function progressStorageKey(tourId: string): string {
  return `sothspell:embed:${tourId}`;
}

export function defaultStorage(): StorageLike | null {
  // Only a real window has `localStorage` the embed should touch; Node 26 also
  // exposes a (disabled) global, and reading it there emits a warning.
  const scope = globalThis as { window?: { localStorage?: StorageLike } };
  if (!scope.window) {
    return null;
  }
  try {
    return scope.window.localStorage ?? null;
  } catch {
    // Accessing localStorage can throw when the host blocks storage.
    return null;
  }
}

function isStoredProgress(value: unknown): value is StoredEmbedProgress {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const record = value as Partial<StoredEmbedProgress>;
  return (
    typeof record.tourId === 'string' &&
    typeof record.beatId === 'string' &&
    typeof record.offsetMs === 'number' &&
    Number.isFinite(record.offsetMs) &&
    Array.isArray(record.completedBeatIds) &&
    record.completedBeatIds.every((id) => typeof id === 'string') &&
    typeof record.speed === 'number' &&
    Number.isFinite(record.speed) &&
    typeof record.updatedAt === 'number'
  );
}

export function readEmbedProgress(
  storage: StorageLike | null,
  tourId: string,
): StoredEmbedProgress | null {
  if (!storage) {
    return null;
  }
  try {
    const raw = storage.getItem(progressStorageKey(tourId));
    if (raw === null) {
      return null;
    }
    const parsed: unknown = JSON.parse(raw);
    return isStoredProgress(parsed) && parsed.tourId === tourId ? parsed : null;
  } catch {
    return null;
  }
}

export function writeEmbedProgress(
  storage: StorageLike | null,
  progress: StoredEmbedProgress,
): void {
  if (!storage) {
    return;
  }
  try {
    storage.setItem(progressStorageKey(progress.tourId), JSON.stringify(progress));
  } catch {
    // A full or blocked store is not a playback failure.
  }
}

export function clearEmbedProgress(storage: StorageLike | null, tourId: string): void {
  if (!storage) {
    return;
  }
  try {
    storage.removeItem(progressStorageKey(tourId));
  } catch {
    // Ignore; clearing is best-effort.
  }
}
