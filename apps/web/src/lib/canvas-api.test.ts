import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CanvasRelationRequestError,
  CanvasRelationUnavailableError,
  fetchCanvasSymbol,
} from './canvas-api.js';

function response(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('canvas relation client', () => {
  it('asks the definition endpoint with the symbol as a query value', async () => {
    const fetchMock = vi.fn(async () =>
      response(200, { available: true, direction: 'definition', relations: [] }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await fetchCanvasSymbol({
      tourId: 'tour/with:chars',
      symbolId: 'symbol:apps/api/src/main.ts#bootstrap',
      direction: 'definition',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = String((fetchMock.mock.calls[0] as unknown[])[0]);
    expect(url).toBe(
      '/api/tours/tour%2Fwith%3Achars/canvas/symbol?symbolId=symbol%3Aapps%2Fapi%2Fsrc%2Fmain.ts%23bootstrap',
    );
  });

  it('adds direction, limit, and offset to a relation request', async () => {
    const fetchMock = vi.fn(async () =>
      response(200, { available: true, direction: 'incoming', relations: [] }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await fetchCanvasSymbol({
      tourId: 'tour_bunbun_golden',
      symbolId: 'symbol:src/a.ts#a',
      direction: 'incoming',
      limit: 8,
      offset: 16,
    });

    const url = String((fetchMock.mock.calls[0] as unknown[])[0]);
    expect(url).toBe(
      '/api/tours/tour_bunbun_golden/canvas/relations?symbolId=symbol%3Asrc%2Fa.ts%23a&direction=incoming&limit=8&offset=16',
    );
  });

  it('maps 409 to a typed unavailable error with the server reason', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        response(409, {
          error: 'relations need a project source root',
          code: 'relations_unavailable',
        }),
      ),
    );

    const error = await fetchCanvasSymbol({
      tourId: 'tour_bunbun_golden',
      symbolId: 'symbol:src/a.ts#a',
      direction: 'outgoing',
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(CanvasRelationUnavailableError);
    expect(error).toMatchObject({
      status: 409,
      reason: 'relations need a project source root',
      code: 'relations_unavailable',
    });
  });

  it('maps 404 to the same typed unavailable error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => response(404, { error: 'unknown symbol' })),
    );

    const error = await fetchCanvasSymbol({
      tourId: 'tour_bunbun_golden',
      symbolId: 'symbol:missing',
      direction: 'definition',
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(CanvasRelationUnavailableError);
    expect(error).toMatchObject({ status: 404, reason: 'unknown symbol' });
  });

  it('keeps other failures as request errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => response(500, { error: 'boom' })),
    );

    const error = await fetchCanvasSymbol({
      tourId: 'tour_bunbun_golden',
      symbolId: 'symbol:src/a.ts#a',
      direction: 'incoming',
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(CanvasRelationRequestError);
    expect(error).toMatchObject({ status: 500, message: 'boom' });
  });
});
