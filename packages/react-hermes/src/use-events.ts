import { useEffect, useState } from "react";
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

export function useEvents(options: {
  client: EventsClientLike;
  enabled?: boolean;
}): UseEvents {
  const { client, enabled = true } = options;
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
        for await (const event of client.events.subscribe(controller.signal)) {
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
  }, [client, enabled]);

  return { events, connected, error };
}
