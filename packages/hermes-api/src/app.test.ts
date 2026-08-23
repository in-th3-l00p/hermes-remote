import { describe, expect, test } from "bun:test";
import { createApp, type KeyVerifier } from "./index.ts";
import type { ApiKeyRecord } from "./store/keys.ts";

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
  verifyToken: async (token) => (token === "good" ? record : null),
};

describe("createApp", () => {
  test("GET /v1/status is public and returns version", async () => {
    const app = createApp({ version: "1.2.3" });
    const res = await app.fetch(new Request("http://localhost/v1/status"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, version: "1.2.3" });
  });

  test("default version", async () => {
    const app = createApp();
    const res = await app.fetch(new Request("http://localhost/v1/status"));
    expect(await res.json()).toEqual({ ok: true, version: "0.1.0" });
  });

  test("unknown route and method return 404", async () => {
    const app = createApp();
    const missing = await app.fetch(new Request("http://localhost/nope"));
    expect(missing.status).toBe(404);
    const wrongMethod = await app.fetch(
      new Request("http://localhost/v1/status", { method: "POST" }),
    );
    expect(wrongMethod.status).toBe(404);
  });

  test("whoami without a store returns 503", async () => {
    const app = createApp();
    const res = await app.fetch(new Request("http://localhost/v1/auth/whoami"));
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("auth_unavailable");
  });

  test("whoami without bearer token returns 401", async () => {
    const app = createApp({ store });
    const noHeader = await app.fetch(
      new Request("http://localhost/v1/auth/whoami"),
    );
    expect(noHeader.status).toBe(401);
    const wrongScheme = await app.fetch(
      new Request("http://localhost/v1/auth/whoami", {
        headers: { authorization: "Basic abc" },
      }),
    );
    expect(wrongScheme.status).toBe(401);
  });

  test("whoami with invalid token returns 401", async () => {
    const app = createApp({ store });
    const res = await app.fetch(
      new Request("http://localhost/v1/auth/whoami", {
        headers: { authorization: "Bearer bad" },
      }),
    );
    expect(res.status).toBe(401);
  });

  test("whoami with valid token returns the principal", async () => {
    const app = createApp({ store });
    const res = await app.fetch(
      new Request("http://localhost/v1/auth/whoami", {
        headers: { authorization: "Bearer good" },
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      type: "api_key",
      id: "abc123",
      name: "test",
      scopes: ["chat:invoke"],
    });
  });
});
