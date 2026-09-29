import { history } from "../identity.ts";
import type { ChatMessage } from "../store/index.ts";
import type { Principal } from "../../auth/index.ts";
import {
  DEFAULT_KEEPALIVE_MS,
  KEEPALIVE_FRAME,
  keepAlive,
} from "../../http/keepalive.ts";
import { error, type ChatOptions } from "./shared.ts";

export function streamTurn(
  options: ChatOptions,
  sessionId: string,
  userMessage: ChatMessage,
  principal: Principal,
): Response {
  const { store, agent } = options;
  const turns = options.turns;
  if (turns?.has(sessionId) === true) {
    return error(
      409,
      "turn_in_flight",
      "A turn is already streaming for this session",
    );
  }
  const controller = new AbortController();
  turns?.set(sessionId, controller);
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(streamController) {
      let dead = false;
      const write = (frame: string): void => {
        if (dead) {
          return;
        }
        try {
          streamController.enqueue(encoder.encode(frame));
        } catch {
          // The client is gone; keep finishing bookkeeping without emitting.
          dead = true;
        }
      };
      const emit = (event: string, data: unknown): void => {
        write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      };
      // A turn can wait minutes on a model without producing a token, and an
      // SSE response that has written nothing is idle to the transport. The
      // upstream's own keepalives cannot be forwarded: `agent.stream` yields
      // assistant *text*, every string of which is appended to the stored
      // message, so a keepalive pushed through that seam would be shown to the
      // reader as part of the agent's reply. The relay writes its own instead,
      // which holds a turn of any length and needs nothing from the upstream.
      const stopKeepalive = keepAlive(() => {
        write(KEEPALIVE_FRAME);
      }, options.keepaliveMs ?? DEFAULT_KEEPALIVE_MS);
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
        }
      } finally {
        // Before the close below, so no frame can be written to a closed stream.
        stopKeepalive();
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
  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
    },
  });
}
