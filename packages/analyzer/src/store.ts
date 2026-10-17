import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { ProjectSnapshot } from './types.js';

export function snapshotPathFor(homeDirectory: string, slug: string): string {
  return path.join(homeDirectory, 'projects', slug, 'snapshot.json');
}

/** Writes a snapshot atomically; a partial file must never look like a snapshot. */
export async function saveSnapshot(
  snapshot: ProjectSnapshot,
  outputPath: string,
): Promise<string> {
  await mkdir(path.dirname(outputPath), { recursive: true });
  const temporaryPath = `${outputPath}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
  await rename(temporaryPath, outputPath);
  return outputPath;
}

export async function loadSnapshot(outputPath: string): Promise<ProjectSnapshot> {
  const parsed = JSON.parse(await readFile(outputPath, 'utf8')) as unknown;
  if (parsed === null || typeof parsed !== 'object') {
    throw new Error(`not a snapshot: ${outputPath}`);
  }
  const snapshot = parsed as Partial<ProjectSnapshot>;
  if (
    typeof snapshot.id !== 'string' ||
    !snapshot.project ||
    typeof snapshot.project.slug !== 'string' ||
    !Array.isArray(snapshot.files)
  ) {
    throw new Error(`not a snapshot: ${outputPath}`);
  }
  return snapshot as ProjectSnapshot;
}
