import { useCallback, useEffect, useState } from "react";
import type { RunRef, SseEvent } from "@in-th3-l00p/hermes-remote-client";

export interface RunsClientLike {
  runs: {
    list(): Promise<RunRef[]>;
    create(body: Record<string, unknown>): Promise<unknown>;
  };
}

export interface UseRunsOptions {
  client: RunsClientLike;
}

export interface UseRuns {
  runs: RunRef[];
  loading: boolean;
  error: string | null;
  create(body: Record<string, unknown>): Promise<unknown>;
  refresh(): Promise<void>;
}

export function useRuns(options: UseRunsOptions): UseRuns {
  const { client } = options;
  const [runs, setRuns] = useState<RunRef[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setRuns(await client.runs.list());
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  }, [client]);

  const create = useCallback(
    async (body: Record<string, unknown>) => {
      const created = await client.runs.create(body);
      await refresh();
      return created;
    },
    [client, refresh],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { runs, loading, error, create, refresh };
}

export interface RunEventsClientLike {
  runs: {
    events(id: string, signal?: AbortSignal): AsyncIterable<SseEvent>;
  };
}

export interface UseRunEventsOptions {
  client: RunEventsClientLike;
  runId: string | null;
}

export interface UseRunEvents {
  events: SseEvent[];
  done: boolean;
  error: string | null;
}

export function useRunEvents(options: UseRunEventsOptions): UseRunEvents {
  const { client, runId } = options;
  const [events, setEvents] = useState<SseEvent[]>([]);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setEvents([]);
    setDone(false);
    setError(null);
    if (runId === null) {
      return;
    }
    const controller = new AbortController();
    void (async () => {
      try {
        for await (const event of client.runs.events(runId, controller.signal)) {
          setEvents((prev) => [...prev, event]);
        }
        setDone(true);
      } catch (cause) {
        if (!controller.signal.aborted) {
          setError(cause instanceof Error ? cause.message : String(cause));
        }
      }
    })();
    return () => {
      controller.abort();
    };
  }, [client, runId]);

  return { events, done, error };
}
