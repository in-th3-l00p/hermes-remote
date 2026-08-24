import type { AgentBackend, AgentTurnMessage } from "./agent.ts";
import type { Attachment, ChatMessage, ChatSession, ChatStore } from "./store.ts";
import type { Principal } from "../app.ts";
import type { Limits } from "../limits.ts";

export interface ChatOptions {
  store: ChatStore;
  agent: AgentBackend;
  /** In-flight turn abort controllers, keyed by session id. */
  turns?: Map<string, AbortController>;
}

function canAccess(session: ChatSession, principal: Principal): boolean {
  if (session.userId === null || principal.type === "api_key") {
    return true;
  }
  return principal.type === "user" && principal.userId === session.userId;
}

function json(status: number, body: unknown): Response {
  return Response.json(body, { status });
}

function error(status: number, code: string, message: string): Response {
  return json(status, { error: { code, message } });
}

/** API keys must hold the route's scope; user/anonymous principals are tier 1. */
function requireScope(principal: Principal, scope: string): Response | null {
  if (principal.type === "api_key" && !principal.record.scopes.includes(scope)) {
    return error(403, "missing_scope", `This route requires the ${scope} scope`);
  }
  return null;
}

/** Tells the agent who it is speaking with, without leaking platform data. */
function identityTurn(principal: Principal): AgentTurnMessage {
  let identity: string;
  if (principal.type === "user") {
    identity =
      principal.email === undefined
        ? `an authenticated anonymous guest (stable user id: ${principal.userId})`
        : `an authenticated user (user id: ${principal.userId}, email: ${principal.email})`;
  } else if (principal.type === "api_key") {
    identity = `a backend service using the API key "${principal.record.name}"`;
  } else {
    identity = "an unauthenticated guest";
  }
  return {
    role: "system",
    content:
      `<user-context>You are chatting through hermes-remote with ${identity}. ` +
      "Address them accordingly and never attribute this conversation to anyone else.</user-context>",
    attachments: [],
  };
}

function history(
  store: ChatStore,
  sessionId: string,
  principal: Principal,
): AgentTurnMessage[] {
  const session = store.getSession(sessionId);
  const turns: AgentTurnMessage[] = (session?.messages ?? [])
    .filter((m) => m.status === "done")
    .map((m) => ({
      role: m.role,
      content: m.content,
      attachments: m.attachments,
    }));
  return [identityTurn(principal), ...turns];
}

function streamTurn(
  options: ChatOptions,
  sessionId: string,
  userMessage: ChatMessage,
  principal: Principal,
): Response {
  const { store, agent } = options;
  const turns = options.turns;
  const controller = new AbortController();
  turns?.set(sessionId, controller);
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(streamController) {
      const emit = (event: string, data: unknown): void => {
        streamController.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
        );
      };
      emit("user", userMessage);
      const assistant = store.addMessage(sessionId, {
        role: "assistant",
        content: "",
        status: "streaming",
      }) as ChatMessage;
      emit("assistant", { id: assistant.id });
      try {
        for await (const text of agent.stream(
          history(store, sessionId, principal),
          controller.signal,
        )) {
          store.appendContent(sessionId, assistant.id, text);
          emit("delta", { id: assistant.id, text });
        }
        emit("done", store.finishMessage(sessionId, assistant.id, "done"));
      } catch (cause) {
        if (controller.signal.aborted) {
          emit("done", store.finishMessage(sessionId, assistant.id, "done"));
        } else {
          store.finishMessage(sessionId, assistant.id, "error");
          emit("error", {
            id: assistant.id,
            message: cause instanceof Error ? cause.message : String(cause),
          });
        }
      } finally {
        turns?.delete(sessionId);
      }
      streamController.close();
    },
  });
  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
    },
  });
}

interface SendBody {
  content?: unknown;
  attachments?: unknown;
}

function parseAttachments(raw: unknown, limits: Limits): Attachment[] | null {
  if (raw === undefined) {
    return [];
  }
  if (!Array.isArray(raw) || raw.length > limits.maxAttachments) {
    return null;
  }
  const attachments: Attachment[] = [];
  for (const item of raw as Record<string, unknown>[]) {
    if (
      typeof item?.["name"] !== "string" ||
      typeof item?.["type"] !== "string" ||
      typeof item?.["dataUrl"] !== "string" ||
      item["dataUrl"].length > limits.maxAttachmentChars
    ) {
      return null;
    }
    attachments.push({
      name: item["name"],
      type: item["type"],
      dataUrl: item["dataUrl"],
    });
  }
  return attachments;
}

function pageParams(url: URL, defaultLimit: number): { limit: number; offset: number } {
  const limit = Number(url.searchParams.get("limit") ?? String(defaultLimit));
  const offset = Number(url.searchParams.get("offset") ?? "0");
  return {
    limit: Number.isInteger(limit) && limit > 0 ? Math.min(limit, 200) : defaultLimit,
    offset: Number.isInteger(offset) && offset >= 0 ? offset : 0,
  };
}

/** Returns null when the request doesn't match a chat route. */
export async function handleChatRoute(
  request: Request,
  url: URL,
  options: ChatOptions,
  principal: Principal,
  limits: Limits,
): Promise<Response | null> {
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
