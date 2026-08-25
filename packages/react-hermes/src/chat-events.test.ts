import { describe, expect, test } from "bun:test";
import { applyChatEvent, chatEventError } from "./chat-events.ts";
import type { ChatMessage } from "@in-th3-l00p/hermes-remote-client";

const msg = (
  id: string,
  role: "user" | "assistant",
  content: string,
): ChatMessage => ({
  id,
  role,
  content,
  attachments: [],
  reactions: {},
  createdAt: "2026-08-24T00:00:00.000Z",
  editedAt: null,
  status: "done",
});

describe("applyChatEvent", () => {
  test("user appends when not editing", () => {
    const next = applyChatEvent(
      [msg("u0", "user", "hi")],
      { event: "user", data: msg("u1", "user", "again") },
      null,
    );
    expect(next.map((m) => m.id)).toEqual(["u0", "u1"]);
  });

  test("user truncates from the edited message", () => {
    const prev = [msg("u0", "user", "hi"), msg("a0", "assistant", "yo")];
    const next = applyChatEvent(
      prev,
      { event: "user", data: msg("u0b", "user", "edited") },
      "u0",
    );
    expect(next.map((m) => m.id)).toEqual(["u0b"]);
  });

  test("user appends when the edited message is not found", () => {
    const prev = [msg("u0", "user", "hi"), msg("a0", "assistant", "yo")];
    const next = applyChatEvent(
      prev,
      { event: "user", data: msg("u1", "user", "new") },
      "missing",
    );
    expect(next.map((m) => m.id)).toEqual(["u0", "a0", "u1"]);
  });

  test("assistant appends a streaming placeholder", () => {
    const next = applyChatEvent([], { event: "assistant", data: { id: "a1" } }, null);
    expect(next).toHaveLength(1);
    expect(next[0]).toMatchObject({
      id: "a1",
      role: "assistant",
      content: "",
      status: "streaming",
    });
  });

  test("delta appends text to the matching message only", () => {
    const prev = [
      { ...msg("a1", "assistant", "h"), status: "streaming" as const },
      msg("u1", "user", "x"),
    ];
    const next = applyChatEvent(
      prev,
      { event: "delta", data: { id: "a1", text: "i" } },
      null,
    );
    expect(next[0]?.content).toBe("hi");
    expect(next[1]).toBe(prev[1] as ChatMessage);
  });

  test("done replaces the matching message", () => {
    const prev = [{ ...msg("a1", "assistant", "hi"), status: "streaming" as const }];
    const final = msg("a1", "assistant", "hi there");
    const next = applyChatEvent(prev, { event: "done", data: final }, null);
    expect(next).toEqual([final]);
  });

  test("error marks the matching message", () => {
    const prev = [{ ...msg("a1", "assistant", "h"), status: "streaming" as const }];
    const next = applyChatEvent(
      prev,
      { event: "error", data: { id: "a1", message: "boom" } },
      null,
    );
    expect(next[0]?.status).toBe("error");
  });

  test("error without an id leaves messages untouched", () => {
    const prev = [msg("u1", "user", "x")];
    const next = applyChatEvent(
      prev,
      { event: "error", data: { message: "boom" } },
      null,
    );
    expect(next).toEqual(prev);
  });

  test("unknown event names leave messages untouched", () => {
    const prev = [{ ...msg("a1", "assistant", "h"), status: "streaming" as const }];
    const next = applyChatEvent(
      prev,
      { event: "hermes.tool.progress", data: { id: "a1" } } as never,
      null,
    );
    expect(next).toBe(prev);
  });
});

describe("chatEventError", () => {
  test("returns the message for error events", () => {
    expect(chatEventError({ event: "error", data: { message: "boom" } })).toBe(
      "boom",
    );
  });

  test("returns null for other events", () => {
    expect(chatEventError({ event: "assistant", data: { id: "a1" } })).toBeNull();
  });
});
