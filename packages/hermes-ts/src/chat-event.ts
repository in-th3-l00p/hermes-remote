import type { SseEvent } from "./sse.ts";
import type { ChatEvent, ChatMessage } from "./types.ts";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isMessage(value: unknown): value is ChatMessage {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    (value.role === "user" || value.role === "assistant") &&
    typeof value.content === "string"
  );
}

/** Narrows a raw SSE frame to a ChatEvent; returns null for frames that do
 * not conform so malformed or unknown events never reach consumers. */
export function narrowChatEvent(event: SseEvent): ChatEvent | null {
  const data = event.data;
  switch (event.event) {
    case "user":
    case "done":
      return isMessage(data) ? { event: event.event, data } : null;
    case "assistant":
      return isRecord(data) && typeof data.id === "string"
        ? { event: "assistant", data: { id: data.id } }
        : null;
    case "delta":
      return isRecord(data) &&
        typeof data.id === "string" &&
        typeof data.text === "string"
        ? { event: "delta", data: { id: data.id, text: data.text } }
        : null;
    case "error": {
      if (!isRecord(data) || typeof data.message !== "string") {
        return null;
      }
      const payload: { id?: string; message: string } = { message: data.message };
      if (typeof data.id === "string") {
        payload.id = data.id;
      }
      return { event: "error", data: payload };
    }
    default:
      return null;
  }
}
