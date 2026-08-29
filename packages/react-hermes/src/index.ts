export { HermesProvider, useHermesClient } from "./context.ts";
export type { HermesProviderProps } from "./context.ts";
export { useAction, useResource } from "./use-resource.ts";
export type { UseAction, UseResource } from "./use-resource.ts";
export {
  useAgentSessions,
  useAgentStatus,
  useBundles,
  useCheckpoints,
  useCommands,
  useConfig,
  useGateway,
  useHooksInfo,
  useJobsAdmin,
  useKanban,
  useMcp,
  useMemory,
  usePlugins,
  useProfiles,
  useProjects,
  useSkills,
  useSoul,
  useToolsets,
} from "./use-management.ts";
export type { CliResultLike } from "./use-management.ts";
export { useGoal } from "./use-goal.ts";
export type { GoalClientLike, UseGoal } from "./use-goal.ts";
export { useEvents } from "./use-events.ts";
export type { EventsClientLike, UseEvents } from "./use-events.ts";
export { useAgentInfo } from "./use-agent-info.ts";
export type {
  AgentInfoClientLike,
  UseAgentInfo,
  UseAgentInfoOptions,
} from "./use-agent-info.ts";
export { useRunEvents, useRuns } from "./use-runs.ts";
export type {
  RunEventsClientLike,
  RunsClientLike,
  UseRunEvents,
  UseRunEventsOptions,
  UseRuns,
  UseRunsOptions,
} from "./use-runs.ts";
export { useChat } from "./use-chat.ts";
export { useSessions } from "./use-sessions.ts";
export type { SessionsClientLike, UseSessions, UseSessionsOptions } from "./use-sessions.ts";
export type { ChatClientLike, UseChat, UseChatOptions } from "./use-chat.ts";
export { HermesApiError, HermesClient } from "@in-th3-l00p/hermes-remote-client";
export type {
  Attachment,
  ChatEvent,
  ChatMessage,
  ChatSession,
} from "@in-th3-l00p/hermes-remote-client";
export type { HermesClientOptions, TokenProvider } from "@in-th3-l00p/hermes-remote-client";
