import type { Context, Hono } from "hono";
import { requireScope, type ChatEnv } from "../../chat/routes/shared.ts";
import { requireKeyScope } from "../../mgmt/shared.ts";
import { proxy, upstreamFailure, type UpstreamRouteOptions } from "./shared.ts";

const ID = ":id{[A-Za-z0-9_-]+}";

function readGuard(c: Context<ChatEnv>): Response | null {
  return requireKeyScope(c.get("principal"), "sessions:read-all");
}

function writeGuard(c: Context<ChatEnv>): Response | null {
  return requireKeyScope(c.get("principal"), "sessions:write-all");
}

function chatGuard(c: Context<ChatEnv>): Response | null {
  return (
    writeGuard(c) ?? requireScope(c.get("principal"), "chat:invoke")
  );
}

export function registerAgentSessionRoutes(
  app: Hono<ChatEnv>,
  options: UpstreamRouteOptions,
): void {
  const { sessions } = options.upstream;

  app.get("/v1/agent/sessions", (c) => {
    return readGuard(c) ?? proxy(() => sessions.list());
  });

  app.post("/v1/agent/sessions", async (c) => {
    const denied = writeGuard(c);
    if (denied !== null) {
      return denied;
    }
    const body = (await c.req.json().catch(() => ({}))) as unknown;
    return proxy(() => sessions.create(body));
  });

  app.get(`/v1/agent/sessions/${ID}`, (c) => {
    return readGuard(c) ?? proxy(() => sessions.get(c.req.param("id")));
  });

  app.patch(`/v1/agent/sessions/${ID}`, async (c) => {
    const denied = writeGuard(c);
    if (denied !== null) {
      return denied;
    }
    const body = (await c.req.json().catch(() => ({}))) as unknown;
    return proxy(() => sessions.update(c.req.param("id"), body));
  });

  app.delete(`/v1/agent/sessions/${ID}`, (c) => {
    return writeGuard(c) ?? proxy(() => sessions.remove(c.req.param("id")));
  });

  app.get(`/v1/agent/sessions/${ID}/messages`, (c) => {
    return readGuard(c) ?? proxy(() => sessions.messages(c.req.param("id")));
  });

  app.post(`/v1/agent/sessions/${ID}/fork`, async (c) => {
    const denied = writeGuard(c);
    if (denied !== null) {
      return denied;
    }
    const body = (await c.req.json().catch(() => ({}))) as unknown;
    return proxy(() => sessions.fork(c.req.param("id"), body));
  });

  app.post(`/v1/agent/sessions/${ID}/model`, async (c) => {
    const denied = writeGuard(c);
    if (denied !== null) {
      return denied;
    }
    const body = (await c.req.json().catch(() => ({}))) as unknown;
    return proxy(() => sessions.modelLock(c.req.param("id"), body));
  });

  app.post(`/v1/agent/sessions/${ID}/chat`, async (c) => {
    const denied = chatGuard(c);
    if (denied !== null) {
      return denied;
    }
    const body = (await c.req.json().catch(() => ({}))) as unknown;
    const response = await proxy(() => sessions.chat(c.req.param("id"), body));
    options.events?.publish("agent_session.turn", { id: c.req.param("id") });
    return response;
  });

  app.post(`/v1/agent/sessions/${ID}/chat/stream`, async (c) => {
    const denied = chatGuard(c);
    if (denied !== null) {
      return denied;
    }
    const body = (await c.req.json().catch(() => ({}))) as unknown;
    try {
      const stream = await sessions.chatStream(
        c.req.param("id"),
        body,
        c.req.raw.signal,
      );
      options.events?.publish("agent_session.turn", { id: c.req.param("id") });
      return new Response(stream, {
        headers: { "content-type": "text/event-stream" },
      });
    } catch (cause) {
      return upstreamFailure(cause);
    }
  });
}
