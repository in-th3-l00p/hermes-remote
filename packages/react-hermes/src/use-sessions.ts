import { useCallback, useEffect, useState } from "react";
import { clientKey, useLatest } from "./client-ref.ts";
import type { ChatSessionMeta } from "@intheloop-studio/hermes-remote-client";

export interface SessionsClientLike {
  listSessions(ids?: string[]): Promise<ChatSessionMeta[]>;
  deleteSession(sessionId: string): Promise<void>;
}

export interface UseSessionsOptions {
  client: SessionsClientLike;
  /** Session ids to look up for anonymous principals (e.g. from localStorage). */
  ids?: string[];
}

export interface UseSessions {
  sessions: ChatSessionMeta[];
  loading: boolean;
  error: string | null;
  refresh(): Promise<void>;
  remove(sessionId: string): Promise<void>;
}

export function useSessions(options: UseSessionsOptions): UseSessions {
  const { ids } = options;
  const clientRef = useLatest(options.client);
  const key = clientKey(options.client);
  const [sessions, setSessions] = useState<ChatSessionMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Key on the joined ids so callers can pass array literals without looping.
  const idsKey = ids === undefined ? null : ids.join(",");
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const lookup = idsKey === null ? undefined : idsKey.split(",").filter(Boolean);
      setSessions(await clientRef.current.listSessions(lookup));
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, idsKey]);

  const remove = useCallback(
    async (sessionId: string) => {
      await clientRef.current.deleteSession(sessionId);
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
    },
    [clientRef],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { sessions, loading, error, refresh, remove };
}
