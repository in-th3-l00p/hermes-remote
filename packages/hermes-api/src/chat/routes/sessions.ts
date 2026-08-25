import type { Principal } from "../../auth/index.ts";
import { canAccess, error, json, requireScope, type ChatOptions } from "./shared.ts";
import { pageParams } from "./validate.ts";

/** Returns null when the request doesn't match a session route. */
export function handleSessionRoutes(
  request: Request,
  url: URL,
  options: ChatOptions,
  principal: Principal,
): Response | null {
  const { store } = options;
  const { method } = request;

  if (url.pathname === "/v1/sessions" && method === "POST") {
    const denied = requireScope(principal, "sessions:write");
    if (denied !== null) {
      return denied;
    }
    return json(
      201,
      store.createSession(principal.type === "user" ? principal.userId : null),
    );
  }

  if (url.pathname === "/v1/sessions" && method === "GET") {
    const denied = requireScope(principal, "sessions:read");
    if (denied !== null) {
      return denied;
    }
    const { limit, offset } = pageParams(url, 50);
    if (principal.type === "user") {
      return json(200, {
        sessions: store
          .listSessions({ userId: principal.userId })
          .slice(offset, offset + limit),
      });
    }
    const ids = (url.searchParams.get("ids") ?? "")
      .split(",")
      .filter((id) => /^[0-9a-f]+$/.test(id));
    const sessions = store
      .listSessions({ ids })
      .filter((s) => s.userId === null || principal.type === "api_key")
      .slice(offset, offset + limit);
    return json(200, { sessions });
  }

  const sessionMatch = /^\/v1\/sessions\/([0-9a-f]+)$/.exec(url.pathname);
  if (sessionMatch !== null && method === "DELETE") {
    const denied = requireScope(principal, "sessions:write");
    if (denied !== null) {
      return denied;
    }
    const session = store.getSession(sessionMatch[1] as string);
    if (session === null || !canAccess(session, principal)) {
      return error(404, "session_not_found", "Unknown session");
    }
    store.deleteSession(session.id);
    return json(200, { deleted: true });
  }

  const stopMatch = /^\/v1\/sessions\/([0-9a-f]+)\/stop$/.exec(url.pathname);
  if (stopMatch !== null && method === "POST") {
    const denied = requireScope(principal, "chat:invoke");
    if (denied !== null) {
      return denied;
    }
    const session = store.getSession(stopMatch[1] as string);
    if (session === null || !canAccess(session, principal)) {
      return error(404, "session_not_found", "Unknown session");
    }
    const controller = options.turns?.get(session.id);
    controller?.abort();
    return json(200, { stopped: controller !== undefined });
  }

  return null;
}
