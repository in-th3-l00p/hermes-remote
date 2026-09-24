import { useEffect, useState } from "react";
import { clientKey, useLatest } from "./client-ref.ts";
import type { SseEvent } from "@intheloop-studio/hermes-remote-client";

export interface EventsClientLike {
  events: {
    subscribe(signal?: AbortSignal): AsyncIterable<SseEvent>;
  };
}

export interface UseEvents {
  events: SseEvent[];
  connected: boolean;
  error: string | null;
}

export function useEvents(options: { client: EventsClientLike; enabled?: boolean }): UseEvents {
  const { enabled = true } = options;
  const clientRef = useLatest(options.client);
  const key = clientKey(options.client);
  const [events, setEvents] = useState<SseEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setEvents([]);
    setError(null);
    if (!enabled) {
      setConnected(false);
      return;
    }
    const controller = new AbortController();
    setConnected(true);
    void (async () => {
      try {
        for await (const event of clientRef.current.events.subscribe(controller.signal)) {
          setEvents((prev) => [...prev, event]);
        }
      } catch (cause) {
        if (!controller.signal.aborted) {
          setError(cause instanceof Error ? cause.message : String(cause));
        }
      } finally {
        setConnected(false);
      }
    })();
    return () => {
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled]);

  return { events, connected, error };
}
