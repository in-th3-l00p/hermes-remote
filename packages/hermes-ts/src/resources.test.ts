import { describe, expect, test } from "bun:test";
import { HermesClient } from "./client.ts";

interface Recorded {
  method: string;
  path: string;
  body: unknown;
}

function makeClient(
  responder: (path: string) => Response = () => Response.json({ ok: true }),
): { client: HermesClient; calls: Recorded[] } {
  const calls: Recorded[] = [];
  const client = new HermesClient({
    baseUrl: "http://x",
    token: "t",
    fetch: (async (url: string | URL | Request, init?: RequestInit) => {
      const path = String(url).replace("http://x", "");
      calls.push({
        method: init?.method ?? "GET",
        path,
        body:
          init?.body === undefined ? undefined : JSON.parse(String(init?.body)),
      });
      return responder(path);
    }) as unknown as typeof fetch,
  });
  return { client, calls };
}

describe("discovery resource", () => {
  test("maps every method to its route", async () => {
    const { client, calls } = makeClient();
    await client.discovery.health();
    await client.discovery.capabilities();
    await client.discovery.models();
    await client.discovery.modelOptions();
    await client.discovery.skills();
    await client.discovery.toolsets();
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      "GET /v1/health",
      "GET /v1/capabilities",
      "GET /v1/models",
      "GET /v1/models/options",
      "GET /v1/skills",
      "GET /v1/toolsets",
    ]);
  });
});

describe("runs resource", () => {
  test("maps requests and unwraps the list", async () => {
    const { client, calls } = makeClient((path) =>
      path === "/v1/runs" && calls.some((c) => c.method === "GET")
        ? Response.json({ runs: [{ id: "r1" }] })
        : Response.json({ id: "r1" }),
    );
    await client.runs.create({ input: "go" });
    expect(await client.runs.list()).toEqual([{ id: "r1" }]);
    await client.runs.get("r1");
    await client.runs.stop("r1");
    await client.runs.steer("r1", { text: "left" });
    await client.runs.approve("r1", { approved: true });
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      "POST /v1/runs",
      "GET /v1/runs",
      "GET /v1/runs/r1",
      "POST /v1/runs/r1/stop",
      "POST /v1/runs/r1/steer",
      "POST /v1/runs/r1/approval",
    ]);
    expect(calls[0]?.body).toEqual({ input: "go" });
    expect(calls[4]?.body).toEqual({ text: "left" });
  });

  test("streams run events", async () => {
    const { client, calls } = makeClient(
      () =>
        new Response(
          'event: run.started\ndata: {"id":"r1"}\n\n' +
            'event: run.completed\ndata: {"id":"r1"}\n\n',
          { headers: { "content-type": "text/event-stream" } },
        ),
    );
    const events = [];
    for await (const event of client.runs.events("r1")) {
      events.push(event);
    }
    expect(events).toEqual([
      { event: "run.started", data: { id: "r1" } },
      { event: "run.completed", data: { id: "r1" } },
    ]);
    expect(calls[0]?.method).toBe("GET");
    expect(calls[0]?.path).toBe("/v1/runs/r1/events");
  });
});

describe("jobs resource", () => {
  test("maps every method to its route", async () => {
    const { client, calls } = makeClient();
    await client.jobs.list();
    await client.jobs.get("j1");
    await client.jobs.create({ name: "n" });
    await client.jobs.update("j1", { name: "m" });
    await client.jobs.remove("j1");
    await client.jobs.pause("j1");
    await client.jobs.resume("j1");
    await client.jobs.trigger("j1");
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      "GET /v1/jobs",
      "GET /v1/jobs/j1",
      "POST /v1/jobs",
      "PATCH /v1/jobs/j1",
      "DELETE /v1/jobs/j1",
      "POST /v1/jobs/j1/pause",
      "POST /v1/jobs/j1/resume",
      "POST /v1/jobs/j1/run",
    ]);
  });
});
