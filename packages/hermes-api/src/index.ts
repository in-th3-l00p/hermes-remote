export { createApp } from "./http/index.ts";
export type {
  App,
  AppOptions,
  AuditEntry,
} from "./http/index.ts";
export type { KeyVerifier, Principal } from "./auth/index.ts";
export { DEFAULT_LIMITS, ipInCidr } from "./limits/index.ts";
export type { Limits, RateLimitOptions } from "./limits/index.ts";
export {
  ClerkAuthProvider,
  JwtAuthProvider,
  SupabaseAuthProvider,
  createAuthProvider,
} from "./auth/index.ts";
export type {
  AuthProvider,
  AuthProviderConfig,
  ClerkProviderOptions,
  JwtProviderOptions,
  ModuleLoader,
  SupabaseProviderOptions,
  VerifiedUser,
} from "./auth/index.ts";
export {
  DemoUpstream,
  HermesUpstream,
  RunStore,
} from "./upstream/index.ts";
export type {
  HermesUpstreamOptions,
  RunRecord,
  Upstream,
  UpstreamDiscovery,
  UpstreamJobs,
  UpstreamRuns,
} from "./upstream/index.ts";
export {
  BridgeDenied,
  FakeCliBridge,
  FsBridge,
  HermesCliBridge,
} from "./bridge/index.ts";
export type { CliBridge, CliResultData, SpawnLike } from "./bridge/index.ts";
export { ProfileRegistry, profileArgs } from "./profiles/index.ts";
export type { ProfileInfo } from "./profiles/index.ts";
export type { ManagementOptions } from "./mgmt/shared.ts";
export { startServer } from "./http/index.ts";
export type { RunningServer, StartServerOptions } from "./http/index.ts";
export { ChatStore } from "./chat/index.ts";
export type {
  Attachment,
  ChatMessage,
  ChatSession,
  ChatSessionMeta,
} from "./chat/index.ts";
export { DemoAgent, HermesAgent, HermesUpstreamError } from "./chat/index.ts";
export type {
  AgentBackend,
  AgentTurnMessage,
  HermesAgentOptions,
} from "./chat/index.ts";
export { KeyStore } from "./auth/index.ts";
export type { ApiKeyRecord, CreateKeyInput } from "./auth/index.ts";
export {
  AUTH_SCOPES,
  TIER1_SCOPES,
  TIER2_SCOPES,
  TIER3_SCOPES,
  isDangerousScope,
  isKnownScope,
  isUserGrantableScope,
} from "./scopes/index.ts";
export type { Scope } from "./scopes/index.ts";
