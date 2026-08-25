import { describe, expect, test } from "bun:test";
import { narrowChatEvent } from "./index.ts";
import type { ChatMessage } from "./index.ts";

const message: ChatMessage = {
  id: "m1",
  role: "assistant",
  content: "hi",
  attachments: [],
  reactions: {},
  createdAt: "2026-08-25T00:00:00.000Z",
  editedAt: null,
  status: "done",
};

describe("narrowChatEvent", () => {
  test("passes conforming message events through", () => {
    expect(narrowChatEvent({ event: "user", data: message })).toEqual({
      event: "user",
      data: message,
    });
    expect(narrowChatEvent({ event: "done", data: message })).toEqual({
      event: "done",
      data: message,
    });
  });

  test("rejects message events missing id, role, or content", () => {
    expect(narrowChatEvent({ event: "user", data: { id: "m1" } })).toBeNull();
    expect(
      narrowChatEvent({ event: "done", data: { ...message, role: "system" } }),
    ).toBeNull();
    expect(
      narrowChatEvent({ event: "done", data: { ...message, content: 1 } }),
    ).toBeNull();
    expect(narrowChatEvent({ event: "user", data: null })).toBeNull();
  });

  test("narrows assistant events to their id", () => {
    expect(
      narrowChatEvent({ event: "assistant", data: { id: "a1", extra: 1 } }),
    ).toEqual({ event: "assistant", data: { id: "a1" } });
    expect(narrowChatEvent({ event: "assistant", data: {} })).toBeNull();
  });

  test("requires delta text to be a string", () => {
    expect(
      narrowChatEvent({ event: "delta", data: { id: "a1", text: "x" } }),
    ).toEqual({ event: "delta", data: { id: "a1", text: "x" } });
    expect(narrowChatEvent({ event: "delta", data: { id: "a1" } })).toBeNull();
    expect(narrowChatEvent({ event: "delta", data: "x" })).toBeNull();
  });

  test("narrows error events with an optional id", () => {
    expect(
      narrowChatEvent({ event: "error", data: { message: "boom" } }),
    ).toEqual({ event: "error", data: { message: "boom" } });
    expect(
      narrowChatEvent({ event: "error", data: { id: "a1", message: "boom" } }),
    ).toEqual({ event: "error", data: { id: "a1", message: "boom" } });
    expect(narrowChatEvent({ event: "error", data: { id: "a1" } })).toBeNull();
  });

  test("drops unknown event names", () => {
    expect(
      narrowChatEvent({ event: "hermes.tool.progress", data: { id: "a1" } }),
    ).toBeNull();
  });
});
