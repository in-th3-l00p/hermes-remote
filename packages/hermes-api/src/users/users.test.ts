import { describe, expect, test } from "bun:test";
import { mkdtemp, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ApiKeyRecord, KeyVerifier } from "../auth/index.ts";
import type { AgentBackend } from "../chat/index.ts";
import { ChatStore } from "../chat/store/index.ts";
import { createApp } from "../http/app.ts";
import { UserStore, UserTokenIssuer, newSigningSecret } from "./index.ts";

const record: ApiKeyRecord = {
  id: "platform",
  name: "platform",
  hash: "h",
  scopes: ["auth:users", "chat:invoke"],
  userGrantable: ["chat:invoke", "sessions:read", "sessions:write"],
  createdAt: "2026-01-01T00:00:00.000Z",
  expiresAt: null,
  revoked: false,
};
const keys: KeyVerifier = {
  verifyToken: async (t) => (t === "hk_platform" ? record : t === "hk_bare" ? { ...record, id: "bare", scopes: ["auth:users"], userGrantable: [] } : null),
};

function setup(clock = { at: new Date("2026-09-24T12:00:00Z") }) {
  const seen: string[] = [];
  const agent: AgentBackend = {
    async *stream(messages) {
      seen.push(messages[0]?.content ?? "");
      yield "hi";
    },
  };
  const users = new UserStore();
  const chat = new ChatStore();
  const app = createApp({
    store: keys,
    chat: { store: chat, agent },
    users: { store: users, issuer: new UserTokenIssuer(newSigningSecret()) },
    now: () => clock.at,
  });
  const call = (method: string, path: string, token: string | null, body?: unknown) =>
    app.fetch(
      new Request(`http://x${path}`, {
        method,
        headers: {
          ...(token === null ? {} : { authorization: `Bearer ${token}` }),
          ...(body === undefined ? {} : { "content-type": "application/json" }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
    );
  const exchange = async (user: Record<string, unknown>, scopes: string[], ttl?: number) =>
    call("POST", "/v1/auth/token", "hk_platform", { user, scopes, ...(ttl === undefined ? {} : { ttl }) });
  return { app, call, exchange, users, chat, seen, clock };
}

describe("token exchange", () => {
  test("mints a scoped user token, upserting the user by identity", async () => {
    const { call, exchange } = setup();
    const res = await exchange({ provider: "auth0", subject: "auth0|a" }, ["chat:invoke", "sessions:read", "sessions:write"]);
    expect(res.status).toBe(201);
    const body = (await res.json()) as { token: string; expires_at: string; user: { id: string; generation?: number } };
    expect(body.user.id).toMatch(/^usr_[0-9a-f]{20}$/);
    expect(body.user.generation).toBeUndefined();
    expect(body.expires_at).toBe("2026-09-24T12:15:00.000Z");
    const again = (await (await exchange({ provider: "auth0", subject: "auth0|a" }, ["chat:invoke"])).json()) as {
      user: { id: string };
    };
    expect(again.user.id).toBe(body.user.id);
    const whoami = await (await call("GET", "/v1/auth/whoami", body.token)).json();
    expect(whoami).toEqual({
      type: "user",
      id: body.user.id,
      scopes: ["chat:invoke", "sessions:read", "sessions:write"],
      visibility: "anonymous",
    });
    const created = await call("POST", "/v1/sessions", body.token);
    expect(created.status).toBe(201);
    expect(((await created.json()) as { userId: string }).userId).toBe(body.user.id);
  });

  test("tokens hold exactly the granted end-user scopes", async () => {
    const { call, exchange } = setup();
    const token = ((await (await exchange({ provider: "p", subject: "s" }, ["chat:invoke"])).json()) as { token: string }).token;
    expect((await call("POST", "/v1/sessions", token)).status).toBe(403);
    expect((await call("GET", "/v1/sessions", token)).status).toBe(403);
  });

  test("keys can only grant what they were created to grant", async () => {
    const { call, exchange } = setup();
    const tooMuch = await exchange({ provider: "p", subject: "s" }, ["chat:invoke", "config:read"]);
    expect(tooMuch.status).toBe(403);
    expect(((await tooMuch.json()) as { error: { code: string } }).error.code).toBe("scope_not_grantable");
    const bare = await call("POST", "/v1/auth/token", "hk_bare", {
      user: { provider: "p", subject: "s" },
      scopes: ["chat:invoke"],
    });
    expect(bare.status).toBe(403);
  });

  test("validates the request", async () => {
    const { call, exchange } = setup();
    for (const [user, scopes, ttl] of [
      [{ provider: "", subject: "s" }, ["chat:invoke"], undefined],
      [{ provider: "p" }, ["chat:invoke"], undefined],
      [{ provider: "p", subject: "s", profile: "x" }, ["chat:invoke"], undefined],
      [{ provider: "p", subject: "s", metadata: [1] }, ["chat:invoke"], undefined],
      [{ provider: "p", subject: "s", agent_visibility: "everyone" }, ["chat:invoke"], undefined],
      [{ provider: "p", subject: "s" }, [], undefined],
      [{ provider: "p", subject: "s" }, [5], undefined],
      [{ provider: "p", subject: "s" }, ["chat:invoke"], 10],
      [{ provider: "p", subject: "s" }, ["chat:invoke"], 100_000],
    ] as [Record<string, unknown>, unknown[], number | undefined][]) {
      expect((await exchange(user, scopes as string[], ttl)).status).toBe(400);
    }
    expect((await call("POST", "/v1/auth/token", "hk_platform")).status).toBe(400);
  });

  test("expired, tampered and foreign tokens are refused", async () => {
    const clock = { at: new Date("2026-09-24T12:00:00Z") };
    const { call, exchange } = setup(clock);
    const { token } = (await (await exchange({ provider: "p", subject: "s" }, ["sessions:read"], 60)).json()) as { token: string };
    const [h, p] = token.split(".");
    expect((await call("GET", "/v1/sessions", `${h}.${p}.AAAA`)).status).toBe(401);
    const other = new UserTokenIssuer(newSigningSecret()).mint({ userId: "usr_x", scopes: [], generation: 0, ttlSeconds: 60, now: clock.at });
    expect((await call("GET", "/v1/sessions", other.token)).status).toBe(401);
    clock.at = new Date("2026-09-24T12:02:00Z");
    expect((await call("GET", "/v1/sessions", token)).status).toBe(401);
  });

  test("disabling a user revokes outstanding tokens immediately", async () => {
    const { call, exchange } = setup();
    const minted = (await (await exchange({ provider: "p", subject: "s" }, ["sessions:read"])).json()) as {
      token: string;
      user: { id: string };
    };
    expect((await call("GET", "/v1/sessions", minted.token)).status).toBe(200);
    await call("POST", `/v1/users/${minted.user.id}/disable`, "hk_platform");
    expect((await call("GET", "/v1/sessions", minted.token)).status).toBe(401);
    expect((await exchange({ provider: "p", subject: "s" }, ["sessions:read"])).status).toBe(403);
    const enabled = (await (await call("POST", `/v1/users/${minted.user.id}/enable`, "hk_platform")).json()) as { disabled: boolean };
    expect(enabled.disabled).toBe(false);
    // The old token stays dead; a fresh exchange works.
    expect((await call("GET", "/v1/sessions", minted.token)).status).toBe(401);
    const fresh = (await (await exchange({ provider: "p", subject: "s" }, ["sessions:read"])).json()) as { token: string };
    expect((await call("GET", "/v1/sessions", fresh.token)).status).toBe(200);
  });

  test("agent_visibility controls what the agent is told", async () => {
    const { call, exchange, seen } = setup();
    const profile = { name: "Ada Lovelace", locale: "en-GB", timezone: "Europe/London", email: "ada@example.com" };
    const metadata = { plan: "enterprise-secret" };
    for (const visibility of ["anonymous", "pseudonymous", "full"]) {
      const { token, user } = (await (
        await exchange({ provider: "p", subject: visibility, profile, metadata, agent_visibility: visibility }, ["chat:invoke", "sessions:write"])
      ).json()) as { token: string; user: { id: string } };
      const session = (await (await call("POST", "/v1/sessions", token)).json()) as { id: string };
      await (await call("POST", `/v1/sessions/${session.id}/messages`, token, { content: "hi" })).text();
      const context = seen.at(-1) ?? "";
      expect(context).not.toContain("enterprise-secret");
      if (visibility === "anonymous") {
        expect(context).not.toContain(user.id);
        expect(context).not.toContain("Ada");
      } else if (visibility === "pseudonymous") {
        expect(context).toContain(user.id);
        expect(context).not.toContain("Ada");
      } else {
        expect(context).toContain("name: Ada Lovelace");
        expect(context).toContain("timezone: Europe_London");
        expect(context).toContain("email: ada@example.com");
      }
    }
  });
});

describe("user administration", () => {
  test("list, get, update, link and unlink identities, delete with cascade", async () => {
    const { call, exchange, chat } = setup();
    const { user } = (await (await exchange({ provider: "auth0", subject: "a" }, ["chat:invoke"])).json()) as { user: { id: string } };
    await exchange({ provider: "auth0", subject: "b" }, ["chat:invoke"]);
    const listed = (await (await call("GET", "/v1/users?limit=1", "hk_platform")).json()) as { users: { id: string }[]; total: number };
    expect([listed.users.length, listed.total]).toEqual([1, 2]);
    expect(((await (await call("GET", `/v1/users/${user.id}`, "hk_platform")).json()) as { id: string }).id).toBe(user.id);
    expect((await call("GET", "/v1/users/usr_00000000000000000000", "hk_platform")).status).toBe(404);
    const patched = (await (
      await call("PATCH", `/v1/users/${user.id}`, "hk_platform", { agent_visibility: "full", profile: { name: "A" } })
    ).json()) as { agentVisibility: string; profile: unknown };
    expect([patched.agentVisibility, patched.profile]).toEqual(["full", { name: "A" }]);
    expect((await call("PATCH", `/v1/users/${user.id}`, "hk_platform", { agent_visibility: "x" })).status).toBe(400);
    expect((await call("PATCH", `/v1/users/${user.id}`, "hk_platform")).status).toBe(400);

    const linked = (await (
      await call("POST", `/v1/users/${user.id}/identities`, "hk_platform", { provider: "github", subject: "42" })
    ).json()) as { identities: unknown[] };
    expect(linked.identities).toEqual([
      { provider: "auth0", subject: "a" },
      { provider: "github", subject: "42" },
    ]);
    expect((await call("POST", `/v1/users/${user.id}/identities`, "hk_platform", { provider: "auth0", subject: "b" })).status).toBe(409);
    expect((await call("POST", `/v1/users/${user.id}/identities`, "hk_platform", { provider: "github", subject: "42" })).status).toBe(200);
    expect((await call("POST", `/v1/users/${user.id}/identities`, "hk_platform", {})).status).toBe(400);
    expect((await call("POST", `/v1/users/${user.id}/identities`, "hk_platform")).status).toBe(400);
    expect((await call("DELETE", `/v1/users/${user.id}/identities/github`, "hk_platform")).status).toBe(200);
    expect((await call("DELETE", `/v1/users/${user.id}/identities/auth0`, "hk_platform")).status).toBe(409);

    const active = chat.createSession({ userId: user.id });
    const old = chat.createSession({ userId: user.id });
    chat.updateSession(old.id, { archived: true });
    const deleted = (await (await call("DELETE", `/v1/users/${user.id}?cascade=true`, "hk_platform")).json()) as {
      sessions: number;
    };
    expect(deleted.sessions).toBe(2);
    expect([chat.getSession(active.id), chat.getSession(old.id)]).toEqual([null, null]);
    expect((await call("GET", `/v1/users/${user.id}`, "hk_platform")).status).toBe(404);
  });

  test("the store persists to an owner-only file", async () => {
    const dir = await mkdtemp(join(tmpdir(), "hermes-users-"));
    const path = join(dir, "nested", "users.db");
    const first = new UserStore(path);
    const user = first.upsert({ provider: "p", subject: "s" });
    expect(new UserStore(path).get(user.id)?.id).toBe(user.id);
    expect((await stat(path)).mode & 0o777).toBe(0o600);
    expect(first.update("usr_missing", {})).toBeNull();
    expect(first.setDisabled("usr_missing", true)).toBeNull();
    expect(first.delete("usr_missing")).toBe(false);
    expect(first.unlink("usr_missing", "p")).toBe(false);
  });

  test("the issuer rejects weak secrets and recognizes only its own tokens", () => {
    expect(() => new UserTokenIssuer("short")).toThrow();
    expect(UserTokenIssuer.isOwnToken("a.b.c")).toBe(false);
    expect(UserTokenIssuer.isOwnToken("a.e30.c")).toBe(false);
    expect(UserTokenIssuer.isOwnToken("x")).toBe(false);
    const issuer = new UserTokenIssuer(newSigningSecret());
    expect(issuer.verify("a.b", new Date())).toBeNull();
    const wrongIssuer = `${Buffer.from("{}").toString("base64url")}.${Buffer.from(JSON.stringify({ iss: "someone" })).toString("base64url")}`;
    expect(UserTokenIssuer.isOwnToken(`${wrongIssuer}.sig`)).toBe(false);
  });
});
