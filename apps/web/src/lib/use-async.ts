import { useEffect, useState } from 'react';

export interface AsyncState<T> {
  status: 'loading' | 'ready' | 'error';
  data: T | null;
  error: Error | null;
}

/**
 * A small fetch-state hook for the Phase 1 screens. TanStack Query is the
 * Phase 4 upgrade; keeping the player's data dependency this thin now avoids
 * making the first render a query-cache problem.
 */
export function useAsync<T>(
  load: () => Promise<T>,
  dependencies: unknown[],
): AsyncState<T> {
  const [state, setState] = useState<AsyncState<T>>({
    status: 'loading',
    data: null,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading', data: null, error: null });

    load()
      .then((data) => {
        if (!cancelled) {
          setState({ status: 'ready', data, error: null });
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState({
            status: 'error',
            data: null,
            error: error instanceof Error ? error : new Error(String(error)),
          });
        }
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, dependencies);

  return state;
}
