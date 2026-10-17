/**
 * The `/import` page's API client. The shapes mirror `@sothspell/import`
 * without taking the dependency, the same way `api.ts` mirrors core types.
 */

export interface ImportRecord {
  id: string;
  owner: string;
  repo: string;
  sourceUrl: string;
  ref: string | null;
  commit: string;
  shortCommit: string;
  directory: string;
  sizeBytes: number;
  fileCount: number;
  importedAt: string;
}

/** The visible lifecycle of one import request, in order. */
export type ImportPhase =
  'idle' | 'queued' | 'cloning' | 'analyzing' | 'ready' | 'failed';

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `request failed with ${response.status}`);
  }
  return (await response.json()) as T;
}

export async function fetchImports(): Promise<ImportRecord[]> {
  const response = await fetch('/api/imports');
  const body = await readJson<{ imports: ImportRecord[] }>(response);
  return body.imports;
}

export async function startImport(input: {
  url: string;
  ref?: string | null;
}): Promise<ImportRecord> {
  const response = await fetch('/api/imports', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(
      input.ref ? { url: input.url, ref: input.ref } : { url: input.url },
    ),
  });
  const body = await readJson<{ import: ImportRecord }>(response);
  return body.import;
}

export async function refreshImport(id: string): Promise<ImportRecord> {
  const response = await fetch(`/api/imports/${encodeURIComponent(id)}/refresh`, {
    method: 'POST',
  });
  const body = await readJson<{ import: ImportRecord }>(response);
  return body.import;
}

export async function removeImport(id: string): Promise<void> {
  const response = await fetch(`/api/imports/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  await readJson<{ ok: boolean }>(response);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)} ${units[unit]}`;
}
