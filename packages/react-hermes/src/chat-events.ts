import type {
  ChatEvent,
  ChatMessage,
} from "@in-th3-l00p/hermes-remote-client";

function placeholder(id: string): ChatMessage {
  return {
    id,
    role: "assistant",
    content: "",
    attachments: [],
    reactions: {},
    createdAt: new Date().toISOString(),
    editedAt: null,
    status: "streaming",
  };
}

export function applyChatEvent(
  prev: ChatMessage[],
  event: ChatEvent,
  editedId: string | null,
): ChatMessage[] {
  switch (event.event) {
    case "user": {
      if (editedId === null) {
        return [...prev, event.data];
      }
      const index = prev.findIndex((m) => m.id === editedId);
      return [...prev.slice(0, index), event.data];
    }
    case "assistant":
      return [...prev, placeholder(event.data.id)];
    case "delta": {
      const { id, text } = event.data;
      return prev.map((m) =>
        m.id === id ? { ...m, content: m.content + text } : m,
      );
    }
    case "done":
      return prev.map((m) => (m.id === event.data.id ? event.data : m));
    default:
      return prev.map((m) =>
        m.id === event.data.id ? { ...m, status: "error" as const } : m,
      );
  }
}

export function chatEventError(event: ChatEvent): string | null {
  return event.event === "error" ? event.data.message : null;
}
