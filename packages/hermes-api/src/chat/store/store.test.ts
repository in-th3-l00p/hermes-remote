import { describe, expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ChatStore } from "./index.ts";

const now = () => new Date("2026-08-24T00:00:00Z");

describe("ChatStore", () => {
  test("creates sessions and messages", () => {
    const store = new ChatStore(":memory:", now);
    const session = store.createSession();
    expect(session.messages).toEqual([]);
    expect(session.userId).toBeNull();
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

  test("persists to disk across instances", async () => {
    const dir = await mkdtemp(join(tmpdir(), "hermes-chat-db-"));
    const path = join(dir, "nested", "chat.db");
    const first = new ChatStore(path, now);
    const session = first.createSession("user-1");
    first.addMessage(session.id, { role: "user", content: "persisted" });
    const second = new ChatStore(path, now);
    const loaded = second.getSession(session.id);
    expect(loaded?.userId).toBe("user-1");
    expect(loaded?.messages[0]?.content).toBe("persisted");
  });

  test("titles sessions from the first user message", () => {
    const store = new ChatStore(":memory:", now);
    const session = store.createSession();
    store.addMessage(session.id, { role: "assistant", content: "welcome" });
    expect(store.getSession(session.id)?.title).toBeNull();
    store.addMessage(session.id, { role: "user", content: "a".repeat(60) });
    expect(store.getSession(session.id)?.title).toBe("a".repeat(48));
    store.addMessage(session.id, { role: "user", content: "second" });
    expect(store.getSession(session.id)?.title).toBe("a".repeat(48));
  });

  test("lists sessions by user and by ids", () => {
    let tick = 0;
    const store = new ChatStore(
      ":memory:",
      () => new Date(Date.parse("2026-08-24T00:00:00Z") + tick++ * 1000),
    );
    const mine = store.createSession("u1");
    const other = store.createSession("u2");
    const anonymous = store.createSession();
    expect(store.listSessions({ userId: "u1" }).map((s) => s.id)).toEqual([
      mine.id,
    ]);
    expect(
      store
        .listSessions({ ids: [anonymous.id, other.id, "ffff"] })
        .map((s) => s.id)
        .sort(),
    ).toEqual([anonymous.id, other.id].sort());
    expect(store.listSessions({})).toEqual([]);
  });

  test("deletes sessions with their messages", () => {
    const store = new ChatStore(":memory:", now);
    const session = store.createSession();
    store.addMessage(session.id, { role: "user", content: "x" });
    expect(store.deleteSession(session.id)).toBe(true);
    expect(store.getSession(session.id)).toBeNull();
    expect(store.deleteSession(session.id)).toBe(false);
  });

  test("streams content into a message", () => {
    const store = new ChatStore(":memory:", now);
    const session = store.createSession();
    const msg = store.addMessage(session.id, {
      role: "assistant",
      content: "",
      status: "streaming",
    });
    store.appendContent(session.id, msg?.id as string, "hel");
    store.appendContent(session.id, msg?.id as string, "lo");
    store.appendContent(session.id, "nope", "x");
    expect(
      store.finishMessage(session.id, msg?.id as string, "done"),
    ).toMatchObject({ content: "hello", status: "done" });
    expect(store.finishMessage(session.id, "nope", "done")).toBeNull();
  });

  test("edits a user message and truncates history after it", () => {
    const store = new ChatStore(":memory:", now);
    const session = store.createSession();
    const user = store.addMessage(session.id, { role: "user", content: "a" });
    store.addMessage(session.id, { role: "assistant", content: "b" });
    const edited = store.editMessage(session.id, user?.id as string, "a2");
    expect(edited?.content).toBe("a2");
    expect(edited?.editedAt).toBe("2026-08-24T00:00:00.000Z");
    expect(store.getSession(session.id)?.messages).toHaveLength(1);
  });

  test("edit rejects unknown sessions, unknown ids, and assistant messages", () => {
    const store = new ChatStore(":memory:", now);
    const session = store.createSession();
    const assistant = store.addMessage(session.id, {
      role: "assistant",
      content: "b",
    });
    expect(store.editMessage("nope", "x", "y")).toBeNull();
    expect(store.editMessage(session.id, "nope", "y")).toBeNull();
    expect(
      store.editMessage(session.id, assistant?.id as string, "y"),
    ).toBeNull();
  });

  test("toggles reactions", () => {
    const store = new ChatStore(":memory:", now);
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
