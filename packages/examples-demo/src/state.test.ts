import { describe, expect, test } from "bun:test";
import { DemoState } from "./state.ts";

const now = () => new Date("2026-08-31T12:00:00Z");

describe("DemoState", () => {
  test("seeds sessions, runs, profiles, and an event backlog", () => {
    const state = new DemoState(now);
    expect(state.sessions.size).toBeGreaterThanOrEqual(4);
    expect(state.runs.size).toBeGreaterThanOrEqual(4);
    expect(state.homes.size).toBe(3);
    expect(state.backlog.length).toBeGreaterThanOrEqual(5);
  });

  test("newId produces unique lowercase hex ids", () => {
    const state = new DemoState(now);
    const a = state.newId();
    const b = state.newId();
    expect(a).not.toBe(b);
    expect(/^[0-9a-f]+$/.test(a)).toBe(true);
    expect(state.newId("run_").startsWith("run_")).toBe(true);
  });

  test("home resolves default, named, and unknown profiles", () => {
    const state = new DemoState(now);
    expect(state.home(null)).toBe(state.homes.get("default") ?? null);
    expect(state.home("work")).toBe(state.homes.get("work") ?? null);
    expect(state.home("bogus")).toBeNull();
  });

  test("profile homes are copies, not the shared seed", () => {
    const first = new DemoState(now);
    const home = first.home(null);
    home!.memory = "changed";
    home!.config["model.name"] = "changed";
    const second = new DemoState(now);
    expect(second.home(null)!.memory).not.toBe("changed");
    expect(second.home(null)!.config["model.name"]).not.toBe("changed");
  });

  test("createSession stores an owned session and publishes an event", async () => {
    const state = new DemoState(now);
    const controller = new AbortController();
    const iterator = state.bus.subscribe(controller.signal)[Symbol.asyncIterator]();
    const session = state.createSession("user-1");
    expect(session.userId).toBe("user-1");
    expect(state.sessions.get(session.id)).toBe(session);
    expect((await iterator.next()).value?.type).toBe("session.started");
    controller.abort();
  });

  test("listSessions returns metas newest first without messages", () => {
    const state = new DemoState(now);
    const metas = state.listSessions();
    expect(metas.length).toBe(state.sessions.size);
    for (let i = 1; i < metas.length; i++) {
      expect(metas[i - 1]!.updatedAt >= metas[i]!.updatedAt).toBe(true);
    }
    expect("messages" in (metas[0] as object)).toBe(false);
  });

  test("addMessage titles a fresh session from the first user message", () => {
    const state = new DemoState(now);
    const session = state.createSession(null);
    const long = "x".repeat(100);
    state.addMessage(session, "user", long, "done");
    expect(session.title).toBe("x".repeat(64));
    state.addMessage(session, "user", "second", "done");
    expect(session.title).toBe("x".repeat(64));
  });

  test("assistant messages never set the title", () => {
    const state = new DemoState(now);
    const session = state.createSession(null);
    state.addMessage(session, "assistant", "hello", "streaming");
    expect(session.title).toBeNull();
  });

  test("editMessage rewrites a user message and truncates after it", () => {
    const state = new DemoState(now);
    const session = state.createSession(null);
    const user = state.addMessage(session, "user", "original", "done");
    state.addMessage(session, "assistant", "reply", "done");
    const edited = state.editMessage(session, user.id, "changed");
    expect(edited?.content).toBe("changed");
    expect(edited?.editedAt).not.toBeNull();
    expect(session.messages.length).toBe(1);
  });

  test("editMessage rejects unknown and assistant messages", () => {
    const state = new DemoState(now);
    const session = state.createSession(null);
    const assistant = state.addMessage(session, "assistant", "reply", "done");
    expect(state.editMessage(session, "ffff", "x")).toBeNull();
    expect(state.editMessage(session, assistant.id, "x")).toBeNull();
  });

  test("toggleReaction adds, removes, and rejects unknown messages", () => {
    const state = new DemoState(now);
    const session = state.createSession(null);
    const message = state.addMessage(session, "user", "hi", "done");
    expect(state.toggleReaction(session, message.id, "🔥")?.reactions).toEqual({ "🔥": 1 });
    expect(state.toggleReaction(session, message.id, "🔥")?.reactions).toEqual({});
    expect(state.toggleReaction(session, "ffff", "🔥")).toBeNull();
  });

  test("createRun stores a completed run and publishes run.created", async () => {
    const state = new DemoState(now);
    const controller = new AbortController();
    const iterator = state.bus.subscribe(controller.signal)[Symbol.asyncIterator]();
    const run = state.createRun("do the thing", "done the thing");
    expect(run.status).toBe("completed");
    expect(state.runs.get(run.id)).toBe(run);
    expect((await iterator.next()).value?.type).toBe("run.created");
    controller.abort();
  });
});
