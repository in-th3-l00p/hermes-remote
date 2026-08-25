import { GlobalRegistrator } from "@happy-dom/global-registrator";
GlobalRegistrator.register();

import { afterAll, describe, expect, test } from "bun:test";

afterAll(async () => {
  await GlobalRegistrator.unregister();
});
import { act, renderHook, waitFor } from "@testing-library/react";
import { useChat, type ChatClientLike } from "./index.ts";
import type { ChatEvent, ChatMessage } from "@in-th3-l00p/hermes-remote-client";

const msg = (id: string, role: "user" | "assistant", content: string): ChatMessage => ({
  id,
  role,
  content,
  attachments: [],
  reactions: {},
  createdAt: "2026-08-24T00:00:00.000Z",
  editedAt: null,
  status: "done",
});

async function* eventsOf(events: ChatEvent[]): AsyncIterable<ChatEvent> {
  for (const event of events) {
    yield event;
  }
}

function fakeClient(overrides: Partial<ChatClientLike> = {}): ChatClientLike {
  return {
    createSession: async () => ({
      id: "s1",
      userId: null,
      title: null,
      createdAt: "t",
      updatedAt: "t",
      messages: [],
    }),
    listMessages: async () => [msg("h1", "user", "old")],
    sendMessage: () =>
      eventsOf([
        { event: "user", data: msg("u1", "user", "hello") },
        { event: "assistant", data: { id: "a1" } },
        { event: "delta", data: { id: "a1", text: "h" } },
        { event: "delta", data: { id: "a1", text: "i" } },
        { event: "done", data: msg("a1", "assistant", "hi") },
      ]),
    editMessage: () =>
      eventsOf([
        { event: "user", data: msg("u1b", "user", "edited") },
        { event: "assistant", data: { id: "a2" } },
        { event: "done", data: msg("a2", "assistant", "re-reply") },
      ]),
    react: async (_s, messageId, emoji) => ({
      ...msg(messageId, "user", "hello"),
      reactions: { [emoji]: 1 },
    }),
    stopTurn: async () => ({ stopped: true }),
    ...overrides,
  };
}

describe("useChat", () => {
  test("sends a message, creates a session, streams the reply", async () => {
    const client = fakeClient();
    const { result } = renderHook(() => useChat({ client }));
    expect(result.current.sessionId).toBeNull();
    await act(async () => {
      await result.current.send("hello");
    });
    expect(result.current.sessionId).toBe("s1");
    expect(result.current.streaming).toBe(false);
    expect(result.current.messages.map((m) => [m.role, m.content])).toEqual([
      ["user", "hello"],
      ["assistant", "hi"],
    ]);
  });

  test("reuses an existing sessionId", async () => {
    let created = 0;
    const client = fakeClient({
      createSession: async () => {
        created += 1;
        return {
          id: "s9",
          userId: null,
          title: null,
          createdAt: "t",
          updatedAt: "t",
          messages: [],
        };
      },
    });
    const { result } = renderHook(() =>
      useChat({ client, sessionId: "given" }),
    );
    await act(async () => {
      await result.current.send("x");
    });
    expect(created).toBe(0);
    expect(result.current.sessionId).toBe("given");
  });

  test("edit truncates from the edited message", async () => {
    const client = fakeClient();
    const { result } = renderHook(() => useChat({ client }));
    await act(async () => {
      await result.current.send("hello");
    });
    await act(async () => {
      await result.current.edit("u1", "edited");
    });
    expect(result.current.messages.map((m) => m.content)).toEqual([
      "edited",
      "re-reply",
    ]);
  });

  test("react replaces the message", async () => {
    const client = fakeClient();
    const { result } = renderHook(() => useChat({ client }));
    await act(async () => {
      await result.current.send("hello");
    });
    await act(async () => {
      await result.current.react("u1", "🔥");
    });
    expect(result.current.messages[0]?.reactions).toEqual({ "🔥": 1 });
  });

  test("open loads history and reset clears it", async () => {
    const client = fakeClient();
    const { result } = renderHook(() => useChat({ client }));
    await act(async () => {
      await result.current.open("existing");
    });
    expect(result.current.sessionId).toBe("existing");
    expect(result.current.messages.map((m) => m.content)).toEqual(["old"]);
    await act(async () => {
      await result.current.send("more");
    });
    expect(result.current.messages).toHaveLength(3);
    act(() => {
      result.current.reset();
    });
    expect(result.current.sessionId).toBeNull();
    expect(result.current.messages).toEqual([]);
  });

  test("stop forwards to the client for the active session", async () => {
    const stopped: string[] = [];
    const client = fakeClient({
      stopTurn: async (sessionId) => {
        stopped.push(sessionId);
        return { stopped: true };
      },
    });
    const { result } = renderHook(() => useChat({ client }));
    await act(async () => {
      await result.current.stop();
    });
    expect(stopped).toEqual([]);
    await act(async () => {
      await result.current.send("hello");
    });
    await act(async () => {
      await result.current.stop();
    });
    expect(stopped).toEqual(["s1"]);
  });

  test("error events mark the message and surface the error", async () => {
    const client = fakeClient({
      sendMessage: () =>
        eventsOf([
          { event: "user", data: msg("u1", "user", "x") },
          { event: "assistant", data: { id: "a1" } },
          { event: "error", data: { id: "a1", message: "agent down" } },
        ]),
    });
    const { result } = renderHook(() => useChat({ client }));
    await act(async () => {
      await result.current.send("x");
    });
    expect(result.current.error).toBe("agent down");
    expect(result.current.messages.at(-1)?.status).toBe("error");
  });

  test("thrown stream errors are caught", async () => {
    const client = fakeClient({
      // eslint-disable-next-line require-yield
      sendMessage: async function* () {
        throw new Error("network gone");
      },
    });
    const { result } = renderHook(() => useChat({ client }));
    await act(async () => {
      await result.current.send("x");
    });
    expect(result.current.error).toBe("network gone");
    expect(result.current.streaming).toBe(false);
  });

  test("stream failure marks streaming messages as error", async () => {
    const client = fakeClient({
      sendMessage: async function* () {
        yield { event: "user", data: msg("u1", "user", "x") } as ChatEvent;
        yield { event: "assistant", data: { id: "a1" } } as ChatEvent;
        throw new Error("network gone");
      },
    });
    const { result } = renderHook(() => useChat({ client }));
    await act(async () => {
      await result.current.send("x");
    });
    expect(result.current.error).toBe("network gone");
    expect(result.current.messages.map((m) => m.status)).toEqual([
      "done",
      "error",
    ]);
  });

  test("unmount aborts the in-flight stream", async () => {
    let signal: AbortSignal | null = null;
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const client = fakeClient({
      sendMessage: (_s, _i, options) =>
        (async function* () {
          signal = options?.signal ?? null;
          yield { event: "user", data: msg("u1", "user", "x") } as ChatEvent;
          await gate;
          yield { event: "done", data: msg("a1", "assistant", "late") } as ChatEvent;
        })(),
    });
    const { result, unmount } = renderHook(() => useChat({ client }));
    let pending: Promise<void> = Promise.resolve();
    act(() => {
      pending = result.current.send("x");
    });
    await waitFor(() => expect(signal).not.toBeNull());
    unmount();
    expect((signal as unknown as AbortSignal).aborted).toBe(true);
    release();
    await pending;
    expect(result.current.error).toBeNull();
  });

  test("open mid-stream aborts without bleeding events or erroring", async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const client = fakeClient({
      sendMessage: (_s, _i, options) =>
        (async function* () {
          yield { event: "user", data: msg("u1", "user", "x") } as ChatEvent;
          await gate;
          if (options?.signal?.aborted) {
            throw new Error("aborted");
          }
          yield { event: "user", data: msg("u2", "user", "stale") } as ChatEvent;
        })(),
    });
    const { result } = renderHook(() => useChat({ client }));
    let pending: Promise<void> = Promise.resolve();
    act(() => {
      pending = result.current.send("x");
    });
    await waitFor(() => expect(result.current.streaming).toBe(true));
    await act(async () => {
      await result.current.open("other");
    });
    release();
    await act(async () => {
      await pending;
    });
    expect(result.current.sessionId).toBe("other");
    expect(result.current.messages.map((m) => m.content)).toEqual(["old"]);
    expect(result.current.error).toBeNull();
    expect(result.current.streaming).toBe(false);
  });

  test("reset mid-stream aborts and clears state", async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const client = fakeClient({
      sendMessage: async function* () {
        yield { event: "user", data: msg("u1", "user", "x") } as ChatEvent;
        await gate;
        yield { event: "user", data: msg("u2", "user", "stale") } as ChatEvent;
      },
    });
    const { result } = renderHook(() => useChat({ client }));
    let pending: Promise<void> = Promise.resolve();
    act(() => {
      pending = result.current.send("x");
    });
    await waitFor(() => expect(result.current.streaming).toBe(true));
    act(() => {
      result.current.reset();
    });
    release();
    await act(async () => {
      await pending;
    });
    expect(result.current.messages).toEqual([]);
    expect(result.current.error).toBeNull();
    expect(result.current.streaming).toBe(false);
  });

  test("streaming flag is true mid-stream", async () => {
    let release: (() => void) | null = null;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const client = fakeClient({
      sendMessage: async function* () {
        yield { event: "user", data: msg("u1", "user", "x") } as ChatEvent;
        await gate;
        yield { event: "done", data: msg("a1", "assistant", "ok") } as ChatEvent;
      },
    });
    const { result } = renderHook(() => useChat({ client }));
    let pending: Promise<void> = Promise.resolve();
    act(() => {
      pending = result.current.send("x");
    });
    await waitFor(() => expect(result.current.streaming).toBe(true));
    (release as unknown as () => void)();
    await act(async () => {
      await pending;
    });
    expect(result.current.streaming).toBe(false);
  });
});
