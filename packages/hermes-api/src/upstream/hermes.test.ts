import { describe, expect, test } from "bun:test";
import { HermesUpstream } from "./hermes.ts";
import { HermesAgent, HermesUpstreamError } from "../chat/index.ts";

interface Recorded {
  method: string;
  path: string;
  auth: string | null;
  body: unknown;
}

function fakeFetch(
  responder: (path: string, init: RequestInit) => Response,
  calls: Recorded[],
): typeof fetch {
  return (async (url: string | URL | Request, init?: RequestInit) => {
    const path = String(url).replace("http://up", "");
    const headers = new Headers(init?.headers);
    calls.push({
      method: init?.method ?? "GET",
      path,
      auth: headers.get("authorization"),
      body: init?.body === undefined ? undefined : JSON.parse(String(init?.body)),
    });
    return responder(path, init ?? {});
  }) as unknown as typeof fetch;
}

function upstreamWith(
  responder: (path: string, init: RequestInit) => Response,
  calls: Recorded[] = [],
): HermesUpstream {
  return new HermesUpstream({
    baseUrl: "http://up/",
    apiKey: "sekrit",
    fetch: fakeFetch(responder, calls),
  });
}

describe("HermesUpstream", () => {
  test("chat is a HermesAgent", () => {
    const upstream = upstreamWith(() => Response.json({}));
    expect(upstream.chat).toBeInstanceOf(HermesAgent);
  });

  test("discovery maps to the gateway endpoints with auth", async () => {
    const calls: Recorded[] = [];
    const upstream = upstreamWith((path) => Response.json({ path }), calls);
    expect(await upstream.discovery.health()).toEqual({ path: "/health/detailed" });
    expect(await upstream.discovery.capabilities()).toEqual({
      path: "/v1/capabilities",
    });
    expect(await upstream.discovery.models()).toEqual({ path: "/v1/models" });
    expect(await upstream.discovery.modelOptions()).toEqual({
      path: "/api/model/options",
    });
    expect(await upstream.discovery.skills()).toEqual({ path: "/v1/skills" });
    expect(await upstream.discovery.toolsets()).toEqual({ path: "/v1/toolsets" });
    expect(calls.every((c) => c.method === "GET")).toBe(true);
    expect(calls.every((c) => c.auth === "Bearer sekrit")).toBe(true);
  });

  test("health falls back to /health when detailed fails", async () => {
    const calls: Recorded[] = [];
    const upstream = upstreamWith(
      (path) =>
        path === "/health/detailed"
          ? Response.json({ error: "nope" }, { status: 403 })
          : Response.json({ status: "ok" }),
      calls,
    );
    expect(await upstream.discovery.health()).toEqual({ status: "ok" });
    expect(calls.map((c) => c.path)).toEqual(["/health/detailed", "/health"]);
  });

  test("runs map to the run endpoints", async () => {
    const calls: Recorded[] = [];
    const upstream = upstreamWith((path) => Response.json({ path }), calls);
    await upstream.runs.create({ input: "go" });
    await upstream.runs.get("r1");
    await upstream.runs.stop("r1");
    await upstream.runs.steer("r1", { text: "left" });
    await upstream.runs.approve("r1", { approved: false });
    expect(calls).toEqual([
      { method: "POST", path: "/v1/runs", auth: "Bearer sekrit", body: { input: "go" } },
      { method: "GET", path: "/v1/runs/r1", auth: "Bearer sekrit", body: undefined },
      { method: "POST", path: "/v1/runs/r1/stop", auth: "Bearer sekrit", body: {} },
      { method: "POST", path: "/v1/runs/r1/steer", auth: "Bearer sekrit", body: { text: "left" } },
      { method: "POST", path: "/v1/runs/r1/approval", auth: "Bearer sekrit", body: { approved: false } },
    ]);
  });

  test("run events return the raw body stream", async () => {
    const upstream = upstreamWith((path) =>
      path === "/v1/runs/r1/events"
        ? new Response("event: run.started\ndata: {}\n\n", {
            headers: { "content-type": "text/event-stream" },
          })
        : Response.json({}),
    );
    const stream = await upstream.runs.events("r1");
    const text = await new Response(stream).text();
    expect(text).toContain("run.started");
  });

  test("run events reject on failure or missing body", async () => {
    const failing = upstreamWith(() => Response.json({}, { status: 500 }));
    expect(failing.runs.events("r1")).rejects.toBeInstanceOf(HermesUpstreamError);
    const empty = upstreamWith(() => new Response(null, { status: 200 }));
    expect(empty.runs.events("r1")).rejects.toBeInstanceOf(HermesUpstreamError);
  });

  test("jobs map to the /api/jobs endpoints", async () => {
    const calls: Recorded[] = [];
    const upstream = upstreamWith((path) => Response.json({ path }), calls);
    await upstream.jobs.list();
    await upstream.jobs.get("j1");
    await upstream.jobs.create({ name: "n" });
    await upstream.jobs.update("j1", { name: "m" });
    await upstream.jobs.remove("j1");
    await upstream.jobs.pause("j1");
    await upstream.jobs.resume("j1");
    await upstream.jobs.trigger("j1");
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      "GET /api/jobs",
      "GET /api/jobs/j1",
      "POST /api/jobs",
      "PATCH /api/jobs/j1",
      "DELETE /api/jobs/j1",
      "POST /api/jobs/j1/pause",
      "POST /api/jobs/j1/resume",
      "POST /api/jobs/j1/run",
    ]);
  });

  test("maps upstream failures to HermesUpstreamError with the message", async () => {
    const upstream = upstreamWith(() =>
      Response.json({ error: { message: "jobs admin disabled" } }, { status: 403 }),
    );
    const error = await upstream.jobs.list().then(
      () => null,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(HermesUpstreamError);
    expect((error as HermesUpstreamError).status).toBe(403);
    expect((error as HermesUpstreamError).message).toBe("jobs admin disabled");
  });

  test("falls back to a generic message on unparseable errors", async () => {
    const upstream = upstreamWith(() => new Response("boom", { status: 500 }));
    const error = await upstream.discovery.models().then(
      () => null,
      (e: unknown) => e,
    );
    expect((error as HermesUpstreamError).message).toBe(
      "Hermes upstream returned 500",
    );
  });

  test("sessions map to the /api/sessions endpoints", async () => {
    const calls: Recorded[] = [];
    const upstream = upstreamWith((path) => Response.json({ path }), calls);
    await upstream.sessions.list();
    await upstream.sessions.create({ title: "t" });
    await upstream.sessions.get("s1");
    await upstream.sessions.update("s1", { title: "u" });
    await upstream.sessions.remove("s1");
    await upstream.sessions.messages("s1");
    await upstream.sessions.fork("s1", { title: "f" });
    await upstream.sessions.chat("s1", { message: "hi" });
    await upstream.sessions.modelLock("s1", { model: "m" });
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      "GET /api/sessions",
      "POST /api/sessions",
      "GET /api/sessions/s1",
      "PATCH /api/sessions/s1",
      "DELETE /api/sessions/s1",
      "GET /api/sessions/s1/messages",
      "POST /api/sessions/s1/fork",
      "POST /api/sessions/s1/chat",
      "POST /api/sessions/s1/model",
    ]);
    expect(calls.every((c) => c.auth === "Bearer sekrit")).toBe(true);
  });

  test("session chat stream returns the raw body stream", async () => {
    const calls: Recorded[] = [];
    const upstream = upstreamWith(
      (path) =>
        path === "/api/sessions/s1/chat/stream"
          ? new Response("event: message.delta\ndata: {}\n\n", {
              headers: { "content-type": "text/event-stream" },
            })
          : Response.json({}),
      calls,
    );
    const controller = new AbortController();
    const stream = await upstream.sessions.chatStream(
      "s1",
      { message: "hi" },
      controller.signal,
    );
    const text = await new Response(stream).text();
    expect(text).toContain("message.delta");
    expect(calls).toEqual([
      {
        method: "POST",
        path: "/api/sessions/s1/chat/stream",
        auth: "Bearer sekrit",
        body: { message: "hi" },
      },
    ]);
  });

  test("session chat stream rejects on failure or missing body", async () => {
    const failing = upstreamWith(() => Response.json({}, { status: 500 }));
    expect(
      failing.sessions.chatStream("s1", { message: "x" }),
    ).rejects.toBeInstanceOf(HermesUpstreamError);
    const empty = upstreamWith(() => new Response(null, { status: 200 }));
    expect(
      empty.sessions.chatStream("s1", { message: "x" }),
    ).rejects.toBeInstanceOf(HermesUpstreamError);
  });

  test("raw forwards method, path, body, auth, and signal", async () => {
    const calls: Recorded[] = [];
    const upstream = upstreamWith(
      () => Response.json({ ok: true }, { status: 418 }),
      calls,
    );
    const withBody = await upstream.raw("POST", "/v1/audio/speech", { input: "x" });
    expect(withBody.status).toBe(418);
    expect(await withBody.json()).toEqual({ ok: true });
    const controller = new AbortController();
    await upstream.raw("GET", "/v1/models", undefined, controller.signal);
    expect(calls).toEqual([
      {
        method: "POST",
        path: "/v1/audio/speech",
        auth: "Bearer sekrit",
        body: { input: "x" },
      },
      { method: "GET", path: "/v1/models", auth: "Bearer sekrit", body: undefined },
    ]);
  });

  test("uses the real fetch by default", () => {
    const upstream = new HermesUpstream({ baseUrl: "http://127.0.0.1:1", apiKey: "k" });
    expect(upstream.discovery.models()).rejects.toBeDefined();
  });
});
