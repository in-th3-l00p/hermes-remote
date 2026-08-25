import type { ChatMessage } from "../store/index.ts";
import type { Principal } from "../../auth/index.ts";
import type { Limits } from "../../limits/index.ts";
import { canAccess, error, json, requireScope, type ChatOptions } from "./shared.ts";
import { pageParams, parseAttachments, type SendBody } from "./validate.ts";
import { streamTurn } from "./sse.ts";

/** Returns null when the request doesn't match a message route. */
export async function handleMessageRoutes(
  request: Request,
  url: URL,
  options: ChatOptions,
  principal: Principal,
  limits: Limits,
): Promise<Response | null> {
  const { store } = options;
  const { method } = request;

  const messagesMatch = /^\/v1\/sessions\/([0-9a-f]+)\/messages$/.exec(
    url.pathname,
  );
  if (messagesMatch !== null) {
    const sessionId = messagesMatch[1] as string;
    const session = store.getSession(sessionId);
    if (method === "GET") {
      const denied = requireScope(principal, "sessions:read");
      if (denied !== null) {
        return denied;
      }
      if (session === null || !canAccess(session, principal)) {
        return error(404, "session_not_found", "Unknown session");
      }
      const { limit, offset } = pageParams(url, 200);
      return json(200, {
        messages: session.messages.slice(offset, offset + limit),
        total: session.messages.length,
      });
    }
    if (method === "POST") {
      const denied = requireScope(principal, "chat:invoke");
      if (denied !== null) {
        return denied;
      }
      if (session === null || !canAccess(session, principal)) {
        return error(404, "session_not_found", "Unknown session");
      }
      const body = (await request.json().catch(() => null)) as SendBody | null;
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
    }
    return null;
  }

  const messageMatch = /^\/v1\/sessions\/([0-9a-f]+)\/messages\/([0-9a-f]+)$/.exec(
    url.pathname,
  );
  if (messageMatch !== null && method === "PATCH") {
    const denied = requireScope(principal, "chat:invoke");
    if (denied !== null) {
      return denied;
    }
    const [, sessionId, messageId] = messageMatch as unknown as [
      string,
      string,
      string,
    ];
    const session = store.getSession(sessionId);
    if (session === null || !canAccess(session, principal)) {
      return error(404, "session_not_found", "Unknown session");
    }
    const body = (await request.json().catch(() => null)) as SendBody | null;
    if (
      body === null ||
      typeof body.content !== "string" ||
      body.content.trim() === "" ||
      body.content.length > limits.maxMessageChars
    ) {
      return error(400, "invalid_message", "content (string) is required");
    }
    const edited = store.editMessage(sessionId, messageId, body.content);
    if (edited === null) {
      return error(404, "message_not_found", "Unknown editable user message");
    }
    return streamTurn(options, sessionId, edited, principal);
  }

  const reactionMatch =
    /^\/v1\/sessions\/([0-9a-f]+)\/messages\/([0-9a-f]+)\/reactions$/.exec(
      url.pathname,
    );
  if (reactionMatch !== null && method === "POST") {
    const denied = requireScope(principal, "sessions:write");
    if (denied !== null) {
      return denied;
    }
    const [, sessionId, messageId] = reactionMatch as unknown as [
      string,
      string,
      string,
    ];
    const session = store.getSession(sessionId);
    if (session === null || !canAccess(session, principal)) {
      return error(404, "session_not_found", "Unknown session");
    }
    const body = (await request.json().catch(() => null)) as {
      emoji?: unknown;
    } | null;
    if (body === null || typeof body.emoji !== "string" || body.emoji === "") {
      return error(400, "invalid_reaction", "emoji (string) is required");
    }
    const message = store.toggleReaction(sessionId, messageId, body.emoji);
    if (message === null) {
      return error(404, "message_not_found", "Unknown message");
    }
    return json(200, message);
  }

  return null;
}
