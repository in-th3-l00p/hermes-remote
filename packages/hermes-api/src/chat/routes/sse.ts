import { history } from "../identity.ts";
import type { ChatMessage } from "../store/index.ts";
import type { Principal } from "../../auth/index.ts";
import type { ChatOptions } from "./shared.ts";

export function streamTurn(
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
