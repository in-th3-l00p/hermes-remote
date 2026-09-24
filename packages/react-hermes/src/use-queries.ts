import { clientKey } from "./client-ref.ts";
import type { CliResultLike } from "./use-management.ts";
import { useResource, type UseResource } from "./use-resource.ts";

export interface SessionClientLike<M> {
  listMessages(sessionId: string): Promise<M[]>;
}

/** One session's message history; empty while `sessionId` is null. */
export function useSession<M>(options: {
  client: SessionClientLike<M>;
  sessionId: string | null;
}): UseResource<M[]> {
  const { client, sessionId } = options;
  return useResource(
    async () => (sessionId === null ? [] : client.listMessages(sessionId)),
    ["session", clientKey(client), sessionId],
  );
}

export interface InsightsClientLike {
  agent: { insights(options: { days?: number; source?: string }): Promise<CliResultLike> };
}

/** Token and cost analytics (`hermes insights`). */
export function useInsights(options: {
  client: InsightsClientLike;
  days?: number;
  source?: string;
}): UseResource<CliResultLike> {
  const { client, days, source } = options;
  return useResource(
    () =>
      client.agent.insights({
        ...(days === undefined ? {} : { days }),
        ...(source === undefined ? {} : { source }),
      }),
    ["insights", clientKey(client), days, source],
  );
}

export interface SkillHubClientLike {
  skills: { hubSearch(q: string, source?: string): Promise<CliResultLike> };
}

/** Skills-hub search; `data` stays null while the query is blank. */
export function useSkillHub(options: {
  client: SkillHubClientLike;
  query: string;
  source?: string;
}): UseResource<CliResultLike | null> {
  const { client, query, source } = options;
  const q = query.trim();
  return useResource(
    async () => (q === "" ? null : client.skills.hubSearch(q, source)),
    ["skill-hub", clientKey(client), q, source],
  );
}
