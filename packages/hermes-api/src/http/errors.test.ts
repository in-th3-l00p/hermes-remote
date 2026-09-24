import { describe, expect, spyOn, test } from "bun:test";
import { HTTPException } from "hono/http-exception";
import { BridgeDenied, FakeCliBridge, HermesCliBridge } from "../bridge/index.ts";
import { HermesUpstreamError } from "../chat/index.ts";
import type { ApiKeyRecord, KeyVerifier } from "../auth/index.ts";
import { ProfileRegistry } from "../profiles/registry.ts";
import { DemoUpstream } from "../upstream/demo.ts";
import { createApp } from "./app.ts";

const record: ApiKeyRecord = {
  id: "ops",
  name: "ops",
  hash: "h",
  scopes: ["status:read", "memory:read"],
  userGrantable: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  expiresAt: null,
  revoked: false,
};
const store: KeyVerifier = { verifyToken: async () => record };
const get = (path: string) =>
  new Request(`http://x${path}`, { headers: { authorization: "Bearer hk_ops" } });

/** An app whose /v1/models handler throws `cause`. */
function throwingApp(cause: unknown) {
  const upstream = new DemoUpstream();
  Object.defineProperty(upstream, "discovery", {
    value: {
      ...upstream.discovery,
      models: async () => {
        throw cause;
      },
    },
  });
  return createApp({ store, upstream: { upstream } });
}

describe("error envelope", () => {
  test("upstream errors that escape a route become 502 upstream_error", async () => {
    const res = await throwingApp(new HermesUpstreamError(504, "slow")).fetch(
      get("/v1/models"),
    );
    // proxy() maps this itself; a raw escape goes through onError the same way.
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({
      error: { code: "upstream_error", message: "slow", upstreamStatus: 504 },
    });
  });

  test("an unreachable upstream on an unwrapped call is 502, not a crash", async () => {
    const upstream = new DemoUpstream();
    Object.defineProperty(upstream, "discovery", {
      value: {
        ...upstream.discovery,
        capabilities: async () => ({ features: { audio_api: true } }),
      },
    });
    upstream.raw = async () => {
      throw new HermesUpstreamError(502, "Hermes upstream is unreachable");
    };
    const app = createApp({
      store: { verifyToken: async () => ({ ...record, scopes: ["chat:invoke"] }) },
      upstream: { upstream },
    });
    const res = await app.fetch(
      new Request("http://x/v1/media/tts", {
        method: "POST",
        headers: { authorization: "Bearer hk_ops", "content-type": "application/json" },
        body: JSON.stringify({ input: "hi" }),
      }),
    );
    expect(res.status).toBe(502);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe(
      "upstream_error",
    );
  });

  test("HTTP exceptions keep their own response", async () => {
    const res = await throwingApp(
      new HTTPException(418, { res: new Response("teapot", { status: 418 }) }),
    ).fetch(get("/v1/models"));
    expect(res.status).toBe(418);
    expect(await res.text()).toBe("teapot");
  });

  test("anything else is a logged 500 with no internals", async () => {
    const log = spyOn(console, "error").mockImplementation(() => {});
    const res = await throwingApp(new Error("secret stack")).fetch(get("/v1/models"));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({
      error: { code: "internal_error", message: "Internal server error" },
    });
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });

  test("path denials outside a bridge handler are 400 path_denied", async () => {
    const cli = new FakeCliBridge({ "profile list": { stdout: "" } });
    const app = createApp({
      store,
      management: {
        cli,
        profiles: new ProfileRegistry({ cli, homeFor: () => "/tmp" }),
        homeFor: () => {
          throw new BridgeDenied("no home");
        },
      },
    });
    const res = await app.fetch(get("/v1/memory"));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: { code: "path_denied", message: "no home" },
    });
  });

  test("a hermes binary that can't start is 503 cli_unavailable", async () => {
    const cli = new HermesCliBridge({ binary: "/nonexistent/hermes-binary" });
    const app = createApp({
      store,
      management: {
        cli,
        profiles: new ProfileRegistry({ cli, homeFor: () => "/tmp" }),
        homeFor: () => "/tmp",
      },
    });
    const res = await app.fetch(get("/v1/agent/status"));
    expect(res.status).toBe(503);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe(
      "cli_unavailable",
    );
  });
});
