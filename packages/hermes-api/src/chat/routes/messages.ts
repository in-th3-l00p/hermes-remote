import type { Hono } from "hono";
import type { ChatMessage } from "../store/index.ts";
import type { Limits } from "../../limits/index.ts";
import { canAccess, error, json, requireScope, type ChatEnv, type ChatOptions } from "./shared.ts";
import { pageParams, parseAttachments, type SendBody } from "./validate.ts";
import { streamTurn } from "./sse.ts";

export function registerMessageRoutes(
  app: Hono<ChatEnv>,
  options: ChatOptions,
  limits: Limits,
): void {
  const { store } = options;

  app.get("/v1/sessions/:id{[0-9a-f]+}/messages", (c) => {
    const principal = c.get("principal");
    const denied = requireScope(principal, "sessions:read");
    if (denied !== null) {
      return denied;
    }
    const session = store.getSession(c.req.param("id"));
    if (session === null || !canAccess(session, principal)) {
      return error(404, "session_not_found", "Unknown session");
    }
    const { limit, offset } = pageParams(new URL(c.req.url), 200);
    return json(200, {
      messages: session.messages.slice(offset, offset + limit),
      total: session.messages.length,
    });
  });

  app.post("/v1/sessions/:id{[0-9a-f]+}/messages", async (c) => {
    const principal = c.get("principal");
    const denied = requireScope(principal, "chat:invoke");
    if (denied !== null) {
      return denied;
    }
    const sessionId = c.req.param("id");
    const session = store.getSession(sessionId);
    if (session === null || !canAccess(session, principal)) {
      return error(404, "session_not_found", "Unknown session");
    }
    const body = (await c.req.json().catch(() => null)) as SendBody | null;
    const attachments = parseAttachments(body?.attachments, limits);
    if (
      body === null ||
      typeof body.content !== "string" ||
      body.content.length > limits.maxMessageChars ||
      attachments === null ||
      (body.content.trim() === "" && attachments.length === 0)
    ) {
      return error(400, "invalid_message", "content (string) is required");
    }
    const userMessage = store.addMessage(sessionId, {
      role: "user",
      content: body.content,
      attachments,
    }) as ChatMessage;
    return streamTurn(options, sessionId, userMessage, principal);
  });

  app.patch("/v1/sessions/:id{[0-9a-f]+}/messages/:mid{[0-9a-f]+}", async (c) => {
    const principal = c.get("principal");
    const denied = requireScope(principal, "chat:invoke");
    if (denied !== null) {
      return denied;
    }
    const sessionId = c.req.param("id");
    const session = store.getSession(sessionId);
    if (session === null || !canAccess(session, principal)) {
      return error(404, "session_not_found", "Unknown session");
    }
    const body = (await c.req.json().catch(() => null)) as SendBody | null;
    if (
      body === null ||
      typeof body.content !== "string" ||
      body.content.trim() === "" ||
      body.content.length > limits.maxMessageChars
    ) {
      return error(400, "invalid_message", "content (string) is required");
    }
    const edited = store.editMessage(sessionId, c.req.param("mid"), body.content);
    if (edited === null) {
      return error(404, "message_not_found", "Unknown editable user message");
    }
    return streamTurn(options, sessionId, edited, principal);
  });

  app.post(
    "/v1/sessions/:id{[0-9a-f]+}/messages/:mid{[0-9a-f]+}/reactions",
    async (c) => {
      const principal = c.get("principal");
      const denied = requireScope(principal, "sessions:write");
      if (denied !== null) {
        return denied;
      }
      const sessionId = c.req.param("id");
      const session = store.getSession(sessionId);
      if (session === null || !canAccess(session, principal)) {
        return error(404, "session_not_found", "Unknown session");
      }
      const body = (await c.req.json().catch(() => null)) as {
        emoji?: unknown;
      } | null;
      if (body === null || typeof body.emoji !== "string" || body.emoji === "") {
        return error(400, "invalid_reaction", "emoji (string) is required");
      }
      const message = store.toggleReaction(sessionId, c.req.param("mid"), body.emoji);
      if (message === null) {
        return error(404, "message_not_found", "Unknown message");
      }
      return json(200, message);
    },
  );
}
