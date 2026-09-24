import { useCallback, useEffect, useState } from "react";
import { clientKey, useLatest } from "./client-ref.ts";

export interface AgentInfoClientLike {
  discovery: {
    health(): Promise<unknown>;
    capabilities(): Promise<unknown>;
    models(): Promise<unknown>;
  };
}

export interface UseAgentInfoOptions {
  client: AgentInfoClientLike;
}

export interface UseAgentInfo {
  health: unknown;
  capabilities: unknown;
  models: unknown;
  loading: boolean;
  error: string | null;
  refresh(): Promise<void>;
}

export function useAgentInfo(options: UseAgentInfoOptions): UseAgentInfo {
  const clientRef = useLatest(options.client);
  const key = clientKey(options.client);
  const [health, setHealth] = useState<unknown>(null);
  const [capabilities, setCapabilities] = useState<unknown>(null);
  const [models, setModels] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [healthResult, capabilitiesResult, modelsResult] = await Promise.all([
        clientRef.current.discovery.health(),
        clientRef.current.discovery.capabilities(),
        clientRef.current.discovery.models(),
      ]);
      setHealth(healthResult);
      setCapabilities(capabilitiesResult);
      setModels(modelsResult);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { health, capabilities, models, loading, error, refresh };
}
