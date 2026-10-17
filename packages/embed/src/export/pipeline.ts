import { compileSothspell, parseSothspell, type CompiledTour } from '@sothspell/core';
import { EMBED_CHANNEL } from '../protocol.js';
import type { EmbedTour, EmbedTranslation } from '../types.js';
import {
  createManifest,
  fileEntry,
  serializeManifest,
  type EmbedManifest,
  type EmbedManifestAnchor,
  type EmbedManifestFile,
} from './manifest.js';
import { renderIframePage } from './page.js';
import { renderExportReadme } from './readme.js';
import {
  byteLength,
  DEFAULT_MAX_EXCERPT_BYTES,
  DEFAULT_MAX_TOTAL_EXCERPT_BYTES,
  EmbedExportError,
  validateAssetPath,
  validateTourContent,
} from './validate.js';

export interface EmbedAsset {
  path: string;
  contents: string;
}

/** The pipeline writes through this seam so tests can use an in-memory writer. */
export interface EmbedAssetWriter {
  write(path: string, contents: string): Promise<void>;
}

export interface EmbedExportOptions {
  embedApiVersion: string;
  /** ISO timestamp; injected so exports are deterministic in tests. */
  generatedAt: string;
  assets: readonly EmbedAsset[];
  sourceRoot?: string | null;
  maxExcerptBytes?: number;
  maxTotalExcerptBytes?: number;
}

export interface EmbedExportResult {
  manifest: EmbedManifest;
  files: EmbedManifestFile[];
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function extractOverlay(input: unknown): Pick<EmbedTour, 'locale' | 'translations'> {
  if (typeof input !== 'object' || input === null) {
    return {};
  }
  const record = input as { locale?: unknown; translations?: unknown };
  const locale = typeof record.locale === 'string' ? record.locale : undefined;
  const translations =
    typeof record.translations === 'object' && record.translations !== null
      ? (record.translations as Record<string, EmbedTranslation>)
      : undefined;
  return {
    ...(locale === undefined ? {} : { locale }),
    ...(translations === undefined ? {} : { translations }),
  };
}

/**
 * Builds an embed bundle as a pure function over a tour, an options bag, and a
 * writer. `apps/cli` supplies the filesystem writer and the built player
 * assets; tests supply an in-memory writer and fake assets. Everything is
 * validated before the first byte is written, so a rejected export cannot
 * leave a half-written bundle.
 */
export async function buildEmbedExport(
  input: unknown,
  options: EmbedExportOptions,
  writer: EmbedAssetWriter,
): Promise<EmbedExportResult> {
  const maxExcerptBytes = options.maxExcerptBytes ?? DEFAULT_MAX_EXCERPT_BYTES;
  const maxTotalExcerptBytes =
    options.maxTotalExcerptBytes ?? DEFAULT_MAX_TOTAL_EXCERPT_BYTES;

  let compiled: CompiledTour;
  try {
    const document = parseSothspell(input);
    compiled = await compileSothspell(
      document,
      options.sourceRoot ? { sourceRoot: options.sourceRoot } : {},
    );
  } catch (error) {
    throw new EmbedExportError(
      'invalid-tour',
      `the tour cannot be exported: ${errorMessage(error)}`,
    );
  }

  const embedTour: EmbedTour = { ...compiled, ...extractOverlay(input) };
  const { totalExcerptBytes } = validateTourContent(embedTour, {
    maxExcerptBytes,
    maxTotalExcerptBytes,
  });

  for (const asset of options.assets) {
    validateAssetPath(asset.path);
  }
  for (const required of ['player.js', 'player.css']) {
    if (!options.assets.some((asset) => asset.path === required)) {
      throw new EmbedExportError(
        'missing-asset',
        `the embed bundle needs ${required}; build @sothspell/embed first`,
      );
    }
  }

  const tourJson = `${JSON.stringify(embedTour, null, 2)}\n`;
  const iframePage = renderIframePage(compiled.title);

  const anchors: EmbedManifestAnchor[] = [];
  for (const chapter of compiled.chapters) {
    for (const beat of chapter.beats) {
      for (const anchor of beat.anchors) {
        anchors.push({
          id: anchor.id,
          path: anchor.path,
          contentHash: anchor.contentHash,
          bytes: byteLength(anchor.excerpt),
        });
      }
    }
  }

  // Pass one: hash everything the README lists, render the README, then add it
  // to the manifest. The manifest and README cannot hash themselves; the
  // README says so.
  const baseFiles: EmbedManifestFile[] = [
    ...options.assets.map((asset) => fileEntry(asset.path, asset.contents)),
    fileEntry('embed.html', iframePage),
    fileEntry('tour.json', tourJson),
  ];

  const manifestBase = createManifest(compiled, {
    embedApiVersion: options.embedApiVersion,
    generatedAt: options.generatedAt,
    files: baseFiles,
    anchors,
    totalExcerptBytes,
    maxExcerptBytes,
    maxTotalExcerptBytes,
    channel: EMBED_CHANNEL,
  });

  const readme = renderExportReadme(compiled, manifestBase, options.generatedAt);
  const files = [...baseFiles, fileEntry('README.md', readme)];
  const manifest: EmbedManifest = { ...manifestBase, files };
  const manifestJson = serializeManifest(manifest);

  for (const asset of options.assets) {
    await writer.write(asset.path, asset.contents);
  }
  await writer.write('embed.html', iframePage);
  await writer.write('tour.json', tourJson);
  await writer.write('README.md', readme);
  await writer.write('export-manifest.json', manifestJson);

  return { manifest, files };
}
