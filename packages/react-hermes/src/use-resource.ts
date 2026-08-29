import { useCallback, useEffect, useState } from "react";

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

  // The fetcher is intentionally keyed by deps, not identity.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setData(await fetcher());
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
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

export function useAction<A extends unknown[], R>(
  fn: (...args: A) => Promise<R>,
): UseAction<A, R> {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<R | null>(null);

  const run = useCallback(
    async (...args: A): Promise<R | null> => {
      setPending(true);
      try {
        const value = await fn(...args);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  return { run, pending, error, result };
}
