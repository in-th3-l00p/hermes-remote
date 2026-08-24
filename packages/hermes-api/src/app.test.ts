import { describe, expect, test } from "bun:test";
import { createHmac } from "node:crypto";
import { createApp, ChatStore, hs256Verifier, type KeyVerifier } from "./index.ts";
import type { ApiKeyRecord } from "./store/keys.ts";
import type { AgentBackend } from "./chat/agent.ts";

const record: ApiKeyRecord = {
  id: "abc123",
  name: "test",
  hash: "h",
  scopes: ["chat:invoke"],
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
      version: "0.1.0",
    });
    expect((await app.fetch(get("/nope"))).status).toBe(404);
    expect(
      (
        await app.fetch(
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
      scopes: ["chat:invoke"],
    });
  });

  test("supabase tokens verify into user principals", async () => {
    const app = createApp({ userVerifier: hs256Verifier(SECRET) });
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
    const app = createApp({ chat, userVerifier: hs256Verifier(SECRET), anonymous: true });
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

  test("CORS preflight and response headers", async () => {
    const app = createApp({ corsOrigin: "http://localhost:5173" });
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
