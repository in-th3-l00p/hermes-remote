import { describe, expect, test } from "bun:test";
import { ChatStore } from "./store.ts";

const now = () => new Date("2026-08-24T00:00:00Z");

describe("ChatStore", () => {
  test("creates sessions and messages", () => {
    const store = new ChatStore(now);
    const session = store.createSession();
    expect(session.messages).toEqual([]);
    expect(session.createdAt).toBe("2026-08-24T00:00:00.000Z");
    expect(store.getSession(session.id)?.id).toBe(session.id);
    expect(store.getSession("nope")).toBeNull();

    const message = store.addMessage(session.id, {
      role: "user",
      content: "hi",
    });
    expect(message?.status).toBe("done");
    expect(message?.attachments).toEqual([]);
    expect(store.addMessage("nope", { role: "user", content: "x" })).toBeNull();
    expect(store.getMessage(session.id, message?.id as string)?.content).toBe(
      "hi",
    );
    expect(store.getMessage("nope", "x")).toBeNull();
  });

  test("defaults now to the real clock", () => {
    const store = new ChatStore();
    expect(Date.parse(store.createSession().createdAt)).toBeGreaterThan(0);
  });

  test("streams content into a message", () => {
    const store = new ChatStore(now);
    const session = store.createSession();
    const msg = store.addMessage(session.id, {
      role: "assistant",
      content: "",
      status: "streaming",
    });
    store.appendContent(session.id, msg?.id as string, "hel");
    store.appendContent(session.id, msg?.id as string, "lo");
    store.appendContent(session.id, "nope", "x");
    expect(store.finishMessage(session.id, msg?.id as string, "done")).toMatchObject(
      { content: "hello", status: "done" },
    );
    expect(store.finishMessage(session.id, "nope", "done")).toBeNull();
  });

  test("edits a user message and truncates history after it", () => {
    const store = new ChatStore(now);
    const session = store.createSession();
    const user = store.addMessage(session.id, { role: "user", content: "a" });
    store.addMessage(session.id, { role: "assistant", content: "b" });
    const edited = store.editMessage(session.id, user?.id as string, "a2");
    expect(edited?.content).toBe("a2");
    expect(edited?.editedAt).toBe("2026-08-24T00:00:00.000Z");
    expect(store.getSession(session.id)?.messages).toHaveLength(1);
  });

  test("edit rejects unknown sessions, unknown ids, and assistant messages", () => {
    const store = new ChatStore(now);
    const session = store.createSession();
    const assistant = store.addMessage(session.id, {
      role: "assistant",
      content: "b",
    });
    expect(store.editMessage("nope", "x", "y")).toBeNull();
    expect(store.editMessage(session.id, "nope", "y")).toBeNull();
    expect(store.editMessage(session.id, assistant?.id as string, "y")).toBeNull();
  });

  test("toggles reactions", () => {
    const store = new ChatStore(now);
    const session = store.createSession();
    const msg = store.addMessage(session.id, { role: "user", content: "a" });
    expect(
      store.toggleReaction(session.id, msg?.id as string, "👍")?.reactions,
    ).toEqual({ "👍": 1 });
    expect(
      store.toggleReaction(session.id, msg?.id as string, "👍")?.reactions,
    ).toEqual({});
    expect(store.toggleReaction(session.id, "nope", "👍")).toBeNull();
  });
});
