import type { Hono } from "hono";
import type { ChatMessage } from "../store/index.ts";
import type { Limits } from "../../limits/index.ts";
import { canAccess, error, json, requireScope, type ChatEnv, type ChatOptions } from "./shared.ts";
import { pageParams, parseAttachments, type SendBody } from "./validate.ts";
import { streamTurn, turnInFlight } from "./sse.ts";

/** A reaction is one emoji or short token, not a free-text field. */
const MAX_REACTION_CHARS = 16;
const MAX_REACTIONS_PER_MESSAGE = 20;

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
    if (session === null || !canAccess(session, principal, "read")) {
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
    if (session === null || !canAccess(session, principal, "write")) {
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
    const busy = turnInFlight(options, sessionId);
    if (busy !== null) {
      return busy;
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
    if (session === null || !canAccess(session, principal, "write")) {
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
    const busy = turnInFlight(options, sessionId);
    if (busy !== null) {
      return busy;
    }
    const edited = store.editMessage(sessionId, c.req.param("mid"), body.content);
    if (edited === null) {
      return error(404, "message_not_found", "Unknown editable user message");
    }
    return streamTurn(options, sessionId, edited, principal);
  });

  app.post("/v1/sessions/:id{[0-9a-f]+}/messages/:mid{[0-9a-f]+}/reactions", async (c) => {
    const principal = c.get("principal");
    const denied = requireScope(principal, "sessions:write");
    if (denied !== null) {
      return denied;
    }
    const sessionId = c.req.param("id");
    const session = store.getSession(sessionId);
    if (session === null || !canAccess(session, principal, "write")) {
      return error(404, "session_not_found", "Unknown session");
    }
    const body = (await c.req.json().catch(() => null)) as {
      emoji?: unknown;
    } | null;
    if (
      body === null ||
      typeof body.emoji !== "string" ||
      body.emoji === "" ||
      body.emoji.length > MAX_REACTION_CHARS ||
      /[\s\u0000-\u001f]/.test(body.emoji)
    ) {
      return error(400, "invalid_reaction", "emoji must be a short string without spaces");
    }
    const target = session.messages.find((m) => m.id === c.req.param("mid"));
    if (
      target !== undefined &&
      target.reactions[body.emoji] === undefined &&
      Object.keys(target.reactions).length >= MAX_REACTIONS_PER_MESSAGE
    ) {
      return error(400, "invalid_reaction", "Too many distinct reactions on this message");
    }
    const message = store.toggleReaction(sessionId, c.req.param("mid"), body.emoji);
    if (message === null) {
      return error(404, "message_not_found", "Unknown message");
    }
    return json(200, message);
  });
}
