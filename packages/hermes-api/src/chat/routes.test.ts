import { describe, expect, test } from "bun:test";
import { createApp } from "../index.ts";
import { ChatStore } from "./store.ts";
import type { AgentBackend } from "./agent.ts";

const echoAgent: AgentBackend = {
  async *stream(messages) {
    yield "echo: ";
    yield messages.at(-1)?.content ?? "";
  },
};

const failingAgent: AgentBackend = {
  // eslint-disable-next-line require-yield
  async *stream() {
    throw new Error("agent exploded");
  },
};

function makeApp(agent: AgentBackend = echoAgent) {
  const store = new ChatStore(":memory:", () => new Date("2026-08-24T00:00:00Z"));
  const app = createApp({ chat: { store, agent }, anonymous: true });
  return { app, store };
}

function parseSse(text: string): { event: string; data: unknown }[] {
  return text
    .trim()
    .split("\n\n")
    .map((block) => {
      const lines = block.split("\n");
      return {
        event: (lines[0] as string).slice(7),
        data: JSON.parse((lines[1] as string).slice(6)),
      };
    });
}

const post = (path: string, body: unknown, method = "POST") =>
  new Request(`http://x${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

describe("chat routes", () => {
  test("creates a session", async () => {
    const { app } = makeApp();
    const res = await app.fetch(post("/v1/sessions", {}));
    expect(res.status).toBe(201);
    const session = (await res.json()) as { id: string };
    expect(session.id).toMatch(/^[0-9a-f]+$/);
  });

  test("lists messages and 404s unknown sessions", async () => {
    const { app, store } = makeApp();
    const session = store.createSession();
    store.addMessage(session.id, { role: "user", content: "hi" });
    const res = await app.fetch(
      new Request(`http://x/v1/sessions/${session.id}/messages`),
    );
    expect(((await res.json()) as { messages: unknown[] }).messages).toHaveLength(1);
    const missing = await app.fetch(
      new Request("http://x/v1/sessions/ffff/messages"),
    );
    expect(missing.status).toBe(404);
  });

  test("sends a message and streams the reply", async () => {
    const { app, store } = makeApp();
    const session = store.createSession();
    const res = await app.fetch(
      post(`/v1/sessions/${session.id}/messages`, {
        content: "hello",
        attachments: [{ name: "a.png", type: "image/png", dataUrl: "data:x" }],
      }),
    );
    expect(res.headers.get("content-type")).toBe("text/event-stream");
    const events = parseSse(await res.text());
    expect(events.map((e) => e.event)).toEqual([
      "user",
      "assistant",
      "delta",
      "delta",
      "done",
    ]);
    const done = events.at(-1)?.data as { content: string; status: string };
    expect(done.content).toBe("echo: hello");
    expect(done.status).toBe("done");
    expect(store.getSession(session.id)?.messages).toHaveLength(2);
  });

  test("rejects invalid message bodies", async () => {
    const { app, store } = makeApp();
    const session = store.createSession();
    for (const body of [
      { content: 5 },
      { content: "  " },
      { content: "x", attachments: [{ name: "a" }] },
      { content: "x", attachments: "nope" },
    ]) {
      const res = await app.fetch(
        post(`/v1/sessions/${session.id}/messages`, body),
      );
      expect(res.status).toBe(400);
    }
    const badJson = await app.fetch(
      new Request(`http://x/v1/sessions/${session.id}/messages`, {
        method: "POST",
        body: "{",
      }),
    );
    expect(badJson.status).toBe(400);
    const emptyWithAttachment = await app.fetch(
      post(`/v1/sessions/${session.id}/messages`, {
        content: "",
        attachments: [{ name: "a.png", type: "image/png", dataUrl: "d" }],
      }),
    );
    expect(emptyWithAttachment.status).toBe(200);
  });

  test("streams an error event when the agent fails", async () => {
    const { app, store } = makeApp(failingAgent);
    const session = store.createSession();
    const res = await app.fetch(
      post(`/v1/sessions/${session.id}/messages`, { content: "boom" }),
    );
    const events = parseSse(await res.text());
    expect(events.at(-1)?.event).toBe("error");
    expect((events.at(-1)?.data as { message: string }).message).toBe(
      "agent exploded",
    );
    expect(store.getSession(session.id)?.messages.at(-1)?.status).toBe("error");
  });

  test("edits a message, truncates, and regenerates", async () => {
    const { app, store } = makeApp();
    const session = store.createSession();
    const first = await app.fetch(
      post(`/v1/sessions/${session.id}/messages`, { content: "one" }),
    );
    await first.text();
    const userId = store.getSession(session.id)?.messages[0]?.id as string;
    const res = await app.fetch(
      post(`/v1/sessions/${session.id}/messages/${userId}`, { content: "two" }, "PATCH"),
    );
    const events = parseSse(await res.text());
    expect((events[0]?.data as { content: string }).content).toBe("two");
    expect((events.at(-1)?.data as { content: string }).content).toBe(
      "echo: two",
    );
    expect(store.getSession(session.id)?.messages).toHaveLength(2);
  });

  test("edit validation and not-found", async () => {
    const { app, store } = makeApp();
    const session = store.createSession();
    const invalid = await app.fetch(
      post(`/v1/sessions/${session.id}/messages/ffff`, { content: "" }, "PATCH"),
    );
    expect(invalid.status).toBe(400);
    const missing = await app.fetch(
      post(`/v1/sessions/${session.id}/messages/ffff`, { content: "x" }, "PATCH"),
    );
    expect(missing.status).toBe(404);
  });

  test("toggles reactions", async () => {
    const { app, store } = makeApp();
    const session = store.createSession();
    const msg = store.addMessage(session.id, { role: "user", content: "a" });
    const path = `/v1/sessions/${session.id}/messages/${msg?.id}/reactions`;
    const res = await app.fetch(post(path, { emoji: "🔥" }));
    expect(((await res.json()) as { reactions: object }).reactions).toEqual({
      "🔥": 1,
    });
    expect((await app.fetch(post(path, { emoji: "" }))).status).toBe(400);
    expect(
      (
        await app.fetch(
          post(`/v1/sessions/${session.id}/messages/ffff/reactions`, {
            emoji: "🔥",
          }),
        )
      ).status,
    ).toBe(404);
  });

  test("malformed JSON bodies on edit and reactions return 400", async () => {
    const { app, store } = makeApp();
    const session = store.createSession();
    const raw = (path: string, method: string) =>
      new Request(`http://x${path}`, { method, body: "{" });
    expect(
      (
        await app.fetch(raw(`/v1/sessions/${session.id}/messages/ffff`, "PATCH"))
      ).status,
    ).toBe(400);
    expect(
      (
        await app.fetch(
          raw(`/v1/sessions/${session.id}/messages/ffff/reactions`, "POST"),
        )
      ).status,
    ).toBe(400);
  });

  test("lists anonymous sessions by ids", async () => {
    const { app, store } = makeApp();
    const anonymous = store.createSession();
    const owned = store.createSession("user-1");
    const res = await app.fetch(
      new Request(
        `http://x/v1/sessions?ids=${anonymous.id},${owned.id},zzz,ffff`,
      ),
    );
    const body = (await res.json()) as { sessions: { id: string }[] };
    expect(body.sessions.map((s) => s.id)).toEqual([anonymous.id]);
    const empty = await app.fetch(new Request("http://x/v1/sessions"));
    expect(((await empty.json()) as { sessions: unknown[] }).sessions).toEqual(
      [],
    );
  });

  test("deletes sessions", async () => {
    const { app, store } = makeApp();
    const session = store.createSession();
    const res = await app.fetch(
      new Request(`http://x/v1/sessions/${session.id}`, { method: "DELETE" }),
    );
    expect(await res.json()).toEqual({ deleted: true });
    expect(store.getSession(session.id)).toBeNull();
    const missing = await app.fetch(
      new Request(`http://x/v1/sessions/${session.id}`, { method: "DELETE" }),
    );
    expect(missing.status).toBe(404);
  });

  test("anonymous principals cannot touch user-owned sessions", async () => {
    const { app, store } = makeApp();
    const owned = store.createSession("user-1");
    store.addMessage(owned.id, { role: "user", content: "secret" });
    const messageId = store.getSession(owned.id)?.messages[0]?.id as string;
    const requests = [
      new Request(`http://x/v1/sessions/${owned.id}/messages`),
      post(`/v1/sessions/${owned.id}/messages`, { content: "x" }),
      post(`/v1/sessions/${owned.id}/messages/${messageId}`, { content: "x" }, "PATCH"),
      post(`/v1/sessions/${owned.id}/messages/${messageId}/reactions`, { emoji: "🔥" }),
      new Request(`http://x/v1/sessions/${owned.id}`, { method: "DELETE" }),
    ];
    for (const request of requests) {
      expect((await app.fetch(request)).status).toBe(404);
    }
  });

  test("unmatched chat-shaped routes fall through to 404", async () => {
    const { app, store } = makeApp();
    const session = store.createSession();
    const res = await app.fetch(
      new Request(`http://x/v1/sessions/${session.id}/messages`, {
        method: "DELETE",
      }),
    );
    expect(res.status).toBe(404);
    const getReactions = await app.fetch(
      new Request(`http://x/v1/sessions/${session.id}/messages/ffff/reactions`),
    );
    expect(getReactions.status).toBe(404);
  });
});
