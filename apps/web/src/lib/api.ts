import type { CompiledTour } from '@sothspell/core';

export const GOLDEN_TOUR_ID = 'tour_bunbun_golden';
export const GOLDEN_PROJECT_ID = 'bunbun';

export interface AnchorResponse {
  projectId: string;
  tourId: string;
  path: string;
  symbol: string | null;
  label: string | null;
  startLine: number;
  endLine: number;
  language: string;
  contentHash: string;
  excerpt: string;
  html: string;
  beatId: string;
  chapterId: string;
}

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `request failed with ${response.status}`);
  }
  return (await response.json()) as T;
}

export async function fetchTour(tourId: string): Promise<CompiledTour> {
  const response = await fetch(`/api/tours/${encodeURIComponent(tourId)}`);
  return readJson<CompiledTour>(response);
}

export async function fetchAnchor(
  projectId: string,
  filePath: string,
  anchorId: string,
): Promise<AnchorResponse> {
  const encodedPath = filePath
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  const response = await fetch(
    `/api/projects/${encodeURIComponent(projectId)}/source/${encodedPath}?anchor=${encodeURIComponent(anchorId)}`,
  );
  return readJson<AnchorResponse>(response);
}

export function formatDuration(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.round(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function firstBeatId(tour: CompiledTour): string {
  const beat = tour.chapters[0]?.beats[0];
  if (!beat) {
    throw new Error('the tour has no beats');
  }
  return beat.id;
}
