import { describe, expect, test } from "bun:test";
import { createHmac } from "node:crypto";
import {
  createApp,
  DemoUpstream,
  HermesUpstreamError,
  JwtAuthProvider,
  RunStore,
  type KeyVerifier,
} from "../../index.ts";
import type { ApiKeyRecord } from "../../auth/index.ts";
import type { Upstream } from "../types.ts";

const SECRET = "sb-secret";

function userToken(sub: string): string {
  const enc = (o: unknown) =>
    Buffer.from(JSON.stringify(o)).toString("base64url");
  const head = enc({ alg: "HS256", typ: "JWT" });
  const body = enc({ sub, exp: Date.now() / 1000 + 600 });
  const sig = createHmac("sha256", SECRET)
    .update(`${head}.${body}`)
    .digest("base64url");
  return `${head}.${body}.${sig}`;
}

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
  return { verifyToken: async (token) => (token === "hk_good" ? record : null) };
}

function demoApp(overrides: Parameters<typeof createApp>[0] = {}) {
  return createApp({
    version: "9.9.9",
    anonymous: true,
    upstream: { upstream: new DemoUpstream() },
    ...overrides,
  });
}

const get = (path: string, token?: string) =>
  new Request(`http://x${path}`, {
    headers: token === undefined ? {} : { authorization: `Bearer ${token}` },
  });

const send = (path: string, body: unknown, method = "POST", token?: string) =>
  new Request(`http://x${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(token === undefined ? {} : { authorization: `Bearer ${token}` }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

describe("discovery routes", () => {
  test("absent without an upstream", async () => {
    const app = createApp({ anonymous: true });
    expect((await app.fetch(get("/v1/health"))).status).toBe(404);
    expect((await app.fetch(get("/v1/capabilities"))).status).toBe(404);
  });

  test("health merges the upstream report", async () => {
    const app = demoApp();
    const res = await app.fetch(get("/v1/health"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      status: "ok",
      version: "9.9.9",
      upstream: { status: "ok", platform: "demo", version: "0.0.0" },
    });
  });

  test("health reports degraded and unreachable upstreams", async () => {
    const demo = new DemoUpstream();
    const degraded = {
      ...demo,
      raw: demo.raw.bind(demo),
      discovery: { ...demo.discovery, health: async () => ({ status: "degraded" }) },
    } as Upstream;
    const degradedApp = demoApp({ upstream: { upstream: degraded } });
    expect(await (await degradedApp.fetch(get("/v1/health"))).json()).toMatchObject(
      { status: "degraded" },
    );
    const unreachable = {
      ...demo,
      raw: demo.raw.bind(demo),
      discovery: {
        ...demo.discovery,
        health: async () => {
          throw new HermesUpstreamError(500, "down");
        },
      },
    } as Upstream;
    const unreachableApp = demoApp({ upstream: { upstream: unreachable } });
    expect(await (await unreachableApp.fetch(get("/v1/health"))).json()).toEqual({
      status: "unreachable",
      version: "9.9.9",
      upstream: null,
    });
  });

  test("capabilities wraps the upstream set", async () => {
    const app = demoApp({
      authProvider: new JwtAuthProvider({ hs256Secret: SECRET }),
    });
    const body = (await (await app.fetch(get("/v1/capabilities"))).json()) as {
      object: string;
      version: string;
      auth: { provider: string | null };
      anonymous: boolean;
      features: Record<string, boolean>;
      upstream: { object: string };
    };
    expect(body.object).toBe("hermes-remote.capabilities");
    expect(body.version).toBe("9.9.9");
    expect(body.auth.provider).toBe("jwt");
    expect(body.anonymous).toBe(true);
    expect(body.features).toEqual({
      chat: true,
      runs: true,
      jobs: true,
      discovery: true,
    });
    expect(body.upstream.object).toBe("demo.capabilities");
    const bare = demoApp();
    const bareBody = (await (await bare.fetch(get("/v1/capabilities"))).json()) as {
      auth: { provider: string | null };
    };
    expect(bareBody.auth.provider).toBeNull();
  });

  test("capabilities tolerates an upstream failure", async () => {
    const demo = new DemoUpstream();
    const failing = {
      ...demo,
      raw: demo.raw.bind(demo),
      discovery: {
        ...demo.discovery,
        capabilities: async () => {
          throw new HermesUpstreamError(500, "down");
        },
      },
    } as Upstream;
    const app = demoApp({ upstream: { upstream: failing } });
    expect(await (await app.fetch(get("/v1/capabilities"))).json()).toMatchObject({
      upstream: null,
    });
  });

  test("models, model options, skills, toolsets proxy the upstream", async () => {
    const app = demoApp();
    expect(await (await app.fetch(get("/v1/models"))).json()).toMatchObject({
      object: "list",
    });
    expect(await (await app.fetch(get("/v1/models/options"))).json()).toEqual({
      options: [],
    });
    expect(await (await app.fetch(get("/v1/skills"))).json()).toEqual({
      object: "list",
      data: [],
    });
    expect(await (await app.fetch(get("/v1/toolsets"))).json()).toEqual({
      object: "list",
      data: [],
    });
  });

  test("discovery enforces scopes on api keys", async () => {
    const app = demoApp({ anonymous: false, store: keyStore(["chat:invoke"]) });
    for (const path of ["/v1/health", "/v1/capabilities", "/v1/models", "/v1/models/options"]) {
      expect((await app.fetch(get(path, "hk_good"))).status).toBe(403);
    }
    expect((await app.fetch(get("/v1/skills", "hk_good"))).status).toBe(403);
    expect((await app.fetch(get("/v1/toolsets", "hk_good"))).status).toBe(403);
    const allowed = demoApp({
      anonymous: false,
      store: keyStore(["status:read", "skills:read", "toolsets:read"]),
    });
    for (const path of ["/v1/health", "/v1/skills", "/v1/toolsets"]) {
      expect((await allowed.fetch(get(path, "hk_good"))).status).toBe(200);
    }
  });
});

describe("run routes", () => {
  test("users own their runs; api keys see everything", async () => {
    const runStore = new RunStore();
    const app = demoApp({
      anonymous: false,
      authProvider: new JwtAuthProvider({ hs256Secret: SECRET }),
      store: keyStore(["chat:invoke"]),
      upstream: { upstream: new DemoUpstream(), runStore },
    });
    const created = await app.fetch(
      send("/v1/runs", { input: "inspect the moon" }, "POST", userToken("u-1")),
    );
    expect(created.status).toBe(201);
    const run = (await created.json()) as { id: string; input: string };
    expect(run.input).toContain("<user-context>");
    expect(run.input).toContain("inspect the moon");

    const mine = (await (
      await app.fetch(get("/v1/runs", userToken("u-1")))
    ).json()) as { runs: { id: string }[] };
    expect(mine.runs.map((r) => r.id)).toEqual([run.id]);
    const theirs = (await (
      await app.fetch(get("/v1/runs", userToken("u-2")))
    ).json()) as { runs: unknown[] };
    expect(theirs.runs).toEqual([]);
    expect(
      (await app.fetch(get(`/v1/runs/${run.id}`, userToken("u-2")))).status,
    ).toBe(404);
    expect(
      (await app.fetch(get(`/v1/runs/${run.id}`, userToken("u-1")))).status,
    ).toBe(200);
    const viaKey = await app.fetch(get(`/v1/runs/${run.id}`, "hk_good"));
    expect(viaKey.status).toBe(200);
    const allRuns = (await (
      await app.fetch(get("/v1/runs", "hk_good"))
    ).json()) as { runs: unknown[] };
    expect(allRuns.runs).toHaveLength(1);
    expect((await app.fetch(get("/v1/runs/unknown", "hk_good"))).status).toBe(404);
  });

  test("api key runs pass through without identity injection", async () => {
    const app = demoApp({ anonymous: false, store: keyStore(["chat:invoke"]) });
    const created = await app.fetch(
      send("/v1/runs", { input: "raw input" }, "POST", "hk_good"),
    );
    expect(((await created.json()) as { input: string }).input).toBe("raw input");
  });

  test("array input gets a prepended system entry", async () => {
    const app = demoApp();
    const created = await app.fetch(
      send("/v1/runs", { input: [{ role: "user", content: "hi" }] }),
    );
    const run = (await created.json()) as {
      input: { role: string; content: string }[];
    };
    expect(run.input[0]?.role).toBe("system");
    expect(run.input[0]?.content).toContain("<user-context>");
    expect(run.input[1]).toEqual({ role: "user", content: "hi" });
  });

  test("events stream through, stop steer and approve proxy", async () => {
    const app = demoApp();
    const created = await app.fetch(send("/v1/runs", { input: "x" }));
    const { id } = (await created.json()) as { id: string };
    const events = await app.fetch(get(`/v1/runs/${id}/events`));
    expect(events.headers.get("content-type")).toBe("text/event-stream");
    expect(await events.text()).toContain("event: run.completed");
    expect(
      ((await (
        await app.fetch(send(`/v1/runs/${id}/steer`, { text: "left" }))
      ).json()) as { steered: boolean }).steered,
    ).toBe(true);
    expect(
      ((await (
        await app.fetch(send(`/v1/runs/${id}/approval`, { approved: true }))
      ).json()) as { approved: boolean }).approved,
    ).toBe(true);
    expect(
      ((await (await app.fetch(send(`/v1/runs/${id}/stop`, {}))).json()) as {
        status: string;
      }).status,
    ).toBe("stopped");
  });

  test("rejects invalid bodies and missing scope", async () => {
    const app = demoApp();
    expect((await app.fetch(send("/v1/runs", "not-an-object"))).status).toBe(400);
    expect(
      (
        await app.fetch(
          new Request("http://x/v1/runs", { method: "POST", body: "{{{" }),
        )
      ).status,
    ).toBe(400);
    const scoped = demoApp({ anonymous: false, store: keyStore(["sessions:read"]) });
    expect((await scoped.fetch(send("/v1/runs", { input: "x" }, "POST", "hk_good"))).status).toBe(403);
  });

  test("maps upstream failures to 502 and missing run ids to 502", async () => {
    const demo = new DemoUpstream();
    const throwing = {
      ...demo,
      raw: demo.raw.bind(demo),
      runs: {
        ...demo.runs,
        create: async () => {
          throw new HermesUpstreamError(503, "busy");
        },
      },
    } as Upstream;
    const app = demoApp({ upstream: { upstream: throwing } });
    const res = await app.fetch(send("/v1/runs", { input: "x" }));
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({
      error: { code: "upstream_error", message: "busy", upstreamStatus: 503 },
    });
    const idless = {
      ...demo,
      raw: demo.raw.bind(demo),
      runs: { ...demo.runs, create: async () => ({ ok: true }) },
    } as Upstream;
    const idlessApp = demoApp({ upstream: { upstream: idless } });
    expect((await idlessApp.fetch(send("/v1/runs", { input: "x" }))).status).toBe(502);
  });
});

describe("job routes", () => {
  const cronKeys = keyStore(["crons:read", "crons:write"]);

  test("api keys with crons scopes get the full lifecycle", async () => {
    const app = demoApp({ anonymous: false, store: cronKeys });
    const created = await app.fetch(
      send("/v1/jobs", { name: "sweep" }, "POST", "hk_good"),
    );
    expect(created.status).toBe(200);
    const { id } = (await created.json()) as { id: string };
    expect(
      ((await (await app.fetch(get("/v1/jobs", "hk_good"))).json()) as {
        jobs: unknown[];
      }).jobs,
    ).toHaveLength(1);
    expect((await app.fetch(get(`/v1/jobs/${id}`, "hk_good"))).status).toBe(200);
    expect(
      (
        await app.fetch(send(`/v1/jobs/${id}`, { name: "renamed" }, "PATCH", "hk_good"))
      ).status,
    ).toBe(200);
    for (const action of ["pause", "resume", "run"]) {
      expect(
        (await app.fetch(send(`/v1/jobs/${id}/${action}`, {}, "POST", "hk_good"))).status,
      ).toBe(200);
    }
    expect(
      (
        await app.fetch(send(`/v1/jobs/${id}`, undefined, "DELETE", "hk_good"))
      ).status,
    ).toBe(200);
    expect((await app.fetch(get(`/v1/jobs/${id}`, "hk_good"))).status).toBe(502);
  });

  test("jobs are api-key only", async () => {
    const app = demoApp({
      authProvider: new JwtAuthProvider({ hs256Secret: SECRET }),
    });
    const asUser = await app.fetch(get("/v1/jobs", userToken("u-1")));
    expect(asUser.status).toBe(403);
    expect(await asUser.json()).toEqual({
      error: {
        code: "api_key_required",
        message: "Jobs are managed with an API key",
      },
    });
    const asAnonymous = await app.fetch(get("/v1/jobs"));
    expect(asAnonymous.status).toBe(403);
  });

  test("jobs enforce read and write scopes", async () => {
    const readOnly = demoApp({ anonymous: false, store: keyStore(["crons:read"]) });
    expect((await readOnly.fetch(get("/v1/jobs", "hk_good"))).status).toBe(200);
    expect(
      (await readOnly.fetch(send("/v1/jobs", { name: "x" }, "POST", "hk_good"))).status,
    ).toBe(403);
    const noScopes = demoApp({ anonymous: false, store: keyStore(["chat:invoke"]) });
    expect((await noScopes.fetch(get("/v1/jobs", "hk_good"))).status).toBe(403);
  });
});
