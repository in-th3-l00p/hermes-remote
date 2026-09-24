import type { AgentBackend } from "../agent.ts";
import type { ChatSession, ChatStore } from "../store/index.ts";
import type { Principal } from "../../auth/index.ts";
import { isEndUserScope } from "../../scopes/index.ts";

export interface ChatOptions {
  store: ChatStore;
  agent: AgentBackend;
  /** In-flight turn abort controllers, keyed by session id. */
  turns?: Map<string, AbortController>;
}

/** Hono environment shared by every authenticated route. */
export type ChatEnv = {
  Bindings: { clientIp?: string };
  Variables: { principal: Principal; profile: string | null };
};

export function canAccess(session: ChatSession, principal: Principal): boolean {
  if (session.userId === null || principal.type === "api_key") {
    return true;
  }
  return principal.type === "user" && principal.userId === session.userId;
}

export function json(status: number, body: unknown): Response {
  return Response.json(body, { status });
}

export function error(status: number, code: string, message: string): Response {
  return json(status, { error: { code, message } });
}

/**
 * API keys must hold the route's scope; user and anonymous principals hold
 * exactly the end-user scopes (chat, own sessions, read-only discovery).
 */
export function requireScope(principal: Principal, scope: string): Response | null {
  const allowed =
    principal.type === "api_key"
      ? principal.record.scopes.includes(scope)
      : isEndUserScope(scope);
  if (!allowed) {
    return error(403, "missing_scope", `This route requires the ${scope} scope`);
  }
  return null;
}
