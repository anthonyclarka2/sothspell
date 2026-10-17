import type {
  CharacterAlignment,
  NarrationAssetRecord,
  NarrationAssetStore,
} from '@sothspell/narration';

/**
 * Shared test doubles for the API narration seams. The narration package's
 * file store lands on a sibling branch, so API tests seed an in-memory store
 * that speaks the frozen `NarrationAssetStore` contract.
 */

export const testAlignment: CharacterAlignment = {
  characters: ['H', 'i'],
  characterStartTimesSeconds: [0, 0.5],
  characterEndTimesSeconds: [0.5, 1],
};

export interface StoredNarrationAsset {
  audio: Buffer;
  record: NarrationAssetRecord;
}

export interface MemoryNarrationAssetStore extends NarrationAssetStore {
  seed(contentHash: string, asset: StoredNarrationAsset): void;
  /** Reports `has` true while `read` still misses, for race regression tests. */
  orphan(contentHash: string): void;
}

export function createMemoryAssetStore(): MemoryNarrationAssetStore {
  const assets = new Map<string, StoredNarrationAsset>();
  const orphans = new Set<string>();

  return {
    seed(contentHash, asset) {
      assets.set(contentHash, asset);
    },
    orphan(contentHash) {
      orphans.add(contentHash);
    },
    async has(contentHash) {
      return assets.has(contentHash) || orphans.has(contentHash);
    },
    async read(contentHash) {
      return assets.get(contentHash) ?? null;
    },
    async write(contentHash, audio, record) {
      assets.set(contentHash, { audio, record });
    },
  };
}
