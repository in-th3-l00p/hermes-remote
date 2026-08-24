import { useCallback, useRef, useState } from "react";
import type {
  Attachment,
  ChatEvent,
  ChatMessage,
  ChatSession,
  SendMessageInput,
} from "@in-th3-l00p/hermes-web-ts";

/** Structural subset of HermesClient used by useChat (easy to fake in tests). */
export interface ChatClientLike {
  createSession(): Promise<ChatSession>;
  listMessages(sessionId: string): Promise<ChatMessage[]>;
  sendMessage(
    sessionId: string,
    input: SendMessageInput,
  ): AsyncIterable<ChatEvent>;
  editMessage(
    sessionId: string,
    messageId: string,
    content: string,
  ): AsyncIterable<ChatEvent>;
  react(
    sessionId: string,
    messageId: string,
    emoji: string,
  ): Promise<ChatMessage>;
}

export interface UseChatOptions {
  client: ChatClientLike;
  sessionId?: string;
}

export interface UseChat {
  sessionId: string | null;
  messages: ChatMessage[];
  streaming: boolean;
  error: string | null;
  send(content: string, attachments?: Attachment[]): Promise<void>;
  edit(messageId: string, content: string): Promise<void>;
  react(messageId: string, emoji: string): Promise<void>;
  /** Loads an existing session's history and makes it active. */
  open(sessionId: string): Promise<void>;
  /** Clears state so the next send starts a fresh session. */
  reset(): void;
}

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

export function useChat(options: UseChatOptions): UseChat {
  const { client } = options;
  const [sessionId, setSessionId] = useState<string | null>(
    options.sessionId ?? null,
  );
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sessionRef = useRef<string | null>(options.sessionId ?? null);

  const ensureSession = useCallback(async (): Promise<string> => {
    if (sessionRef.current !== null) {
      return sessionRef.current;
    }
    const session = await client.createSession();
    sessionRef.current = session.id;
    setSessionId(session.id);
    return session.id;
  }, [client]);

  const consume = useCallback(
    async (events: AsyncIterable<ChatEvent>, editedId: string | null) => {
      setStreaming(true);
      setError(null);
      try {
        for await (const event of events) {
          if (event.event === "user") {
            const message = event.data;
            setMessages((prev) => {
              if (editedId === null) {
                return [...prev, message];
              }
              const index = prev.findIndex((m) => m.id === editedId);
              return [...prev.slice(0, index), message];
            });
          } else if (event.event === "assistant") {
            const { id } = event.data;
            setMessages((prev) => [...prev, placeholder(id)]);
          } else if (event.event === "delta") {
            const { id, text } = event.data;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === id ? { ...m, content: m.content + text } : m,
              ),
            );
          } else if (event.event === "done") {
            const message = event.data;
            setMessages((prev) =>
              prev.map((m) => (m.id === message.id ? message : m)),
            );
          } else {
            const { id, message } = event.data;
            setError(message);
            setMessages((prev) =>
              prev.map((m) =>
                m.id === id ? { ...m, status: "error" as const } : m,
              ),
            );
          }
        }
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
      } finally {
        setStreaming(false);
      }
    },
    [],
  );

  const send = useCallback(
    async (content: string, attachments: Attachment[] = []) => {
      const id = await ensureSession();
      await consume(client.sendMessage(id, { content, attachments }), null);
    },
    [client, consume, ensureSession],
  );

  const edit = useCallback(
    async (messageId: string, content: string) => {
      const id = await ensureSession();
      await consume(client.editMessage(id, messageId, content), messageId);
    },
    [client, consume, ensureSession],
  );

  const react = useCallback(
    async (messageId: string, emoji: string) => {
      const id = await ensureSession();
      const updated = await client.react(id, messageId, emoji);
      setMessages((prev) =>
        prev.map((m) => (m.id === updated.id ? updated : m)),
      );
    },
    [client, ensureSession],
  );

  const open = useCallback(
    async (id: string) => {
      const history = await client.listMessages(id);
      sessionRef.current = id;
      setSessionId(id);
      setMessages(history);
      setError(null);
    },
    [client],
  );

  const reset = useCallback(() => {
    sessionRef.current = null;
    setSessionId(null);
    setMessages([]);
    setError(null);
  }, []);

  return { sessionId, messages, streaming, error, send, edit, react, open, reset };
}
