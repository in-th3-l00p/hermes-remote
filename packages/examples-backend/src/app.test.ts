import { describe, expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HermesUpstreamError } from "@in-th3-l00p/hermes-remote";
import { groqComplete, MAX_OUTPUT_TOKENS } from "./groq.ts";
import { SandboxUpstream } from "./upstream.ts";
import {
  createSandboxApp,
  SANDBOX_KEY_TOKEN,
  stripApiPrefix,
  vercelHandler,
} from "./app.ts";

const chatSse =
  'data: {"choices":[{"delta":{"content":"sandy "}}]}\n\n' +
  'data: {"choices":[{"delta":{"content":"greetings"}}]}\n\n' +
  "data: [DONE]\n\n";

function fakeGroq(): { fetch: typeof fetch; calls: { url: string; body: Record<string, unknown> }[] } {
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  const impl = (async (url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    calls.push({ url: String(url), body });
    if (body["stream"] === true) {
      return new Response(chatSse, {
        headers: { "content-type": "text/event-stream" },
      });
    }
    return Response.json({
      choices: [{ message: { content: "one crisp answer" } }],
    });
  }) as unknown as typeof fetch;
  return { fetch: impl, calls };
}

async function makeApp(withKey = true) {
  const groq = fakeGroq();
  const homeRoot = await mkdtemp(join(tmpdir(), "sandbox-app-"));
  const app = createSandboxApp({
    ...(withKey ? { groqKey: "gsk_test" } : {}),
    fetch: groq.fetch,
    homeRoot,
  });
  return { app, groq, homeRoot };
}

const req = (path: string, method = "GET", body?: unknown, profile?: string) =>
  new Request(`http://sandbox${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...(profile === undefined ? {} : { "x-hermes-profile": profile }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

const keyed = (path: string, method = "GET", body?: unknown, profile?: string) =>
  new Request(`http://sandbox${path}`, {
    method,
    headers: {
      authorization: `Bearer ${SANDBOX_KEY_TOKEN}`,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...(profile === undefined ? {} : { "x-hermes-profile": profile }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

describe("groq", () => {
  test("caps output tokens on streamed chat requests", async () => {
    const { app, groq } = await makeApp();
    const created = await app.fetch(req("/v1/sessions", "POST", {}));
    const { id } = (await created.json()) as { id: string };
    const turn = await app.fetch(
      req(`/v1/sessions/${id}/messages`, "POST", { content: "hello" }),
    );
    const text = await turn.text();
    expect(text).toContain("sandy greetings");
    const chatCall = groq.calls.find((c) => c.body["stream"] === true);
    expect(chatCall?.url).toContain("api.groq.com/openai/v1/chat/completions");
    expect(chatCall?.body["max_tokens"]).toBe(MAX_OUTPUT_TOKENS);
    expect(chatCall?.body["model"]).toBe("openai/gpt-oss-20b");
  });

  test("groqComplete returns content and maps failures", async () => {
    const ok = (async () =>
      Response.json({ choices: [{ message: { content: "done" } }] })) as unknown as typeof fetch;
    expect(await groqComplete("k", ok, "task")).toBe("done");
    const empty = (async () => Response.json({})) as unknown as typeof fetch;
    expect(await groqComplete("k", empty, "task")).toBe("");
    const failing = (async () =>
      new Response("nope", { status: 429 })) as unknown as typeof fetch;
    expect(groqComplete("k", failing, "task")).rejects.toBeInstanceOf(
      HermesUpstreamError,
    );
  });
});

describe("sandbox runs", () => {
  test("keyed runs execute a real completion; events synthesize frames", async () => {
    const { app } = await makeApp();
    const created = await app.fetch(
      req("/v1/runs", "POST", { input: "summarize the sandbox" }),
    );
    expect(created.status).toBe(201);
    const run = (await created.json()) as { id: string; output: string };
    expect(run.output).toBe("one crisp answer");
    const events = await app.fetch(req(`/v1/runs/${run.id}/events`));
    const text = await events.text();
    expect(text).toContain("event: run.started");
    expect(text).toContain("one crisp answer");
    expect(text).toContain("event: run.completed");
    expect(
      ((await (await app.fetch(req(`/v1/runs/${run.id}/stop`, "POST", {}))).json()) as {
        status: string;
      }).status,
    ).toBe("stopped");
    expect(
      (await app.fetch(req(`/v1/runs/${run.id}/steer`, "POST", { text: "x" }))).status,
    ).toBe(200);
    expect(
      (await app.fetch(req(`/v1/runs/${run.id}/approval`, "POST", {}))).status,
    ).toBe(200);
    expect((await app.fetch(req("/v1/runs/ghost"))).status).toBe(404);
  });

  test("keyless runs fall back to demo output", async () => {
    const { app } = await makeApp(false);
    const created = await app.fetch(req("/v1/runs", "POST", { input: "hi" }));
    const run = (await created.json()) as { output: string };
    expect(run.output).toContain("sandbox demo run");
  });
});

describe("discovery and raw", () => {
  test("fixtures name the live model when keyed, demo otherwise", async () => {
    const { app } = await makeApp();
    const health = (await (await app.fetch(req("/v1/health"))).json()) as {
      upstream: { model: string };
    };
    expect(health.upstream.model).toBe("openai/gpt-oss-20b");
    const models = (await (await app.fetch(req("/v1/models"))).json()) as {
      data: { id: string }[];
    };
    expect(models.data[0]?.id).toBe("openai/gpt-oss-20b");
    const { app: keyless } = await makeApp(false);
    const demoModels = (await (
      await keyless.fetch(req("/v1/models"))
    ).json()) as { data: { id: string }[] };
    expect(demoModels.data[0]?.id).toBe("demo");
    expect(
      ((await (await app.fetch(req("/v1/skills"))).json()) as { data: unknown[] })
        .data,
    ).toHaveLength(2);
    expect(
      ((await (await app.fetch(req("/v1/toolsets"))).json()) as {
        data: unknown[];
      }).data,
    ).toHaveLength(2);
    expect((await app.fetch(req("/v1/models/options"))).status).toBe(200);
    const caps = (await (await app.fetch(req("/v1/capabilities"))).json()) as {
      upstream: { features: { sandbox: boolean } };
    };
    expect(caps.upstream.features.sandbox).toBe(true);
  });

  test("raw passthrough hits groq when keyed and demo when not", async () => {
    const upstream = new SandboxUpstream({
      groqKey: "gsk",
      fetch: fakeGroq().fetch,
    });
    const keyed = await upstream.raw("POST", "/v1/chat/completions", {
      messages: [],
    });
    expect(keyed.status).toBe(200);
    const keyless = new SandboxUpstream({});
    const demo = await keyless.raw("POST", "/v1/responses", { input: "x" });
    expect(((await demo.json()) as { object: string }).object).toBe(
      "demo.completion",
    );
    expect((await keyless.raw("GET", "/v1/other")).status).toBe(404);
  });

  test("seeded jobs and sessions are visible", async () => {
    const upstream = new SandboxUpstream({});
    await Bun.sleep(1);
    const jobs = (await upstream.jobs.list()) as { jobs: { name: string }[] };
    expect(jobs.jobs.map((j) => j.name)).toContain("morning-briefing");
    const sessions = (await upstream.sessions.list()) as {
      sessions: unknown[];
    };
    expect(sessions.sessions).toHaveLength(1);
  });
});

describe("sandbox management", () => {
  test("profiles list and per-profile soul/memory differ", async () => {
    const { app } = await makeApp();
    const profiles = (await (await app.fetch(req("/v1/profiles"))).json()) as {
      profiles: { name: string }[];
    };
    expect(profiles.profiles.map((p) => p.name)).toEqual([
      "default",
      "atlas",
      "nova",
    ]);
    const atlasSoul = (await (
      await app.fetch(keyed("/v1/soul", "GET", undefined, "atlas"))
    ).json()) as { content: string };
    const novaSoul = (await (
      await app.fetch(keyed("/v1/soul", "GET", undefined, "nova"))
    ).json()) as { content: string };
    expect(atlasSoul.content).toContain("Atlas");
    expect(novaSoul.content).toContain("Nova");
    const memory = (await (
      await app.fetch(keyed("/v1/memory", "GET", undefined, "atlas"))
    ).json()) as { content: string };
    expect(memory.content).toContain("research");
    expect((await app.fetch(req("/v1/soul"))).status).toBe(403);
    expect(
      (await app.fetch(keyed("/v1/agent/pause", "POST"))).status,
    ).toBe(403);
    const status = (await (
      await app.fetch(keyed("/v1/agent/status"))
    ).json()) as { raw: string };
    expect(status.raw).toContain("Sandbox");
  });
});

describe("vercel wiring", () => {
  test("stripApiPrefix rewrites only prefixed paths", () => {
    expect(
      new URL(stripApiPrefix(new Request("http://x/api/hermes/v1/status")).url)
        .pathname,
    ).toBe("/v1/status");
    expect(
      new URL(stripApiPrefix(new Request("http://x/api/hermes")).url).pathname,
    ).toBe("/");
    expect(
      new URL(stripApiPrefix(new Request("http://x/v1/status")).url).pathname,
    ).toBe("/v1/status");
  });

  test("vercelHandler lazily builds one app and forwards the client ip", async () => {
    const homeRoot = await mkdtemp(join(tmpdir(), "sandbox-fn-"));
    const handler = vercelHandler({ homeRoot, fetch: fakeGroq().fetch });
    const res = await handler(
      new Request("http://x/api/hermes/v1/status", {
        headers: { "x-forwarded-for": "9.9.9.9, 10.0.0.1" },
      }),
    );
    expect(await res.json()).toEqual({ ok: true, version: "sandbox" });
    const again = await handler(new Request("http://x/api/hermes/v1/status"));
    expect(again.status).toBe(200);
  });
});
