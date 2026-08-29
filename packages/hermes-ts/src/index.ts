export { narrowChatEvent } from "./chat-event.ts";
export {
  AgentSessionsResource,
  BrowserResource,
  CommandsResource,
  EventsResource,
  GoalsResource,
  MediaResource,
  PassthroughResource,
  WebToolsResource,
} from "./agent-features.ts";
export type {
  CommandInfo,
  CommandResult,
  GoalGate,
  GoalState,
  ToolRunResult,
} from "./agent-features.ts";
export {
  AgentOpsResource,
  ApprovalsResource,
  BackupsResource,
  BundlesResource,
  CheckpointsResource,
  ConfigResource,
  GatewayResource,
  HooksResource,
  KanbanResource,
  McpResource,
  MemoryResource,
  MessagingResource,
  PairingResource,
  PluginsResource,
  ProfilesResource,
  ProjectsResource,
  ProvidersResource,
  SkillsResource,
  SoulResource,
  SubagentsResource,
  ToolsetsResource,
  WebhooksResource,
} from "./management.ts";
export type {
  Bundle,
  CliResult,
  MemoryFile,
  ProfileInfo,
  SkillFile,
} from "./management.ts";
export { Conversation } from "./conversation.ts";
export type { ConversationSendOptions } from "./conversation.ts";
export { DiscoveryResource } from "./discovery.ts";
export type { RemoteCapabilities, RemoteHealth } from "./discovery.ts";
export { JobsResource } from "./jobs.ts";
export { RunsResource } from "./runs.ts";
export type { RunRef } from "./runs.ts";
export { HermesClient } from "./client.ts";
export type { SendMessageInput } from "./client.ts";
export { HermesApiError } from "./http.ts";
export type { HermesClientOptions, TokenProvider } from "./http.ts";
export { parseSse } from "./sse.ts";
export type { SseEvent } from "./sse.ts";
export type {
  Attachment,
  ChatEvent,
  ChatMessage,
  ChatSession,
  ChatSessionMeta,
} from "./types.ts";
