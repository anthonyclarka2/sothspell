import { hashText, type CompiledTour } from '@sothspell/core';
import { byteLength } from './validate.js';

export interface EmbedManifestFile {
  path: string;
  bytes: number;
  sha256: string;
}

export interface EmbedManifestAnchor {
  id: string;
  path: string;
  contentHash: string;
  bytes: number;
}

export interface EmbedManifest {
  manifestVersion: 1;
  embedApiVersion: string;
  schemaVersion: string;
  generatedAt: string;
  tour: {
    id: string;
    title: string;
    projectSlug: string;
    projectName: string;
    revision: {
      commit: string;
      branch: string | null;
      dirty: boolean;
    };
  };
  /** Every shipped file except the manifest itself, which cannot self-hash. */
  files: EmbedManifestFile[];
  excerpts: {
    count: number;
    totalBytes: number;
    perAnchorCeilingBytes: number;
    totalCeilingBytes: number;
    anchors: EmbedManifestAnchor[];
  };
  privacy: {
    network: 'none';
    progress: 'local-storage-with-opt-out';
    narration: 'browser-speech';
  };
  embed: {
    customElement: string;
    iframePage: string;
    channel: string;
  };
}

export function fileEntry(path: string, contents: string): EmbedManifestFile {
  return { path, bytes: byteLength(contents), sha256: hashText(contents) };
}

export interface ManifestOptions {
  embedApiVersion: string;
  generatedAt: string;
  files: EmbedManifestFile[];
  anchors: EmbedManifestAnchor[];
  totalExcerptBytes: number;
  maxExcerptBytes: number;
  maxTotalExcerptBytes: number;
  channel: string;
}

export function createManifest(
  tour: CompiledTour,
  options: ManifestOptions,
): EmbedManifest {
  return {
    manifestVersion: 1,
    embedApiVersion: options.embedApiVersion,
    schemaVersion: tour.schemaVersion,
    generatedAt: options.generatedAt,
    tour: {
      id: tour.id,
      title: tour.title,
      projectSlug: tour.project.slug,
      projectName: tour.project.name,
      revision: {
        commit: tour.project.revision.commit,
        branch: tour.project.revision.branch,
        dirty: tour.project.revision.dirty,
      },
    },
    files: options.files,
    excerpts: {
      count: options.anchors.length,
      totalBytes: options.totalExcerptBytes,
      perAnchorCeilingBytes: options.maxExcerptBytes,
      totalCeilingBytes: options.maxTotalExcerptBytes,
      anchors: options.anchors,
    },
    privacy: {
      network: 'none',
      progress: 'local-storage-with-opt-out',
      narration: 'browser-speech',
    },
    embed: {
      customElement: 'sothspell-tour',
      iframePage: 'embed.html',
      channel: options.channel,
    },
  };
}

export function serializeManifest(manifest: EmbedManifest): string {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}
