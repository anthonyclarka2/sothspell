/**
 * The browser-side client for the authoring flow. It talks to `/api/authoring`
 * and `/api/projects/inspect`; the server owns paths, imports, and model keys.
 */

export type AuthoringModelChoice = 'fixture' | 'profile';

export type AuthoringSource =
  | { kind: 'local'; path: string }
  | { kind: 'import'; importId: string }
  | { kind: 'github'; url: string; ref?: string | null };

export interface ProjectInspection {
  path: string;
  name: string;
  slug: string;
  revision: {
    commit: string;
    branch: string;
    dirty: boolean;
  };
  languages: Array<{ id: string; files: number; bytes: number; primary: boolean }>;
  fileCount: number;
  docCount: number;
  symbolCount: number;
}

export type AuthoringStepId =
  'import' | 'analyze' | 'plan' | 'chapters' | 'validate' | 'save';

export interface AuthoringStep {
  id: AuthoringStepId;
  status: 'pending' | 'active' | 'done' | 'failed';
  detail?: string;
}

export interface AuthoringJobResult {
  tourId: string;
  title: string;
  firstBeatId: string;
  playerPath: string;
  tourPath: string;
  chapters: number;
  beats: number;
  anchors: number;
  estimatedDurationMs: number;
  droppedChapters: number;
  modelId: string;
  profileName: string | null;
}

export interface AuthoringJob {
  id: string;
  status: 'queued' | 'running' | 'done' | 'failed' | 'cancelled';
  source: { kind: AuthoringSource['kind']; label: string };
  steps: AuthoringStep[];
  detail: string | null;
  result: AuthoringJobResult | null;
  error: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface AuthoringRequest {
  source: AuthoringSource;
  model: AuthoringModelChoice;
  audience?: 'new-contributor' | 'technical-evaluator' | 'maintainer';
  maxMinutes?: number;
}

export class AuthoringApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'AuthoringApiError';
    this.status = status;
  }
}

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new AuthoringApiError(
      body?.error ?? `the request failed with ${response.status}`,
      response.status,
    );
  }
  return (await response.json()) as T;
}

export async function inspectProject(path: string): Promise<ProjectInspection> {
  const response = await fetch('/api/projects/inspect', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ path }),
  });
  const body = await readJson<{ project: ProjectInspection }>(response);
  return body.project;
}

export async function startAuthoring(input: AuthoringRequest): Promise<AuthoringJob> {
  const response = await fetch('/api/authoring', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  const body = await readJson<{ job: AuthoringJob }>(response);
  return body.job;
}

export async function fetchAuthoringJob(jobId: string): Promise<AuthoringJob> {
  const response = await fetch(`/api/authoring/${encodeURIComponent(jobId)}`);
  const body = await readJson<{ job: AuthoringJob }>(response);
  return body.job;
}

export async function cancelAuthoring(jobId: string): Promise<void> {
  const response = await fetch(`/api/authoring/${encodeURIComponent(jobId)}/cancel`, {
    method: 'POST',
  });
  await readJson<{ cancelled: boolean }>(response);
}
