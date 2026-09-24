import type { AgentBackend } from "../agent.ts";
import type { ChatSessionMeta, ChatStore } from "../store/index.ts";
import type { Principal } from "../../auth/index.ts";
import { isEndUserScope } from "../../scopes/index.ts";

export interface ChatOptions {
  store: ChatStore;
  agent: AgentBackend;
  /** In-flight turn abort controllers, keyed by session id. */
  turns?: Map<string, AbortController>;
  /** Quiet interval before a keepalive comment on turn streams (default 15 s). */
  keepAliveMs?: number;
}

/** Hono environment shared by every authenticated route. */
export type ChatEnv = {
  Bindings: { clientIp?: string };
  Variables: { principal: Principal; profile: string | null };
};

/**
 * Session ownership. Users own theirs; API keys own the sessions they
 * created and need the matching `-all` scope for anyone else's; anonymous
 * principals reach only sessions that no user or key owns.
 */
export function canAccess(
  session: ChatSessionMeta,
  principal: Principal,
  mode: "read" | "write",
): boolean {
  if (principal.type === "api_key") {
    const all = mode === "read" ? "sessions:read-all" : "sessions:write-all";
    return (
      session.keyId === principal.record.id ||
      principal.record.scopes.includes(all)
    );
  }
  if (principal.type === "user") {
    return session.userId === principal.userId;
  }
  return session.userId === null && session.keyId === null;
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
      : isEndUserScope(scope) &&
        (principal.type !== "user" ||
          principal.scopes === undefined ||
          principal.scopes.includes(scope));
  if (!allowed) {
    return error(403, "missing_scope", `This route requires the ${scope} scope`);
  }
  return null;
}
