import { useCallback, useEffect, useRef, useState } from "react";
import type {
  Attachment,
  ChatEvent,
  ChatMessage,
  ChatSession,
  SendMessageInput,
} from "@intheloop-studio/hermes-remote-client";
import { applyChatEvent, chatEventError } from "./chat-events.ts";

/** Structural subset of HermesClient used by useChat (easy to fake in tests). */
export interface ChatClientLike {
  createSession(): Promise<ChatSession>;
  listMessages(sessionId: string): Promise<ChatMessage[]>;
  sendMessage(
    sessionId: string,
    input: SendMessageInput,
    options?: { signal?: AbortSignal },
  ): AsyncIterable<ChatEvent>;
  editMessage(
    sessionId: string,
    messageId: string,
    content: string,
    options?: { signal?: AbortSignal },
  ): AsyncIterable<ChatEvent>;
  react(
    sessionId: string,
    messageId: string,
    emoji: string,
  ): Promise<ChatMessage>;
  stopTurn(sessionId: string): Promise<{ stopped: boolean }>;
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
  /** Aborts the in-flight agent turn; the partial reply is kept. */
  stop(): Promise<void>;
}

const failStreaming = (prev: ChatMessage[]): ChatMessage[] =>
  prev.map((m) =>
    m.status === "streaming" ? { ...m, status: "error" as const } : m,
  );

export function useChat(options: UseChatOptions): UseChat {
  const { client } = options;
  const [sessionId, setSessionId] = useState<string | null>(
    options.sessionId ?? null,
  );
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sessionRef = useRef<string | null>(options.sessionId ?? null);
  const abortRef = useRef<AbortController | null>(null);

  const abort = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStreaming(false);
  }, []);

  useEffect(() => () => abortRef.current?.abort(), []);

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
    async (
      start: (signal: AbortSignal) => AsyncIterable<ChatEvent>,
      editedId: string | null,
    ) => {
      const controller = new AbortController();
      abortRef.current = controller;
      setStreaming(true);
      setError(null);
      try {
        for await (const event of start(controller.signal)) {
          if (controller.signal.aborted) {
            break;
          }
          const failure = chatEventError(event);
          if (failure !== null) {
            setError(failure);
          }
          setMessages((prev) => applyChatEvent(prev, event, editedId));
        }
      } catch (cause) {
        if (!controller.signal.aborted) {
          setError(cause instanceof Error ? cause.message : String(cause));
          setMessages(failStreaming);
        }
      } finally {
        if (abortRef.current === controller) {
          abortRef.current = null;
          setStreaming(false);
        }
      }
    },
    [],
  );

  const send = useCallback(
    async (content: string, attachments: Attachment[] = []) => {
      const id = await ensureSession();
      await consume(
        (signal) => client.sendMessage(id, { content, attachments }, { signal }),
        null,
      );
    },
    [client, consume, ensureSession],
  );

  const edit = useCallback(
    async (messageId: string, content: string) => {
      const id = await ensureSession();
      await consume(
        (signal) => client.editMessage(id, messageId, content, { signal }),
        messageId,
      );
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
      abort();
      const history = await client.listMessages(id);
      sessionRef.current = id;
      setSessionId(id);
      setMessages(history);
      setError(null);
    },
    [abort, client],
  );

  const stop = useCallback(async () => {
    if (sessionRef.current !== null) {
      await client.stopTurn(sessionRef.current);
    }
  }, [client]);

  const reset = useCallback(() => {
    abort();
    sessionRef.current = null;
    setSessionId(null);
    setMessages([]);
    setError(null);
  }, [abort]);

  return { sessionId, messages, streaming, error, send, edit, react, open, reset, stop };
}
