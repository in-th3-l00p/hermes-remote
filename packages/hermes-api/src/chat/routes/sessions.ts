import type { Hono } from "hono";
import { canAccess, error, json, requireScope, type ChatEnv, type ChatOptions } from "./shared.ts";
import { pageParams } from "./validate.ts";

export function registerSessionRoutes(
  app: Hono<ChatEnv>,
  options: ChatOptions,
): void {
  const { store } = options;

  app.post("/v1/sessions", (c) => {
    const principal = c.get("principal");
    const denied = requireScope(principal, "sessions:write");
    if (denied !== null) {
      return denied;
    }
    return json(
      201,
      store.createSession(principal.type === "user" ? principal.userId : null),
    );
  });

  app.get("/v1/sessions", (c) => {
    const principal = c.get("principal");
    const denied = requireScope(principal, "sessions:read");
    if (denied !== null) {
      return denied;
    }
    const url = new URL(c.req.url);
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
  });

  app.delete("/v1/sessions/:id{[0-9a-f]+}", (c) => {
    const principal = c.get("principal");
    const denied = requireScope(principal, "sessions:write");
    if (denied !== null) {
      return denied;
    }
    const session = store.getSession(c.req.param("id"));
    if (session === null || !canAccess(session, principal)) {
      return error(404, "session_not_found", "Unknown session");
    }
    store.deleteSession(session.id);
    return json(200, { deleted: true });
  });

  app.post("/v1/sessions/:id{[0-9a-f]+}/stop", (c) => {
    const principal = c.get("principal");
    const denied = requireScope(principal, "chat:invoke");
    if (denied !== null) {
      return denied;
    }
    const session = store.getSession(c.req.param("id"));
    if (session === null || !canAccess(session, principal)) {
      return error(404, "session_not_found", "Unknown session");
    }
    const controller = options.turns?.get(session.id);
    controller?.abort();
    return json(200, { stopped: controller !== undefined });
  });
}
