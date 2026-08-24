import type { AgentBackend, AgentTurnMessage } from "./agent.ts";
import type { Attachment, ChatMessage, ChatSession, ChatStore } from "./store.ts";
import type { Principal } from "../app.ts";

export interface ChatOptions {
  store: ChatStore;
  agent: AgentBackend;
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

function history(store: ChatStore, sessionId: string): AgentTurnMessage[] {
  const session = store.getSession(sessionId);
  return (session?.messages ?? [])
    .filter((m) => m.status === "done")
    .map((m) => ({
      role: m.role,
      content: m.content,
      attachments: m.attachments,
    }));
}

function streamTurn(
  options: ChatOptions,
  sessionId: string,
  userMessage: ChatMessage,
): Response {
  const { store, agent } = options;
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (event: string, data: unknown): void => {
        controller.enqueue(
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
        for await (const text of agent.stream(history(store, sessionId))) {
          store.appendContent(sessionId, assistant.id, text);
          emit("delta", { id: assistant.id, text });
        }
        emit("done", store.finishMessage(sessionId, assistant.id, "done"));
      } catch (cause) {
        store.finishMessage(sessionId, assistant.id, "error");
        emit("error", {
          id: assistant.id,
          message: cause instanceof Error ? cause.message : String(cause),
        });
      }
      controller.close();
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

function parseAttachments(raw: unknown): Attachment[] | null {
  if (raw === undefined) {
    return [];
  }
  if (!Array.isArray(raw)) {
    return null;
  }
  const attachments: Attachment[] = [];
  for (const item of raw as Record<string, unknown>[]) {
    if (
      typeof item?.["name"] !== "string" ||
      typeof item?.["type"] !== "string" ||
      typeof item?.["dataUrl"] !== "string"
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

/** Returns null when the request doesn't match a chat route. */
export async function handleChatRoute(
  request: Request,
  url: URL,
  options: ChatOptions,
  principal: Principal,
): Promise<Response | null> {
  const { store } = options;
  const { method } = request;

  if (url.pathname === "/v1/sessions" && method === "POST") {
    return json(
      201,
      store.createSession(principal.type === "user" ? principal.userId : null),
    );
  }

  if (url.pathname === "/v1/sessions" && method === "GET") {
    if (principal.type === "user") {
      return json(200, {
        sessions: store.listSessions({ userId: principal.userId }),
      });
    }
    const ids = (url.searchParams.get("ids") ?? "")
      .split(",")
      .filter((id) => /^[0-9a-f]+$/.test(id));
    const sessions = store
      .listSessions({ ids })
      .filter((s) => s.userId === null || principal.type === "api_key");
    return json(200, { sessions });
  }

  const sessionMatch = /^\/v1\/sessions\/([0-9a-f]+)$/.exec(url.pathname);
  if (sessionMatch !== null && method === "DELETE") {
    const session = store.getSession(sessionMatch[1] as string);
    if (session === null || !canAccess(session, principal)) {
      return error(404, "session_not_found", "Unknown session");
    }
    store.deleteSession(session.id);
    return json(200, { deleted: true });
  }

  const messagesMatch = /^\/v1\/sessions\/([0-9a-f]+)\/messages$/.exec(
    url.pathname,
  );
  if (messagesMatch !== null) {
    const sessionId = messagesMatch[1] as string;
    const session = store.getSession(sessionId);
    if (session === null || !canAccess(session, principal)) {
      return error(404, "session_not_found", "Unknown session");
    }
    if (method === "GET") {
      return json(200, { messages: session.messages });
    }
    if (method === "POST") {
      const body = (await request.json().catch(() => null)) as SendBody | null;
      const attachments = parseAttachments(body?.attachments);
      if (
        body === null ||
        typeof body.content !== "string" ||
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
      return streamTurn(options, sessionId, userMessage);
    }
    return null;
  }

  const messageMatch = /^\/v1\/sessions\/([0-9a-f]+)\/messages\/([0-9a-f]+)$/.exec(
    url.pathname,
  );
  if (messageMatch !== null && method === "PATCH") {
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
    if (body === null || typeof body.content !== "string" || body.content.trim() === "") {
      return error(400, "invalid_message", "content (string) is required");
    }
    const edited = store.editMessage(sessionId, messageId, body.content);
    if (edited === null) {
      return error(404, "message_not_found", "Unknown editable user message");
    }
    return streamTurn(options, sessionId, edited);
  }

  const reactionMatch =
    /^\/v1\/sessions\/([0-9a-f]+)\/messages\/([0-9a-f]+)\/reactions$/.exec(
      url.pathname,
    );
  if (reactionMatch !== null && method === "POST") {
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
