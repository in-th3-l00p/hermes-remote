import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FakeCliBridge } from "../bridge/index.ts";
import {
  createApp,
  DemoUpstream,
  EventBus,
  ProfileRegistry,
  toGoalState,
  type KeyVerifier,
} from "../index.ts";
import type { ApiKeyRecord } from "../auth/index.ts";

function keyStore(scopes: string[]): KeyVerifier {
  const record: ApiKeyRecord = {
    id: "abc123",
    name: "ops",
    hash: "h",
    scopes,
    userGrantable: [],
    createdAt: "2026-08-23T00:00:00.000Z",
    expiresAt: null,
    revoked: false,
  };
  return { verifyToken: async (t) => (t === "hk_good" ? record : null) };
}

async function makeApp(scopes: string[], commandRelay = true) {
  const home = await mkdtemp(join(tmpdir(), "hermes-agent-home-"));
  const fake = new FakeCliBridge();
  const events = new EventBus(() => new Date("2026-08-24T00:00:00Z"));
  const app = createApp({
    store: keyStore(scopes),
    commandRelay,
    events,
    eventsHeartbeatMs: 40,
    upstream: { upstream: new DemoUpstream() },
    management: {
      cli: fake,
      profiles: new ProfileRegistry({ cli: fake, homeFor: (n) => `${home}-${n}` }),
      homeFor: () => home,
    },
  });
  return { app, home, events };
}

const req = (path: string, method = "GET", body?: unknown): Request =>
  new Request(`http://x${path}`, {
    method,
    headers: {
      authorization: "Bearer hk_good",
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

describe("agent session routes", () => {
  test("full crud, messages, fork, model lock, chat", async () => {
    const { app } = await makeApp([
      "sessions:read-all",
      "sessions:write-all",
      "chat:invoke",
    ]);
    const created = await app.fetch(
      req("/v1/agent/sessions", "POST", { title: "ops" }),
    );
    expect(created.status).toBe(200);
    const { session } = (await created.json()) as { session: { id: string } };
    expect(
      ((await (await app.fetch(req("/v1/agent/sessions"))).json()) as {
        sessions: unknown[];
      }).sessions,
    ).toHaveLength(1);
    expect(
      (await app.fetch(req(`/v1/agent/sessions/${session.id}`))).status,
    ).toBe(200);
    await app.fetch(
      req(`/v1/agent/sessions/${session.id}`, "PATCH", { title: "renamed" }),
    );
    await app.fetch(
      req(`/v1/agent/sessions/${session.id}/model`, "POST", { model: "demo" }),
    );
    const chat = await app.fetch(
      req(`/v1/agent/sessions/${session.id}/chat`, "POST", { message: "hi" }),
    );
    expect(await chat.json()).toEqual({ output: "demo: hi" });
    const stream = await app.fetch(
      req(`/v1/agent/sessions/${session.id}/chat/stream`, "POST", {
        message: "yo",
      }),
    );
    expect(stream.headers.get("content-type")).toBe("text/event-stream");
    expect(await stream.text()).toContain("run.completed");
    const messages = (await (
      await app.fetch(req(`/v1/agent/sessions/${session.id}/messages`))
    ).json()) as { messages: unknown[] };
    expect(messages.messages.length).toBeGreaterThan(2);
    const forked = await app.fetch(
      req(`/v1/agent/sessions/${session.id}/fork`, "POST", {}),
    );
    expect(forked.status).toBe(200);
    expect(
      (await app.fetch(req(`/v1/agent/sessions/${session.id}`, "DELETE"))).status,
    ).toBe(200);
    expect(
      (await app.fetch(req("/v1/agent/sessions/missing"))).status,
    ).toBe(502);
  });

  test("agent sessions are api-key territory", async () => {
    const { app } = await makeApp(["chat:invoke"]);
    expect((await app.fetch(req("/v1/agent/sessions"))).status).toBe(403);
  });
});

describe("commands", () => {
  test("catalog lists commands with scopes", async () => {
    const { app } = await makeApp(["status:read"]);
    const res = await app.fetch(req("/v1/commands"));
    const body = (await res.json()) as {
      relay: boolean;
      commands: { command: string; scope: string }[];
    };
    expect(body.relay).toBe(true);
    expect(body.commands).toContainEqual({
      command: "/goal",
      scope: "goals:write",
    });
  });

  test("relays allowlisted commands and rejects unknown ones", async () => {
    const { app, events } = await makeApp([
      "sessions:write-all",
      "goals:write",
      "status:read",
    ]);
    const collected: string[] = [];
    const subscription = (async () => {
      for await (const event of events.subscribe(AbortSignal.timeout(500))) {
        collected.push(event.type);
        if (event.type === "command") {
          break;
        }
      }
    })();
    const created = await app.fetch(
      req("/v1/agent/sessions", "POST", { title: "cmd" }),
    );
    const { session } = (await created.json()) as { session: { id: string } };
    const relayed = await app.fetch(
      req(`/v1/agent/sessions/${session.id}/commands`, "POST", {
        command: "/goal status",
      }),
    );
    expect(relayed.status).toBe(200);
    const body = (await relayed.json()) as {
      ok: boolean;
      events: { event: string }[];
    };
    expect(body.ok).toBe(true);
    expect(body.events.map((e) => e.event)).toContain("run.completed");
    await subscription;
    expect(collected).toContain("command");

    expect(
      (
        await app.fetch(
          req(`/v1/agent/sessions/${session.id}/commands`, "POST", {
            command: "/format c:",
          }),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await app.fetch(
          req(`/v1/agent/sessions/${session.id}/commands`, "POST", {
            command: "goal",
          }),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await app.fetch(
          req(`/v1/agent/sessions/${session.id}/commands`, "POST", {
            command: "/model gpt",
          }),
        )
      ).status,
    ).toBe(403);
  });

  test("relay disabled returns 501", async () => {
    const { app } = await makeApp(["goals:write", "sessions:write-all"], false);
    const created = await app.fetch(
      req("/v1/agent/sessions", "POST", { title: "off" }),
    );
    const { session } = (await created.json()) as { session: { id: string } };
    expect(
      (
        await app.fetch(
          req(`/v1/agent/sessions/${session.id}/commands`, "POST", {
            command: "/goal status",
          }),
        )
      ).status,
    ).toBe(501);
  });
});

describe("goals", () => {
  test("goal state reads from the profile state db", async () => {
    const { app, home } = await makeApp(["goals:read"]);
    expect(
      (await app.fetch(req("/v1/agent/sessions/sess1/goal"))).status,
    ).toBe(404);
    const db = new Database(join(home, "state.db"));
    db.run("CREATE TABLE state_meta (key TEXT PRIMARY KEY, value TEXT)");
    db.query("INSERT INTO state_meta (key, value) VALUES (?, ?)").run(
      "goal:sess1",
      JSON.stringify({
        text: "ship the release",
        contract: { outcome: "tag pushed" },
        subgoals: ["tests green"],
        gates: [{ command: "bun test", passing: false }, "bun lint"],
        turns_used: 3,
        max_turns: 20,
        verdict: "continue",
      }),
    );
    db.close();
    const res = await app.fetch(req("/v1/agent/sessions/sess1/goal"));
    expect(res.status).toBe(200);
    const goal = (await res.json()) as Record<string, unknown>;
    expect(goal["text"]).toBe("ship the release");
    expect(goal["contract"]).toEqual({ outcome: "tag pushed" });
    expect(goal["subgoals"]).toEqual(["tests green"]);
    expect(goal["gates"]).toEqual([
      { command: "bun test", passing: false },
      { command: "bun lint", passing: null },
    ]);
    expect(goal["turns"]).toEqual({ used: 3, max: 20 });
    expect(goal["verdict"]).toBe("continue");
    expect(
      await (
        await app.fetch(req("/v1/agent/sessions/sess1/goal/gates"))
      ).json(),
    ).toEqual({ gates: [
      { command: "bun test", passing: false },
      { command: "bun lint", passing: null },
    ] });
    expect(
      await (
        await app.fetch(req("/v1/agent/sessions/sess1/goal/subgoals"))
      ).json(),
    ).toEqual({ subgoals: ["tests green"] });
    expect(
      await (
        await app.fetch(req("/v1/agent/sessions/ghost/goal/gates"))
      ).json(),
    ).toEqual({ gates: [] });
  });

  test("goal mutations relay slash commands", async () => {
    const { app } = await makeApp(["goals:write", "sessions:write-all"]);
    const created = await app.fetch(
      req("/v1/agent/sessions", "POST", { title: "loop" }),
    );
    const { session } = (await created.json()) as { session: { id: string } };
    const base = `/v1/agent/sessions/${session.id}/goal`;
    const cases: [string, string, unknown?][] = [
      ["PUT", base, { text: "finish the report" }],
      ["PUT", base, { text: "finish", draft: true }],
      ["DELETE", base],
      ["POST", `${base}/pause`],
      ["POST", `${base}/resume`],
      ["POST", `${base}/wait`, { pid: 123, reason: "compile" }],
      ["POST", `${base}/unwait`],
      ["POST", `${base}/gates`, { command: "bun test" }],
      ["DELETE", `${base}/gates/2`],
      ["DELETE", `${base}/gates`],
      ["POST", `${base}/subgoals`, { text: "polish docs" }],
      ["DELETE", `${base}/subgoals/1`],
      ["DELETE", `${base}/subgoals`],
    ];
    for (const [method, path, body] of cases) {
      const res = await app.fetch(req(path, method, body));
      expect(`${method} ${path} ${res.status}`).toBe(`${method} ${path} 200`);
    }
    expect((await app.fetch(req(base, "PUT", {}))).status).toBe(400);
    expect(
      (await app.fetch(req(`${base}/wait`, "POST", {}))).status,
    ).toBe(400);
    expect(
      (await app.fetch(req(`${base}/gates`, "POST", {}))).status,
    ).toBe(400);
    expect(
      (await app.fetch(req(`${base}/subgoals`, "POST", {}))).status,
    ).toBe(400);
  });

  test("toGoalState tolerates junk", () => {
    expect(toGoalState("just text")).toMatchObject({
      text: null,
      subgoals: [],
      gates: [],
      turns: null,
    });
    expect(toGoalState({ goal: "alt field", gates: [7] })).toMatchObject({
      text: "alt field",
      gates: [{ command: "", passing: null }],
    });
  });
});

describe("events stream", () => {
  test("streams published events with heartbeats", async () => {
    const { app, events } = await makeApp(["events:subscribe"]);
    const controller = new AbortController();
    const resPromise = app.fetch(
      new Request("http://x/v1/events", {
        headers: { authorization: "Bearer hk_good" },
        signal: controller.signal,
      }),
    );
    const res = await resPromise;
    expect(res.headers.get("content-type")).toBe("text/event-stream");
    const reader = (res.body as ReadableStream<Uint8Array>).getReader();
    setTimeout(() => events.publish("run.created", { id: "r9" }), 10);
    let text = "";
    const decoder = new TextDecoder();
    while (!text.includes("run.created") || !text.includes(": heartbeat")) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      text += decoder.decode(value, { stream: true });
    }
    expect(text).toContain("event: run.created");
    expect(text).toContain('"id":"r9"');
    expect(text).toContain(": heartbeat");
    controller.abort();
    await reader.cancel().catch(() => {});
  });
});
