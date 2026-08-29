import { describe, expect, test } from "bun:test";
import { createHmac } from "node:crypto";
import { createApp, ChatStore, JwtAuthProvider, type KeyVerifier } from "../index.ts";
import type { ApiKeyRecord } from "../auth/index.ts";
import type { AgentBackend } from "../chat/index.ts";

const record: ApiKeyRecord = {
  id: "abc123",
  name: "test",
  hash: "h",
  scopes: ["chat:invoke", "sessions:read", "sessions:write"],
  userGrantable: [],
  createdAt: "2026-08-23T00:00:00.000Z",
  expiresAt: null,
  revoked: false,
};

const store: KeyVerifier = {
  verifyToken: async (token) => (token === "hk_good" ? record : null),
};

const echoAgent: AgentBackend = {
  async *stream() {
    yield "ok";
  },
};

const SECRET = "sb-secret";

function supabaseToken(sub: string): string {
  const enc = (o: unknown) =>
    Buffer.from(JSON.stringify(o)).toString("base64url");
  const head = enc({ alg: "HS256", typ: "JWT" });
  const body = enc({ sub, email: `${sub}@x.io`, exp: Date.now() / 1000 + 600 });
  const sig = createHmac("sha256", SECRET)
    .update(`${head}.${body}`)
    .digest("base64url");
  return `${head}.${body}.${sig}`;
}

const get = (path: string, token?: string) =>
  new Request(`http://x${path}`, {
    headers: token === undefined ? {} : { authorization: `Bearer ${token}` },
  });

describe("createApp", () => {
  test("GET /v1/status is public and returns version", async () => {
    const app = createApp({ version: "1.2.3" });
    const res = await app.fetch(get("/v1/status"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, version: "1.2.3" });
  });

  test("default version and 404s", async () => {
    const app = createApp();
    expect(await (await app.fetch(get("/v1/status"))).json()).toEqual({
      ok: true,
      version: "1.0.0",
    });
    expect((await app.fetch(get("/nope"))).status).toBe(401);
    const open = createApp({ anonymous: true });
    expect((await open.fetch(get("/nope"))).status).toBe(404);
    expect(
      (
        await open.fetch(
          new Request("http://x/v1/status", { method: "POST" }),
        )
      ).status,
    ).toBe(404);
  });

  test("whoami without a token is 401, or anonymous when allowed", async () => {
    const app = createApp({ store });
    expect((await app.fetch(get("/v1/auth/whoami"))).status).toBe(401);
    const open = createApp({ anonymous: true });
    expect(await (await open.fetch(get("/v1/auth/whoami"))).json()).toEqual({
      type: "anonymous",
    });
  });

  test("api key tokens: no store 503, invalid 401, valid principal", async () => {
    const noStore = createApp();
    expect(
      (await noStore.fetch(get("/v1/auth/whoami", "hk_x"))).status,
    ).toBe(503);
    const app = createApp({ store });
    expect((await app.fetch(get("/v1/auth/whoami", "hk_bad"))).status).toBe(401);
    expect(await (await app.fetch(get("/v1/auth/whoami", "hk_good"))).json()).toEqual({
      type: "api_key",
      id: "abc123",
      name: "test",
      scopes: ["chat:invoke", "sessions:read", "sessions:write"],
    });
  });

  test("supabase tokens verify into user principals", async () => {
    const app = createApp({ authProvider: new JwtAuthProvider({ hs256Secret: SECRET }) });
    const res = await app.fetch(get("/v1/auth/whoami", supabaseToken("u-9")));
    expect(await res.json()).toEqual({
      type: "user",
      id: "u-9",
      email: "u-9@x.io",
    });
    expect((await app.fetch(get("/v1/auth/whoami", "garbage"))).status).toBe(401);
    const noSecret = createApp({ store });
    expect(
      (await noSecret.fetch(get("/v1/auth/whoami", "garbage"))).status,
    ).toBe(401);
  });

  test("chat routes require auth unless anonymous", async () => {
    const chat = { store: new ChatStore(), agent: echoAgent };
    const app = createApp({ store, chat });
    const denied = await app.fetch(
      new Request("http://x/v1/sessions", { method: "POST" }),
    );
    expect(denied.status).toBe(401);
    const allowed = await app.fetch(
      new Request("http://x/v1/sessions", {
        method: "POST",
        headers: { authorization: "Bearer hk_good" },
      }),
    );
    expect(allowed.status).toBe(201);
    const anonymous = createApp({ chat, anonymous: true });
    const open = await anonymous.fetch(
      new Request("http://x/v1/sessions", { method: "POST" }),
    );
    expect(open.status).toBe(201);
  });

  test("user principals own their sessions", async () => {
    const chat = { store: new ChatStore(), agent: echoAgent };
    const app = createApp({ chat, authProvider: new JwtAuthProvider({ hs256Secret: SECRET }), anonymous: true });
    const created = await app.fetch(
      new Request("http://x/v1/sessions", {
        method: "POST",
        headers: { authorization: `Bearer ${supabaseToken("u-1")}` },
      }),
    );
    const session = (await created.json()) as { id: string; userId: string };
    expect(session.userId).toBe("u-1");
    const mine = await app.fetch(
      get("/v1/sessions", supabaseToken("u-1")),
    );
    expect(
      ((await mine.json()) as { sessions: { id: string }[] }).sessions.map(
        (s) => s.id,
      ),
    ).toEqual([session.id]);
    const theirs = await app.fetch(get("/v1/sessions", supabaseToken("u-2")));
    expect(
      ((await theirs.json()) as { sessions: unknown[] }).sessions,
    ).toEqual([]);
    const stolen = await app.fetch(
      get(`/v1/sessions/${session.id}/messages`, supabaseToken("u-2")),
    );
    expect(stolen.status).toBe(404);
    const owner = await app.fetch(
      get(`/v1/sessions/${session.id}/messages`, supabaseToken("u-1")),
    );
    expect(owner.status).toBe(200);
    const apiKeyAccess = createApp({ store, chat });
    const viaKey = await apiKeyAccess.fetch(
      get(`/v1/sessions/${session.id}/messages`, "hk_good"),
    );
    expect(viaKey.status).toBe(200);
  });

  test("the agent is told who it is speaking with", async () => {
    const seen: string[] = [];
    const capturingAgent: AgentBackend = {
      async *stream(messages) {
        seen.push(
          messages[0]?.role === "system" ? (messages[0]?.content ?? "") : "",
        );
        yield "ok";
      },
    };
    const send = (app: ReturnType<typeof createApp>, token?: string) =>
      (async () => {
        const created = await app.fetch(
          new Request("http://x/v1/sessions", {
            method: "POST",
            headers:
              token === undefined
                ? {}
                : { authorization: `Bearer ${token}` },
          }),
        );
        const { id } = (await created.json()) as { id: string };
        const res = await app.fetch(
          new Request(`http://x/v1/sessions/${id}/messages`, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              ...(token === undefined
                ? {}
                : { authorization: `Bearer ${token}` }),
            },
            body: JSON.stringify({ content: "who am I?" }),
          }),
        );
        await res.text();
      })();

    const userApp = createApp({
      chat: { store: new ChatStore(), agent: capturingAgent },
      authProvider: new JwtAuthProvider({ hs256Secret: SECRET }),
      store,
      anonymous: true,
    });
    await send(userApp, supabaseToken("u-42"));
    expect(seen[0]).toContain("user id: u-42");
    expect(seen[0]).toContain("email: u-42@x.io");
    await send(userApp, "hk_good");
    expect(seen[1]).toContain('API key "test"');
    await send(userApp);
    expect(seen[2]).toContain("unauthenticated guest");

    const anonToken = (() => {
      const enc = (o: unknown) =>
        Buffer.from(JSON.stringify(o)).toString("base64url");
      const head = enc({ alg: "HS256", typ: "JWT" });
      const body = enc({ sub: "guest-7", exp: Date.now() / 1000 + 600 });
      const sig = createHmac("sha256", SECRET)
        .update(`${head}.${body}`)
        .digest("base64url");
      return `${head}.${body}.${sig}`;
    })();
    await send(userApp, anonToken);
    expect(seen[3]).toContain("anonymous guest (stable user id: guest-7)");
  });

  test("CIDR-restricted keys only work from allowed addresses", async () => {
    const restricted: KeyVerifier = {
      verifyToken: async () => ({ ...record, cidrs: ["10.0.0.0/8"] }),
    };
    const app = createApp({ store: restricted });
    const path = "/v1/auth/whoami";
    expect((await app.fetch(get(path, "hk_good"), "10.1.2.3")).status).toBe(200);
    expect((await app.fetch(get(path, "hk_good"), "11.0.0.1")).status).toBe(401);
    expect((await app.fetch(get(path, "hk_good"))).status).toBe(401);
  });

  test("rate limits per principal with retry-after", async () => {
    const app = createApp({
      anonymous: true,
      rateLimit: { limit: 2, windowSeconds: 60 },
    });
    expect((await app.fetch(get("/v1/auth/whoami"))).status).toBe(200);
    expect((await app.fetch(get("/v1/auth/whoami"))).status).toBe(200);
    const limited = await app.fetch(get("/v1/auth/whoami"));
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get("retry-after"))).toBeGreaterThan(0);
    const perUser = createApp({
      authProvider: new JwtAuthProvider({ hs256Secret: SECRET }),
      rateLimit: { limit: 1, windowSeconds: 60 },
    });
    expect(
      (await perUser.fetch(get("/v1/auth/whoami", supabaseToken("u-r")))).status,
    ).toBe(200);
    expect(
      (await perUser.fetch(get("/v1/auth/whoami", supabaseToken("u-r")))).status,
    ).toBe(429);
  });

  test("anonymous principals rate limit per client ip", async () => {
    const app = createApp({
      anonymous: true,
      rateLimit: { limit: 1, windowSeconds: 60 },
    });
    expect((await app.fetch(get("/v1/auth/whoami"), "1.1.1.1")).status).toBe(200);
    expect((await app.fetch(get("/v1/auth/whoami"), "2.2.2.2")).status).toBe(200);
    const limited = await app.fetch(get("/v1/auth/whoami"), "1.1.1.1");
    expect(limited.status).toBe(429);
  });

  test("failed auth attempts rate limit per ip before key verification", async () => {
    let verifies = 0;
    const counting: KeyVerifier = {
      verifyToken: async () => {
        verifies += 1;
        return null;
      },
    };
    const app = createApp({
      store: counting,
      authFailureLimit: { limit: 2, windowSeconds: 60 },
    });
    const attempt = (ip?: string) => app.fetch(get("/v1/auth/whoami", "hk_guess"), ip);
    expect((await attempt("9.9.9.9")).status).toBe(401);
    expect((await attempt("9.9.9.9")).status).toBe(401);
    const limited = await attempt("9.9.9.9");
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get("retry-after"))).toBeGreaterThan(0);
    const shortCircuited = await attempt("9.9.9.9");
    expect(shortCircuited.status).toBe(429);
    expect(verifies).toBe(2);
    expect((await attempt("8.8.8.8")).status).toBe(401);
    expect((await attempt()).status).toBe(401);
    const success = createApp({
      store,
      authFailureLimit: { limit: 2, windowSeconds: 60 },
    });
    for (let i = 0; i < 4; i += 1) {
      expect(
        (await success.fetch(get("/v1/auth/whoami", "hk_good"), "9.9.9.9")).status,
      ).toBe(200);
    }
  });

  test("non-401 auth denials do not count toward the failure limit", async () => {
    const app = createApp({ authFailureLimit: { limit: 1, windowSeconds: 60 } });
    for (let i = 0; i < 3; i += 1) {
      expect(
        (await app.fetch(get("/v1/auth/whoami", "hk_x"), "3.3.3.3")).status,
      ).toBe(503);
    }
  });

  test("rejects oversized request bodies", async () => {
    const app = createApp({ anonymous: true, limits: { maxBodyBytes: 10 } });
    const res = await app.fetch(
      new Request("http://x/v1/auth/whoami", {
        method: "GET",
        headers: { "content-length": "99" },
      }),
    );
    expect(res.status).toBe(413);
  });

  test("audits mutations and auth failures", async () => {
    const entries: unknown[] = [];
    const chat = { store: new ChatStore(), agent: echoAgent };
    const app = createApp({
      store,
      chat,
      audit: (e) => entries.push(e),
      now: () => new Date("2026-08-24T00:00:00Z"),
    });
    await app.fetch(get("/v1/status"));
    await app.fetch(get("/v1/auth/whoami", "hk_good"));
    await app.fetch(get("/v1/auth/whoami"));
    await app.fetch(
      new Request("http://x/v1/sessions", {
        method: "POST",
        headers: { authorization: "Bearer hk_good" },
      }),
    );
    expect(entries).toEqual([
      { at: "2026-08-24T00:00:00.000Z", method: "GET", path: "/v1/auth/whoami", status: 401, principal: "unauthenticated" },
      { at: "2026-08-24T00:00:00.000Z", method: "POST", path: "/v1/sessions", status: 201, principal: "key:abc123" },
    ]);
  });

  test("multi-origin CORS echoes the matching origin", async () => {
    const app = createApp({
      corsOrigins: ["http://a.test", "http://b.test"],
      anonymous: true,
    });
    const fromB = await app.fetch(
      new Request("http://x/v1/status", { headers: { origin: "http://b.test" } }),
    );
    expect(fromB.headers.get("access-control-allow-origin")).toBe("http://b.test");
    const unknown = await app.fetch(
      new Request("http://x/v1/status", { headers: { origin: "http://evil.test" } }),
    );
    expect(unknown.headers.get("access-control-allow-origin")).toBe("http://a.test");
    const preflight = await app.fetch(
      new Request("http://x/v1/sessions", {
        method: "OPTIONS",
        headers: { origin: "http://b.test" },
      }),
    );
    expect(preflight.headers.get("access-control-allow-origin")).toBe("http://b.test");
  });

  test("CORS preflight and response headers", async () => {
    const app = createApp({ corsOrigins: ["http://localhost:5173"] });
    const preflight = await app.fetch(
      new Request("http://x/v1/status", { method: "OPTIONS" }),
    );
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("access-control-allow-origin")).toBe(
      "http://localhost:5173",
    );
    const res = await app.fetch(get("/v1/status"));
    expect(res.headers.get("access-control-allow-origin")).toBe(
      "http://localhost:5173",
    );
    const noCors = createApp();
    const plain = await noCors.fetch(get("/v1/status"));
    expect(plain.headers.get("access-control-allow-origin")).toBeNull();
  });
});
