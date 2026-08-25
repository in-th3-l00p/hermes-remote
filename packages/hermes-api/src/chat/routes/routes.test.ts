import { describe, expect, test } from "bun:test";
import { createApp } from "../../index.ts";
import { ChatStore } from "../index.ts";
import type { AgentBackend } from "../index.ts";

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
  const turns = new Map<string, AbortController>();
  const app = createApp({ chat: { store, agent, turns }, anonymous: true });
  return { app, store, turns };
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

  test("stop aborts an in-flight turn and keeps the partial reply", async () => {
    let release: (() => void) | null = null;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const slowAgent: AgentBackend = {
      async *stream(_messages, signal) {
        yield "partial ";
        await gate;
        if (signal?.aborted === true) {
          throw new Error("aborted");
        }
        yield "rest";
      },
    };
    const { app, store } = makeApp(slowAgent);
    const session = store.createSession();
    const pending = Promise.resolve(
      app.fetch(post(`/v1/sessions/${session.id}/messages`, { content: "go" })),
    ).then((res) => res.text());
    await new Promise((r) => setTimeout(r, 20));
    const stop = await app.fetch(post(`/v1/sessions/${session.id}/stop`, {}));
    expect(await stop.json()).toEqual({ stopped: true });
    (release as unknown as () => void)();
    const events = parseSse(await pending);
    expect(events.at(-1)?.event).toBe("done");
    expect((events.at(-1)?.data as { content: string }).content).toBe("partial ");
    expect(store.getSession(session.id)?.messages.at(-1)?.status).toBe("done");
    const idle = await app.fetch(post(`/v1/sessions/${session.id}/stop`, {}));
    expect(await idle.json()).toEqual({ stopped: false });
    const missing = await app.fetch(post("/v1/sessions/ffff/stop", {}));
    expect(missing.status).toBe(404);
  });

  test("a second turn on a busy session returns 409", async () => {
    let release: (() => void) | null = null;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const slowAgent: AgentBackend = {
      async *stream() {
        yield "partial ";
        await gate;
        yield "rest";
      },
    };
    const { app, store } = makeApp(slowAgent);
    const session = store.createSession();
    const pending = Promise.resolve(
      app.fetch(post(`/v1/sessions/${session.id}/messages`, { content: "go" })),
    ).then((res) => res.text());
    await new Promise((r) => setTimeout(r, 20));
    const busy = await app.fetch(
      post(`/v1/sessions/${session.id}/messages`, { content: "again" }),
    );
    expect(busy.status).toBe(409);
    expect(
      ((await busy.json()) as { error: { code: string } }).error.code,
    ).toBe("turn_in_flight");
    (release as unknown as () => void)();
    await pending;
    const after = await app.fetch(
      post(`/v1/sessions/${session.id}/messages`, { content: "free" }),
    );
    expect(after.status).toBe(200);
    await after.text();
  });

  test("client disconnect aborts the turn and keeps the partial reply", async () => {
    let release: (() => void) | null = null;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let seenSignal: AbortSignal | undefined;
    const ignoringAgent: AgentBackend = {
      async *stream(_messages, signal) {
        seenSignal = signal;
        yield "partial ";
        await gate;
        yield "ignored ";
        yield "still ignored";
      },
    };
    const { app, store, turns } = makeApp(ignoringAgent);
    const session = store.createSession();
    const res = await app.fetch(
      post(`/v1/sessions/${session.id}/messages`, { content: "go" }),
    );
    const reader = (res.body as ReadableStream<Uint8Array>).getReader();
    await reader.read();
    await reader.cancel();
    expect(seenSignal?.aborted).toBe(true);
    (release as unknown as () => void)();
    while (turns.size > 0) {
      await new Promise((r) => setTimeout(r, 5));
    }
    const last = store.getSession(session.id)?.messages.at(-1);
    expect(last?.status).toBe("done");
    expect(last?.content).toBe("partial ignored still ignored");
  });

  test("api keys need the right scope per route", async () => {
    const store = new ChatStore(":memory:", () => new Date("2026-08-24T00:00:00Z"));
    const session = store.createSession();
    const record = {
      id: "k1", name: "scopeless", hash: "h", scopes: [] as string[],
      userGrantable: [], createdAt: "t", expiresAt: null, revoked: false,
    };
    const app = createApp({
      chat: { store, agent: echoAgent },
      store: { verifyToken: async () => record },
    });
    const withKey = (path: string, method: string) =>
      new Request(`http://x${path}`, {
        method,
        headers: {
          authorization: "Bearer hk_x",
          "content-type": "application/json",
        },
        body: method === "GET" || method === "DELETE" ? null : "{}",
      });
    const cases: [string, string][] = [
      ["/v1/sessions", "POST"],
      ["/v1/sessions", "GET"],
      [`/v1/sessions/${session.id}`, "DELETE"],
      [`/v1/sessions/${session.id}/stop`, "POST"],
      [`/v1/sessions/${session.id}/messages`, "GET"],
      [`/v1/sessions/${session.id}/messages`, "POST"],
      [`/v1/sessions/${session.id}/messages/ffff`, "PATCH"],
      [`/v1/sessions/${session.id}/messages/ffff/reactions`, "POST"],
    ];
    for (const [path, method] of cases) {
      const res = await app.fetch(withKey(path, method));
      expect(res.status).toBe(403);
      const body = (await res.json()) as { error: { code: string } };
      expect(body.error.code).toBe("missing_scope");
    }
  });

  test("paginates sessions and messages", async () => {
    const { app, store } = makeApp();
    const session = store.createSession();
    for (let i = 0; i < 5; i += 1) {
      store.addMessage(session.id, { role: "user", content: `m${i}` });
    }
    const page = await app.fetch(
      new Request(
        `http://x/v1/sessions/${session.id}/messages?limit=2&offset=1`,
      ),
    );
    const body = (await page.json()) as { messages: { content: string }[]; total: number };
    expect(body.total).toBe(5);
    expect(body.messages.map((m) => m.content)).toEqual(["m1", "m2"]);
    const bad = await app.fetch(
      new Request(
        `http://x/v1/sessions/${session.id}/messages?limit=-1&offset=x`,
      ),
    );
    expect(((await bad.json()) as { messages: unknown[] }).messages).toHaveLength(5);
    const ids = [store.createSession().id, store.createSession().id, session.id];
    const paged = await app.fetch(
      new Request(`http://x/v1/sessions?ids=${ids.join(",")}&limit=2`),
    );
    expect(((await paged.json()) as { sessions: unknown[] }).sessions).toHaveLength(2);
  });

  test("enforces message and attachment limits", async () => {
    const store = new ChatStore(":memory:", () => new Date("2026-08-24T00:00:00Z"));
    const app = createApp({
      chat: { store, agent: echoAgent },
      anonymous: true,
      limits: { maxMessageChars: 5, maxAttachments: 1, maxAttachmentChars: 10 },
    });
    const session = store.createSession();
    const path = `/v1/sessions/${session.id}/messages`;
    expect((await app.fetch(post(path, { content: "toolong" }))).status).toBe(400);
    const attachment = { name: "a", type: "t", dataUrl: "x" };
    expect(
      (
        await app.fetch(
          post(path, { content: "ok", attachments: [attachment, attachment] }),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await app.fetch(
          post(path, {
            content: "ok",
            attachments: [{ ...attachment, dataUrl: "x".repeat(20) }],
          }),
        )
      ).status,
    ).toBe(400);
    const user = store.addMessage(session.id, { role: "user", content: "a" });
    expect(
      (
        await app.fetch(
          post(`${path}/${user?.id}`, { content: "toolong" }, "PATCH"),
        )
      ).status,
    ).toBe(400);
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
