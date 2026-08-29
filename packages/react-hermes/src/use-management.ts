import { useResource, type UseResource } from "./use-resource.ts";

function makeHook<C, T>(
  key: string,
  fetcher: (client: C) => Promise<T>,
): (options: { client: C }) => UseResource<T> {
  return function useManagedResource(options: { client: C }): UseResource<T> {
    return useResource(() => fetcher(options.client), [key, options.client]);
  };
}

export interface CliResultLike {
  ok: boolean;
  raw: string;
}

export const useProfiles = makeHook(
  "profiles",
  (client: { profiles: { list(): Promise<unknown[]> } }) =>
    client.profiles.list(),
);

export const useAgentStatus = makeHook(
  "agent-status",
  (client: { agent: { status(): Promise<CliResultLike> } }) =>
    client.agent.status(),
);

export const useConfig = makeHook(
  "config",
  (client: { config: { show(): Promise<CliResultLike> } }) =>
    client.config.show(),
);

export const useMemory = makeHook(
  "memory",
  (client: { memory: { get(): Promise<{ content: string }> } }) =>
    client.memory.get(),
);

export const useSoul = makeHook(
  "soul",
  (client: { soul: { get(): Promise<{ content: string }> } }) =>
    client.soul.get(),
);

export const useSkills = makeHook(
  "skills",
  (client: { skills: { list(): Promise<unknown> } }) => client.skills.list(),
);

export const useBundles = makeHook(
  "bundles",
  (client: { bundles: { list(): Promise<unknown[]> } }) =>
    client.bundles.list(),
);

export const useCheckpoints = makeHook(
  "checkpoints",
  (client: { checkpoints: { list(): Promise<CliResultLike> } }) =>
    client.checkpoints.list(),
);

export const useHooksInfo = makeHook(
  "hooks",
  (client: { hooks: { list(): Promise<CliResultLike> } }) =>
    client.hooks.list(),
);

export const useGateway = makeHook(
  "gateway",
  (client: { gateway: { status(): Promise<CliResultLike> } }) =>
    client.gateway.status(),
);

export const useKanban = makeHook(
  "kanban",
  (client: { kanban: { tasks(): Promise<CliResultLike> } }) =>
    client.kanban.tasks(),
);

export const useProjects = makeHook(
  "projects",
  (client: { projects: { list(): Promise<CliResultLike> } }) =>
    client.projects.list(),
);

export const useToolsets = makeHook(
  "toolsets",
  (client: { toolsets: { list(): Promise<unknown> } }) =>
    client.toolsets.list(),
);

export const useMcp = makeHook(
  "mcp",
  (client: { mcp: { list(): Promise<CliResultLike> } }) => client.mcp.list(),
);

export const usePlugins = makeHook(
  "plugins",
  (client: { plugins: { list(): Promise<CliResultLike> } }) =>
    client.plugins.list(),
);

export const useAgentSessions = makeHook(
  "agent-sessions",
  (client: { agentSessions: { list(): Promise<unknown> } }) =>
    client.agentSessions.list(),
);

export const useCommands = makeHook(
  "commands",
  (client: { commands: { list(): Promise<unknown> } }) =>
    client.commands.list(),
);

export const useJobsAdmin = makeHook(
  "jobs",
  (client: { jobs: { list(): Promise<unknown> } }) => client.jobs.list(),
);
