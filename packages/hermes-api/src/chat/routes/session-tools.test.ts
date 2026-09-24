import { describe, expect, test } from "bun:test";
import { createHmac } from "node:crypto";
import { ChatStore } from "../store/index.ts";
import { JwtAuthProvider } from "../../auth/index.ts";
import type { AgentBackend } from "../agent.ts";
import { createApp } from "../../http/app.ts";

const SECRET = "tools-secret";
const agent: AgentBackend = {
  async *stream() {
    yield "ok";
  },
};

function token(sub: string): string {
  const enc = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const head = `${enc({ alg: "HS256", typ: "JWT" })}.${enc({ sub, exp: 4_102_444_800 })}`;
  return `${head}.${createHmac("sha256", SECRET).update(head).digest("base64url")}`;
}

function setup() {
  const store = new ChatStore();
  const app = createApp({
    chat: { store, agent },
    authProvider: new JwtAuthProvider({ hs256Secret: SECRET }),
    anonymous: true,
  });
  const call = (method: string, path: string, who: string | null, body?: unknown) =>
    app.fetch(
      new Request(`http://x${path}`, {
        method,
        headers: {
          ...(who === null ? {} : { authorization: `Bearer ${token(who)}` }),
          ...(body === undefined ? {} : { "content-type": "application/json" }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
    );
  return { store, call };
}

describe("session tools", () => {
  test("rename and archive, with archived sessions listed separately", async () => {
    const { store, call } = setup();
    const s = store.createSession({ userId: "u1" });
    const renamed = await call("PATCH", `/v1/sessions/${s.id}`, "u1", { title: "  Plans  " });
    expect(((await renamed.json()) as { title: string }).title).toBe("Plans");
    await call("PATCH", `/v1/sessions/${s.id}`, "u1", { archived: true });
    const active = (await (await call("GET", "/v1/sessions", "u1")).json()) as {
      sessions: unknown[];
    };
    expect(active.sessions).toEqual([]);
    const archived = (await (await call("GET", "/v1/sessions?archived=true", "u1")).json()) as {
      sessions: { id: string; archived: boolean }[];
    };
    expect(archived.sessions.map((x) => [x.id, x.archived])).toEqual([[s.id, true]]);
    for (const body of [{}, { title: "" }, { title: "x".repeat(121) }, { archived: "yes" }]) {
      expect((await call("PATCH", `/v1/sessions/${s.id}`, "u1", body)).status).toBe(400);
    }
    expect((await call("PATCH", `/v1/sessions/${s.id}`, "u2", { title: "mine" })).status).toBe(404);
    const badJson = await call("PATCH", `/v1/sessions/${s.id}`, "u1");
    expect(badJson.status).toBe(400);
  });

  test("fork copies history up to a message into a session the caller owns", async () => {
    const { store, call } = setup();
    const s = store.createSession({ userId: "u1" });
    store.updateSession(s.id, { title: "Trip" });
    const first = store.addMessage(s.id, { role: "user", content: "one", status: "done" });
    store.addMessage(s.id, { role: "assistant", content: "two", status: "done" });
    store.addMessage(s.id, { role: "user", content: "three", status: "done" });
    const res = await call("POST", `/v1/sessions/${s.id}/fork`, "u1", { messageId: first?.id });
    expect(res.status).toBe(201);
    const fork = (await res.json()) as {
      id: string;
      userId: string;
      title: string;
      messages: { content: string }[];
    };
    expect(fork.userId).toBe("u1");
    expect(fork.title).toBe("Trip (fork)");
    expect(fork.messages.map((m) => m.content)).toEqual(["one"]);
    const whole = (await (await call("POST", `/v1/sessions/${s.id}/fork`, "u1")).json()) as {
      messages: unknown[];
    };
    expect(whole.messages).toHaveLength(3);
    expect(
      (await call("POST", `/v1/sessions/${s.id}/fork`, "u1", { messageId: "ffff" })).status,
    ).toBe(404);
    expect((await call("POST", `/v1/sessions/${s.id}/fork`, "u1", { messageId: 7 })).status).toBe(
      400,
    );
    expect((await call("POST", `/v1/sessions/${s.id}/fork`, "u2")).status).toBe(404);
  });

  test("search finds the caller's own sessions by title or message text", async () => {
    const { store, call } = setup();
    const mine = store.createSession({ userId: "u1" });
    store.addMessage(mine.id, { role: "user", content: "the Launch checklist" });
    const titled = store.createSession({ userId: "u1" });
    store.updateSession(titled.id, { title: "launch notes" });
    const theirs = store.createSession({ userId: "u2" });
    store.addMessage(theirs.id, { role: "user", content: "launch" });
    const found = (await (await call("GET", "/v1/sessions/search?q=LAUNCH", "u1")).json()) as {
      sessions: { id: string }[];
    };
    expect(found.sessions.map((x) => x.id).sort()).toEqual([mine.id, titled.id].sort());
    expect((await call("GET", "/v1/sessions/search", "u1")).status).toBe(400);
    store.addMessage(mine.id, { role: "user", content: "100% done_now" });
    const literal = (await (
      await call("GET", `/v1/sessions/search?q=${encodeURIComponent("100% done_")}`, "u1")
    ).json()) as {
      sessions: { id: string }[];
    };
    expect(literal.sessions.map((x) => x.id)).toEqual([mine.id]);
    const noWildcard = (await (await call("GET", "/v1/sessions/search?q=_", "u1")).json()) as {
      sessions: unknown[];
    };
    expect(noWildcard.sessions).toHaveLength(1);
    const anonymous = (await (await call("GET", "/v1/sessions/search?q=launch", null)).json()) as {
      sessions: unknown[];
    };
    expect(anonymous.sessions).toEqual([]);
  });

  test("export as JSON or Markdown", async () => {
    const { store, call } = setup();
    const s = store.createSession({ userId: "u1" });
    store.addMessage(s.id, { role: "user", content: "hello" });
    store.addMessage(s.id, { role: "assistant", content: "hi there", status: "done" });
    const asJson = await call("GET", `/v1/sessions/${s.id}/export`, "u1");
    expect(asJson.headers.get("content-disposition")).toContain(`session-${s.id}.json`);
    expect(((await asJson.json()) as { messages: unknown[] }).messages).toHaveLength(2);
    const md = await call("GET", `/v1/sessions/${s.id}/export?format=markdown`, "u1");
    const text = await md.text();
    expect(md.headers.get("content-type")).toContain("text/markdown");
    expect(text).toContain("**User**");
    expect(text).toContain("hi there");
    expect((await call("GET", `/v1/sessions/${s.id}/export`, "u2")).status).toBe(404);
  });
});
