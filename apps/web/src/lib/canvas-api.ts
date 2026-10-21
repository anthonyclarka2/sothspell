import type { CanvasRelationDirection, CanvasRelationResponse } from '@sothspell/canvas';

/**
 * The browser's only relation door. It receives bounded, symbol-scoped
 * payloads from the API and never a project snapshot, so the canvas can expand
 * relations without learning a source root or reading a file.
 */

export interface FetchCanvasSymbolInput {
  tourId: string;
  symbolId: string;
  direction: CanvasRelationDirection;
  limit?: number;
  offset?: number;
}

interface ErrorBody {
  error?: string;
  code?: string;
}

/** A relation the tour cannot serve: unknown symbol, no root, or redaction. */
export class CanvasRelationUnavailableError extends Error {
  readonly status: number;
  readonly reason: string;
  readonly code: string | undefined;

  constructor(status: number, reason: string, code?: string) {
    super(reason);
    this.name = 'CanvasRelationUnavailableError';
    this.status = status;
    this.reason = reason;
    this.code = code;
  }
}

/** A transport or server failure the viewer can retry. */
export class CanvasRelationRequestError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'CanvasRelationRequestError';
    this.status = status;
  }
}

export async function fetchCanvasSymbol(
  input: FetchCanvasSymbolInput,
): Promise<CanvasRelationResponse> {
  const endpoint = input.direction === 'definition' ? 'symbol' : 'relations';
  const params = new URLSearchParams({ symbolId: input.symbolId });
  if (input.direction !== 'definition') {
    params.set('direction', input.direction);
    if (input.limit !== undefined) {
      params.set('limit', String(input.limit));
    }
    if (input.offset !== undefined) {
      params.set('offset', String(input.offset));
    }
  }

  const response = await fetch(
    `/api/tours/${encodeURIComponent(input.tourId)}/canvas/${endpoint}?${params.toString()}`,
  );
  if (response.ok) {
    return (await response.json()) as CanvasRelationResponse;
  }

  const body = (await response.json().catch(() => null)) as ErrorBody | null;
  const reason = body?.error ?? `request failed with ${response.status}`;
  if (response.status === 404 || response.status === 409) {
    throw new CanvasRelationUnavailableError(response.status, reason, body?.code);
  }
  throw new CanvasRelationRequestError(response.status, reason);
}
