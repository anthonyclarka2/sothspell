import type { RunTombstone, SyncRun } from './types.js';

/**
 * Deterministic set union for completed beats. Sorting keeps exports, API
 * responses, and tests stable regardless of merge order.
 */
export function unionCompletedBeatIds(
  left: readonly string[],
  right: readonly string[],
): string[] {
  return [...new Set([...left, ...right])].toSorted();
}

/**
 * The Phase 12 merge rule: per-field last write wins by `updatedAt`, but beat
 * and offset always travel together as the newest pair, and completed beats
 * are a set union. Ties prefer `left`, so pushing the already-stored row again
 * is byte-identical and therefore idempotent.
 */
export function mergeSyncRun(left: SyncRun, right: SyncRun): SyncRun {
  const newer = right.updatedAt > left.updatedAt ? right : left;
  return {
    tourId: newer.tourId,
    beatId: newer.beatId,
    offsetMs: newer.offsetMs,
    completedBeatIds: unionCompletedBeatIds(
      left.completedBeatIds,
      right.completedBeatIds,
    ),
    mode: newer.mode,
    speed: newer.speed,
    updatedAt: Math.max(left.updatedAt, right.updatedAt),
  };
}

/**
 * A tombstone beats any run written at or before the deletion. A run written
 * after the deletion is a deliberate new start and survives.
 */
export function tombstoneWins(tombstone: RunTombstone, run: SyncRun): boolean {
  return tombstone.deletedAt >= run.updatedAt;
}

/**
 * Merges two run sets and drops runs a tombstone already deleted. Used by the
 * web client when a pull lands beside local IndexedDB progress.
 */
export function mergeRunCollections(
  local: readonly SyncRun[],
  remote: readonly SyncRun[],
  tombstones: readonly RunTombstone[] = [],
): SyncRun[] {
  const byTour = new Map<string, SyncRun>();
  for (const run of [...local, ...remote]) {
    const existing = byTour.get(run.tourId);
    byTour.set(run.tourId, existing ? mergeSyncRun(existing, run) : run);
  }

  const deleted = new Map(
    tombstones.map((tombstone) => [tombstone.tourId, tombstone]),
  );
  for (const [tourId, run] of byTour) {
    const tombstone = deleted.get(tourId);
    if (tombstone && tombstoneWins(tombstone, run)) {
      byTour.delete(tourId);
    }
  }

  return [...byTour.values()].toSorted(
    (left, right) =>
      right.updatedAt - left.updatedAt || left.tourId.localeCompare(right.tourId),
  );
}
