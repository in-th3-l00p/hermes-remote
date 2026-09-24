import { describe, expect, test } from "bun:test";
import type { ApiKeyRecord } from "../auth/index.ts";
import type { AgentBackend } from "../chat/index.ts";
import { ChatStore } from "../chat/store/index.ts";
import { createApp } from "../http/app.ts";
import { Metrics } from "./index.ts";

const record: ApiKeyRecord = {
  id: "ops",
  name: "ops",
  hash: "h",
  scopes: ["status:read", "chat:invoke", "sessions:write"],
  userGrantable: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  expiresAt: null,
  revoked: false,
};

describe("metrics", () => {
  test("renders counters, histograms and gauges in Prometheus format", () => {
    const m = new Metrics();
    m.count("jobs_total", "Jobs", { kind: 'a"b' });
    m.count("jobs_total", "Jobs", { kind: 'a"b' }, 2);
    m.observe("latency_seconds", "Latency", {}, 0.2);
    m.gauge("depth", "Queue depth", () => 7);
    const text = m.render();
    expect(text).toContain('jobs_total{kind="a\\"b"} 3');
    expect(text).toContain('latency_seconds_bucket{le="0.1"} 0');
    expect(text).toContain('latency_seconds_bucket{le="0.25"} 1');
    expect(text).toContain('latency_seconds_bucket{le="+Inf"} 1');
    expect(text).toContain("latency_seconds_count{} 1");
    expect(text).toContain("# TYPE depth gauge\ndepth 7");
  });

  test("/v1/metrics reports requests by route pattern and chat turn outcomes", async () => {
    let fail = false;
    const agent: AgentBackend = {
      async *stream() {
        if (fail) {
          throw new Error("upstream down");
        }
        yield "ok";
      },
    };
    const store = new ChatStore();
    const app = createApp({
      store: { verifyToken: async (t) => (t === "hk_ops" ? record : null) },
      chat: { store, agent, turns: new Map() },
    });
    const call = (method: string, path: string, body?: unknown) =>
      app.fetch(
        new Request(`http://x${path}`, {
          method,
          headers: {
            authorization: "Bearer hk_ops",
            ...(body === undefined ? {} : { "content-type": "application/json" }),
          },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        }),
      );
    const session = (await (await call("POST", "/v1/sessions")).json()) as { id: string };
    await (await call("POST", `/v1/sessions/${session.id}/messages`, { content: "hi" })).text();
    fail = true;
    await (await call("POST", `/v1/sessions/${session.id}/messages`, { content: "again" })).text();
    await app.fetch(new Request("http://x/v1/sessions"));
    const res = await call("GET", "/v1/metrics");
    expect(res.headers.get("content-type")).toContain("text/plain");
    const text = await res.text();
    expect(text).toContain(
      'hermes_http_requests_total{method="POST",route="/v1/sessions/:id{[0-9a-f]+}/messages",status="200"} 2',
    );
    expect(text).toContain('status="401"');
    expect(text).not.toContain(session.id);
    expect(text).toContain('hermes_chat_turns_total{outcome="completed"} 1');
    expect(text).toContain('hermes_chat_turns_total{outcome="failed"} 1');
    expect(text).toContain("hermes_chat_turns_in_flight 0");
    const withoutChat = createApp({ store: { verifyToken: async () => record } });
    const plain = await withoutChat.fetch(
      new Request("http://x/v1/metrics", { headers: { authorization: "Bearer hk_ops" } }),
    );
    expect(await plain.text()).toContain("hermes_chat_turns_in_flight 0");
  });
});
