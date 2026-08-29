import { describe, expect, test } from "bun:test";
import { createApp, DemoUpstream, RunStore, type KeyVerifier } from "../../index.ts";
import type { ApiKeyRecord } from "../../auth/index.ts";
import type { Upstream } from "../types.ts";

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

function demoApp(upstream: Upstream = new DemoUpstream(), runStore = new RunStore()) {
  return createApp({
    anonymous: true,
    upstream: { upstream, runStore, pollMs: 1, toolRunTimeoutMs: 100 },
  });
}

const post = (path: string, body: unknown, token?: string): Request =>
  new Request(`http://x${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token === undefined ? {} : { authorization: `Bearer ${token}` }),
    },
    body: JSON.stringify(body),
  });

describe("media tts", () => {
  test("501 when the upstream has no audio api", async () => {
    const app = demoApp();
    const res = await app.fetch(post("/v1/media/tts", { input: "hi" }));
    expect(res.status).toBe(501);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe(
      "not_supported",
    );
  });

  test("proxies audio when the capability is on", async () => {
    const demo = new DemoUpstream();
    const enabled = {
      ...demo,
      raw: demo.raw.bind(demo),
      discovery: {
        ...demo.discovery,
        capabilities: async () => ({ features: { audio_api: true } }),
      },
    } as Upstream;
    const app = demoApp(enabled);
    const res = await app.fetch(post("/v1/media/tts", { input: "hi" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("audio/mpeg");
    expect(await res.text()).toBe("DEMOAUDIO");
  });
});

describe("tool runs", () => {
  test("web search resolves through a templated run with parsed output", async () => {
    const runStore = new RunStore();
    const app = demoApp(new DemoUpstream(), runStore);
    const res = await app.fetch(post("/v1/web/search", { query: "bun http" }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      runId: string;
      output: { echo: string };
      raw: string;
    };
    expect(body.output.echo).toContain("bun http");
    expect(body.output.echo).toContain("web_search");
    expect(runStore.get(body.runId)).not.toBeNull();
  });

  test("web extract validates urls; images validate prompts", async () => {
    const app = demoApp();
    expect((await app.fetch(post("/v1/web/extract", { url: "ftp://x" }))).status).toBe(400);
    expect((await app.fetch(post("/v1/web/search", {}))).status).toBe(400);
    expect((await app.fetch(post("/v1/media/images", {}))).status).toBe(400);
    const extract = await app.fetch(
      post("/v1/web/extract", { url: "https://bun.sh" }),
    );
    expect(extract.status).toBe(200);
    const images = await app.fetch(
      post("/v1/media/images", { prompt: "a hermes", model: "flux" }),
    );
    const imageBody = (await images.json()) as { output: { echo: string } };
    expect(imageBody.output.echo).toContain("image_gen");
    expect(imageBody.output.echo).toContain("flux");
  });

  test("non-json outputs fall back to raw, failed runs 502, pending runs 504", async () => {
    const demo = new DemoUpstream();
    const rawOutput = {
      ...demo,
      raw: demo.raw.bind(demo),
      runs: {
        ...demo.runs,
        create: async () => ({ id: "r1" }),
        get: async () => ({ status: "completed", output: "plain words" }),
      },
    } as Upstream;
    const res = await demoApp(rawOutput).fetch(
      post("/v1/web/search", { query: "x" }),
    );
    expect(await res.json()).toEqual({
      runId: "r1",
      output: null,
      raw: "plain words",
    });

    const failing = {
      ...demo,
      raw: demo.raw.bind(demo),
      runs: {
        ...demo.runs,
        create: async () => ({ id: "r2" }),
        get: async () => ({ status: "failed" }),
      },
    } as Upstream;
    expect(
      (await demoApp(failing).fetch(post("/v1/web/search", { query: "x" }))).status,
    ).toBe(502);

    const hung = {
      ...demo,
      raw: demo.raw.bind(demo),
      runs: {
        ...demo.runs,
        create: async () => ({ id: "r3" }),
        get: async () => ({ status: "running" }),
      },
    } as Upstream;
    expect(
      (await demoApp(hung).fetch(post("/v1/web/search", { query: "x" }))).status,
    ).toBe(504);

    const idless = {
      ...demo,
      raw: demo.raw.bind(demo),
      runs: { ...demo.runs, create: async () => ({}) },
    } as Upstream;
    expect(
      (await demoApp(idless).fetch(post("/v1/web/search", { query: "x" }))).status,
    ).toBe(502);
  });
});

describe("browser tasks", () => {
  test("creates an owned run", async () => {
    const runStore = new RunStore();
    const app = demoApp(new DemoUpstream(), runStore);
    const res = await app.fetch(
      post("/v1/browser/tasks", { task: "screenshot bun.sh" }),
    );
    expect(res.status).toBe(201);
    const { runId } = (await res.json()) as { runId: string };
    expect(runStore.get(runId)?.principal).toContain("anonymous");
    expect((await app.fetch(post("/v1/browser/tasks", {}))).status).toBe(400);
  });
});

describe("openai passthrough", () => {
  test("api keys pass through verbatim; others are rejected", async () => {
    const app = createApp({
      anonymous: true,
      store: keyStore(["chat:invoke"]),
      upstream: { upstream: new DemoUpstream() },
    });
    const anonymous = await app.fetch(
      post("/v1/chat/completions", { messages: [] }),
    );
    expect(anonymous.status).toBe(403);
    const keyed = await app.fetch(
      post("/v1/chat/completions", { messages: [{ role: "user", content: "hi" }] }, "hk_good"),
    );
    expect(keyed.status).toBe(200);
    const body = (await keyed.json()) as { object: string; echo: unknown };
    expect(body.object).toBe("demo.completion");
    const responses = await app.fetch(
      post("/v1/responses", { input: "x" }, "hk_good"),
    );
    expect(((await responses.json()) as { method: string }).method).toBe("POST");
  });
});
