import type { CompiledTour } from '@sothspell/core';

export const GOLDEN_TOUR_ID = 'tour_bunbun_golden';
export const GOLDEN_PROJECT_ID = 'bunbun';

export interface AnchorLine {
  number: number;
  html: string;
  focus: boolean;
}

export interface AnchorOutlineEntry {
  anchorId: string;
  label: string;
  startLine: number;
  endLine: number;
  beatId: string;
  beatTitle: string;
}

export interface AskCitation {
  id: string;
  label: string;
  path: string;
  startLine: number;
  endLine: number;
}

export interface AskResponse {
  answer: {
    markdown: string;
    citations: string[];
    followUps: string[];
    suggestedBeatId?: string;
  };
  citations: AskCitation[];
  warnings: string[];
  modelId: string;
}

export interface AnchorResponse {
  projectId: string;
  tourId: string;
  anchorId: string;
  path: string;
  symbol: string | null;
  label: string | null;
  startLine: number;
  endLine: number;
  language: string;
  contentHash: string;
  liveContentHash: string;
  stale: boolean;
  totalLines: number;
  excerpt: string;
  html: string;
  lines: AnchorLine[];
  beatId: string;
  beatTitle: string;
  chapterId: string;
  chapterTitle: string;
  outline: AnchorOutlineEntry[];
}

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `request failed with ${response.status}`);
  }
  return (await response.json()) as T;
}

export async function fetchTour(tourId: string, locale?: string): Promise<CompiledTour> {
  const query = locale === undefined ? '' : `?locale=${encodeURIComponent(locale)}`;
  const response = await fetch(`/api/tours/${encodeURIComponent(tourId)}${query}`);
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

export async function askQuestion(input: {
  tourId: string;
  beatId: string;
  question: string;
  history: Array<{ question: string; answer: string }>;
}): Promise<AskResponse> {
  const response = await fetch(`/api/tours/${encodeURIComponent(input.tourId)}/ask`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      beatId: input.beatId,
      question: input.question,
      history: input.history.slice(-3),
    }),
  });
  return readJson<AskResponse>(response);
}
