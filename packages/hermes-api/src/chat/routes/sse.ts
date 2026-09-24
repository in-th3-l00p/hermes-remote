import { history } from "../identity.ts";
import type { ChatMessage } from "../store/index.ts";
import type { Principal } from "../../auth/index.ts";
import { error, type ChatOptions } from "./shared.ts";
import { keepAlive } from "../../http/keepalive.ts";

/**
 * 409 when a turn is already streaming for the session. Callers check this
 * before touching history, so a rejected request has no side effects.
 */
export function turnInFlight(options: ChatOptions, sessionId: string): Response | null {
  return options.turns?.has(sessionId) === true
    ? error(409, "turn_in_flight", "A turn is already streaming for this session")
    : null;
}

function turnOutcome(options: ChatOptions, outcome: "completed" | "stopped" | "failed"): void {
  options.metrics?.count("hermes_chat_turns_total", "Chat turns by outcome", { outcome });
}

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
      let dead = false;
      const emit = (event: string, data: unknown): void => {
        if (dead) {
          return;
        }
        try {
          streamController.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
          );
        } catch {
          // The client is gone; keep finishing bookkeeping without emitting.
          dead = true;
        }
      };
      try {
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
          turnOutcome(options, "completed");
        } catch (cause) {
          if (controller.signal.aborted) {
            emit("done", store.finishMessage(sessionId, assistant.id, "done"));
            turnOutcome(options, "stopped");
          } else {
            turnOutcome(options, "failed");
            store.finishMessage(sessionId, assistant.id, "error");
            emit("error", {
              id: assistant.id,
              message: cause instanceof Error ? cause.message : String(cause),
            });
          }
        }
      } finally {
        turns?.delete(sessionId);
      }
      if (!dead) {
        streamController.close();
      }
    },
    cancel() {
      // Client disconnect must cancel the upstream turn, not leak it.
      controller.abort();
    },
  });
  return new Response(keepAlive(stream, options.keepAliveMs), {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
    },
  });
}
