export { HermesProvider, useHermesClient } from "./context.ts";
export type { HermesProviderProps } from "./context.ts";
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
