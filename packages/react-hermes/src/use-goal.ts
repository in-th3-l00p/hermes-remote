import { useCallback } from "react";
import type { GoalState } from "@intheloop-studio/hermes-remote-client";
import { useResource } from "./use-resource.ts";

export interface GoalClientLike {
  goals: {
    get(sessionId: string): Promise<GoalState>;
    set(
      sessionId: string,
      text: string,
      options?: { draft?: boolean },
    ): Promise<unknown>;
    clear(sessionId: string): Promise<unknown>;
    pause(sessionId: string): Promise<unknown>;
    resume(sessionId: string): Promise<unknown>;
    addGate(sessionId: string, command: string): Promise<unknown>;
    addSubgoal(sessionId: string, text: string): Promise<unknown>;
  };
}

export interface UseGoal {
  goal: GoalState | null;
  loading: boolean;
  error: string | null;
  refresh(): Promise<void>;
  set(text: string, options?: { draft?: boolean }): Promise<void>;
  clear(): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  addGate(command: string): Promise<void>;
  addSubgoal(text: string): Promise<void>;
}

export function useGoal(options: {
  client: GoalClientLike;
  sessionId: string | null;
}): UseGoal {
  const { client, sessionId } = options;
  const resource = useResource<GoalState | null>(
    () => (sessionId === null ? Promise.resolve(null) : client.goals.get(sessionId)),
    [client, sessionId],
  );

  const mutate = useCallback(
    async (action: (id: string) => Promise<unknown>) => {
      if (sessionId === null) {
        return;
      }
      await action(sessionId);
      await resource.refresh();
    },
    [sessionId, resource.refresh],
  );

  return {
    goal: resource.data,
    loading: resource.loading,
    error: resource.error,
    refresh: resource.refresh,
    set: (text, opts) => mutate((id) => client.goals.set(id, text, opts)),
    clear: () => mutate((id) => client.goals.clear(id)),
    pause: () => mutate((id) => client.goals.pause(id)),
    resume: () => mutate((id) => client.goals.resume(id)),
    addGate: (command) => mutate((id) => client.goals.addGate(id, command)),
    addSubgoal: (text) => mutate((id) => client.goals.addSubgoal(id, text)),
  };
}
