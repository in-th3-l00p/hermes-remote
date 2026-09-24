import { useCallback, useEffect, useState } from "react";
import { useLatest } from "./client-ref.ts";

export interface UseResource<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refresh(): Promise<void>;
}

export function useResource<T>(
  fetcher: () => Promise<T>,
  deps: readonly unknown[],
): UseResource<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fetcherRef = useLatest(fetcher);

  // Keyed by deps, not fetcher identity; the ref supplies the newest fetcher.
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setData(await fetcherRef.current());
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
    // The caller's deps are the cache key; the rule cannot see through them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { data, loading, error, refresh };
}

export interface UseAction<A extends unknown[], R> {
  run(...args: A): Promise<R | null>;
  pending: boolean;
  error: string | null;
  result: R | null;
}

export function useAction<A extends unknown[], R>(fn: (...args: A) => Promise<R>): UseAction<A, R> {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<R | null>(null);
  const fnRef = useLatest(fn);

  // Stable across renders, but always calls the newest fn (no stale closure).
  const run = useCallback(
    async (...args: A): Promise<R | null> => {
      setPending(true);
      try {
        const value = await fnRef.current(...args);
        setResult(value);
        setError(null);
        return value;
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
        return null;
      } finally {
        setPending(false);
      }
    },
    [fnRef],
  );

  return { run, pending, error, result };
}
