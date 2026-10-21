import { mkdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { saveSnapshot, snapshotPathFor, type ProjectSnapshot } from '@sothspell/analyzer';
import type { SothspellDocument } from '@sothspell/core';
import type { AuthoringQuality } from './schemas.js';

/** Where a project's source came from; the root stays local either way. */
export type ProjectSourceKind = 'local' | 'imported';

/**
 * The local record that lets the viewer resolve a project's source root for
 * relations and code pages. It is deliberately separate from the snapshot and
 * the tour: an absolute path must never enter a shareable artifact.
 */
export interface ProjectRecord {
  slug: string;
  name: string;
  sourceRoot: string;
  sourceKind: ProjectSourceKind;
  revision: ProjectSnapshot['revision'];
  updatedAt: string;
}

export interface SavedAnalysisArtifacts {
  snapshotPath: string;
  projectPath: string;
}

export interface SavedTourArtifacts extends SavedAnalysisArtifacts {
  tourPath: string;
  qualityPath: string;
}

export interface SaveAnalysisArtifactsInput {
  /** SOTHSPELL_HOME. */
  home: string;
  snapshot: ProjectSnapshot;
  sourceRoot: string;
  sourceKind: ProjectSourceKind;
}

export interface SaveTourArtifactsInput extends SaveAnalysisArtifactsInput {
  document: SothspellDocument;
  quality: AuthoringQuality;
  /**
   * A tour file (`*.json`) or a directory. A directory receives `tour.json`
   * and `quality.json`; a file receives the tour plus a `-quality.json` sibling.
   * Defaults to the tour's slug-level directory under SOTHSPELL_HOME.
   */
  destination?: string;
}

/**
 * Replaces one JSON file in a single rename. A crash leaves the previous file
 * intact instead of a half-written tour or project record.
 */
async function writeJsonAtomic(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await rename(temporaryPath, filePath);
}

function defaultTourDirectory(home: string, document: SothspellDocument): string {
  return path.join(home, 'projects', document.project.slug, 'tours', document.id);
}

function tourPaths(destination: string): { tourPath: string; qualityPath: string } {
  if (destination.endsWith('.json')) {
    return {
      tourPath: destination,
      qualityPath: destination.replace(/\.json$/u, '-quality.json'),
    };
  }
  return {
    tourPath: path.join(destination, 'tour.json'),
    qualityPath: path.join(destination, 'quality.json'),
  };
}

/**
 * Writes the snapshot and the local project record that points at its source
 * root. `analyze --save` uses this path so analysis alone leaves the viewer
 * enough information to open a code page later.
 */
export async function saveAnalysisArtifacts(
  input: SaveAnalysisArtifactsInput,
): Promise<SavedAnalysisArtifacts> {
  const { home, snapshot, sourceRoot, sourceKind } = input;
  const snapshotPath = snapshotPathFor(home, snapshot.project.slug);
  const projectPath = path.join(home, 'projects', snapshot.project.slug, 'project.json');

  await saveSnapshot(snapshot, snapshotPath);
  const record: ProjectRecord = {
    slug: snapshot.project.slug,
    name: snapshot.project.name,
    sourceRoot,
    sourceKind,
    revision: snapshot.revision,
    updatedAt: new Date().toISOString(),
  };
  await writeJsonAtomic(projectPath, record);

  return { snapshotPath, projectPath };
}

/**
 * The one save operation behind the API, CLI, harness, and `author`. It writes
 * the analysis artifacts and the tour together so an authored tour is never the
 * one case without a project record.
 */
export async function saveTourArtifacts(
  input: SaveTourArtifactsInput,
): Promise<SavedTourArtifacts> {
  const destination =
    input.destination ?? defaultTourDirectory(input.home, input.document);
  const { tourPath, qualityPath } = tourPaths(destination);

  const analysis = await saveAnalysisArtifacts(input);
  await writeJsonAtomic(tourPath, input.document);
  await writeJsonAtomic(qualityPath, input.quality);

  return { ...analysis, tourPath, qualityPath };
}
