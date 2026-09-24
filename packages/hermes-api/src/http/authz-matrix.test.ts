/**
 * Authorization matrix: every registered route, called as each principal
 * type, must match the access class declared below. A route without an
 * entry fails the suite, so new routes can't ship without a decision.
 *
 * Classes:
 * - public: no token needed.
 * - authenticated: any authenticated principal, no scope.
 * - user:<scope>: users and anonymous principals (end-user scopes), and
 *   API keys holding <scope>.
 * - key:<a>+<b>: API keys holding every listed scope; users and anonymous
 *   principals are refused.
 * - command: the scope depends on the relayed command (checked in
 *   mgmt/commands tests); here only unauthenticated refusal is checked.
 */
import { createHmac } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FakeCliBridge } from "../bridge/index.ts";
import { ChatStore } from "../chat/index.ts";
import { JwtAuthProvider } from "../auth/index.ts";
import type { ApiKeyRecord, KeyVerifier } from "../auth/index.ts";
import { ProfileRegistry } from "../profiles/registry.ts";
import { DemoUpstream } from "../upstream/demo.ts";
import { RunStore } from "../upstream/run-store.ts";
import { createApp, type App } from "./app.ts";
import { describe, expect, test } from "bun:test";
import {
  AUTH_SCOPES,
  TIER1_SCOPES,
  TIER2_SCOPES,
  TIER3_SCOPES,
} from "../scopes/index.ts";

const SECRET = "matrix-secret";

/** Keys encode their scopes in the token: `hk_scopes=a,b`. */
const keys: KeyVerifier = {
  verifyToken: async (token) => {
    const scopes = token.slice("hk_scopes=".length).split(",").filter(Boolean);
    const record: ApiKeyRecord = {
      id: "matrix",
      name: "matrix",
      hash: "h",
      scopes,
      userGrantable: [],
      createdAt: "2026-01-01T00:00:00.000Z",
      expiresAt: null,
      revoked: false,
    };
    return record;
  },
};

function userToken(sub = "matrix-user"): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const head = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub, exp: 4_102_444_800 })}`;
  return `${head}.${createHmac("sha256", SECRET).update(head).digest("base64url")}`;
}

function keyToken(scopes: string[]): string {
  return `hk_scopes=${scopes.join(",")}`;
}

/** A fully wired app: chat, upstream (demo), management (fake CLI), events. */
function matrixApp(anonymous: boolean): App {
  const home = mkdtempSync(join(tmpdir(), "hermes-matrix-"));
  const cli = new FakeCliBridge({ "profile list": { stdout: "" } });
  const upstream = new DemoUpstream();
  return createApp({
    store: keys,
    authProvider: new JwtAuthProvider({ hs256Secret: SECRET }),
    anonymous,
    authFailureLimit: { limit: 1_000_000, windowSeconds: 60 },
    chat: { store: new ChatStore(), agent: upstream.chat, turns: new Map() },
    upstream: { upstream, runStore: new RunStore() },
    management: {
      cli,
      profiles: new ProfileRegistry({ cli, homeFor: (n) => join(home, n) }),
      homeFor: () => home,
    },
    eventsHeartbeatMs: 60_000,
  });
}

const SAMPLES = ["abc123", "1", "demo", "x1"];

/** Replaces route parameters with sample values their patterns accept. */
function concretePath(path: string): string {
  return path
    .replace(/:(\w+)(\{([^}]*)\})?/g, (_m, _name: string, _p, pattern?: string) => {
      if (pattern === undefined) {
        return "x1";
      }
      const re = new RegExp(`^(?:${pattern})$`);
      return SAMPLES.find((s) => re.test(s)) ?? "x1";
    })
    .replace(/\*$/, "notes.md");
}

/** Status of one request; streaming bodies are cancelled immediately. */
export async function probe(
  app: App,
  method: string,
  path: string,
  token: string | null,
): Promise<number> {
  const init: RequestInit = { method, headers: {} };
  const headers = init.headers as Record<string, string>;
  if (token !== null) {
    headers["authorization"] = `Bearer ${token}`;
  }
  if (method !== "GET" && method !== "DELETE") {
    headers["content-type"] = "application/json";
    init.body = "{}";
  }
  const res = await app.fetch(new Request(`http://x${concretePath(path)}`, init));
  await res.body?.cancel();
  return res.status;
}

const denied = (status: number): boolean => status === 401 || status === 403;

const ALL_SCOPES = [...TIER1_SCOPES, ...TIER2_SCOPES, ...TIER3_SCOPES, ...AUTH_SCOPES];

const EXPECTED: Record<string, string> = {
  "GET /v1/status": "public",
  "GET /v1/auth/whoami": "authenticated",
  "GET /v1/events": "key:events:subscribe",
  "GET /v1/profiles": "key:status:read",
  "GET /v1/profiles/:name{[A-Za-z0-9_][A-Za-z0-9_-]*}": "key:status:read",
  "POST /v1/profiles": "key:profiles:manage",
  "DELETE /v1/profiles/:name{[A-Za-z0-9_][A-Za-z0-9_-]*}": "key:profiles:manage",
  "PATCH /v1/profiles/:name{[A-Za-z0-9_][A-Za-z0-9_-]*}": "key:profiles:manage",
  "POST /v1/profiles/:name{[A-Za-z0-9_][A-Za-z0-9_-]*}/export": "key:profiles:manage",
  "POST /v1/profiles/:name{[A-Za-z0-9_][A-Za-z0-9_-]*}/install": "key:profiles:manage",
  "POST /v1/profiles/:name{[A-Za-z0-9_][A-Za-z0-9_-]*}/import": "key:profiles:manage",
  "POST /v1/profiles/:name{[A-Za-z0-9_][A-Za-z0-9_-]*}/update": "key:profiles:manage",
  "GET /v1/config": "key:config:read",
  "GET /v1/config/:key{[A-Za-z0-9_.-]+}": "key:config:read",
  "PUT /v1/config/:key{[A-Za-z0-9_.-]+}": "key:config:write",
  "DELETE /v1/config/:key{[A-Za-z0-9_.-]+}": "key:config:write",
  "POST /v1/config/check": "key:config:write",
  "POST /v1/config/migrate": "key:config:write",
  "GET /v1/providers/model": "key:status:read",
  "PUT /v1/providers/model": "key:providers:manage",
  "GET /v1/providers/fallbacks": "key:status:read",
  "PUT /v1/providers/fallbacks": "key:providers:manage",
  "GET /v1/providers/moa": "key:status:read",
  "PUT /v1/providers/moa": "key:providers:manage",
  "GET /v1/providers/auth": "key:providers:manage",
  "GET /v1/agent/status": "key:status:read",
  "GET /v1/agent/doctor": "key:status:read",
  "GET /v1/agent/prompt-size": "key:status:read",
  "GET /v1/agent/security-audit": "key:status:read",
  "GET /v1/insights": "key:insights:read",
  "GET /v1/logs": "key:logs:read",
  "POST /v1/agent/pause": "key:ops:control",
  "POST /v1/agent/resume": "key:ops:control",
  "GET /v1/memory/journey": "key:memory:read",
  "GET /v1/memory/providers": "key:memory:providers",
  "PUT /v1/memory/providers": "key:memory:providers",
  "GET /v1/soul/skins": "key:soul:read",
  "PUT /v1/soul/skin": "key:soul:write",
  "GET /v1/skills/pending": "key:skills:write",
  "POST /v1/skills/pending/:id/approve": "key:skills:write",
  "POST /v1/skills/pending/:id/reject": "key:skills:write",
  "GET /v1/skills/hub/search": "key:skills:read",
  "GET /v1/skills/hub/taps": "key:skills:install",
  "POST /v1/skills/hub/taps": "key:skills:install",
  "DELETE /v1/skills/hub/taps/:name": "key:skills:install",
  "POST /v1/skills/hub/install": "key:skills:install",
  "POST /v1/skills/:name/update": "key:skills:install",
  "POST /v1/skills/:name/uninstall": "key:skills:install",
  "POST /v1/skills/:name/audit": "key:skills:install",
  "GET /v1/skills/curator": "key:skills:write",
  "POST /v1/skills/curator/run": "key:skills:write",
  "POST /v1/skills/curator/pause": "key:skills:write",
  "GET /v1/jobs/:id{[A-Za-z0-9_-]+}/runs": "key:crons:read",
  "GET /v1/checkpoints": "key:checkpoints:rollback",
  "POST /v1/checkpoints/prune": "key:checkpoints:rollback",
  "GET /v1/approvals": "key:config:read",
  "POST /v1/approvals/proposals": "key:config:write",
  "GET /v1/hooks": "key:hooks:read",
  "GET /v1/hooks/doctor": "key:hooks:read",
  "POST /v1/hooks/consent/revoke": "key:hooks:manage",
  "POST /v1/hooks/:event/test": "key:hooks:manage",
  "GET /v1/webhooks/subscriptions": "key:webhooks:manage",
  "POST /v1/webhooks/subscriptions": "key:webhooks:manage",
  "DELETE /v1/webhooks/subscriptions/:id": "key:webhooks:manage",
  "GET /v1/gateway": "key:status:read",
  "GET /v1/gateway/platforms": "key:status:read",
  "POST /v1/gateway/start": "key:ops:control",
  "POST /v1/gateway/stop": "key:ops:control",
  "POST /v1/gateway/restart": "key:ops:control",
  "POST /v1/gateway/enroll": "key:ops:control",
  "PUT /v1/gateway/platforms/:name": "key:config:write",
  "POST /v1/messages/send": "key:messaging:send",
  "GET /v1/pairing/codes": "key:pairing:manage",
  "POST /v1/pairing/codes": "key:pairing:manage",
  "DELETE /v1/pairing/users/:platform/:user": "key:pairing:manage",
  "POST /v1/pairing/pending/clear": "key:pairing:manage",
  "GET /v1/kanban/tasks": "key:kanban:read",
  "POST /v1/kanban/tasks": "key:kanban:write",
  "PATCH /v1/kanban/tasks/:id": "key:kanban:write",
  "DELETE /v1/kanban/tasks/:id": "key:kanban:write",
  "POST /v1/kanban/tasks/:id/assign": "key:kanban:write",
  "POST /v1/kanban/tasks/:id/complete": "key:kanban:write",
  "POST /v1/kanban/tasks/:id/block": "key:kanban:write",
  "POST /v1/kanban/tasks/:id/unblock": "key:kanban:write",
  "POST /v1/kanban/tasks/:id/comments": "key:kanban:write",
  "GET /v1/projects": "key:projects:manage",
  "POST /v1/projects": "key:projects:manage",
  "PATCH /v1/projects/:name": "key:projects:manage",
  "DELETE /v1/projects/:name": "key:projects:manage",
  "GET /v1/mcp": "key:mcp:manage",
  "POST /v1/mcp": "key:mcp:manage",
  "DELETE /v1/mcp/:name": "key:mcp:manage",
  "GET /v1/plugins": "key:plugins:manage",
  "POST /v1/plugins/:name/enable": "key:plugins:manage",
  "POST /v1/plugins/:name/disable": "key:plugins:manage",
  "POST /v1/plugins/:name/validate": "key:plugins:manage",
  "PUT /v1/toolsets/:platform": "key:toolsets:manage",
  "POST /v1/backups/import": "key:backups:manage",
  "POST /v1/backups": "key:backups:manage",
  "GET /v1/memory": "key:memory:read",
  "PUT /v1/memory": "key:memory:write",
  "GET /v1/memory/user": "key:memory:read",
  "PUT /v1/memory/user": "key:memory:write",
  "POST /v1/memory/entries": "key:memory:write",
  "GET /v1/soul": "key:soul:read",
  "PUT /v1/soul": "key:soul:write",
  "POST /v1/skills": "key:skills:write",
  "GET /v1/skills/:name{[A-Za-z0-9_-]+}": "key:skills:read",
  "PATCH /v1/skills/:name{[A-Za-z0-9_-]+}": "key:skills:write",
  "DELETE /v1/skills/:name{[A-Za-z0-9_-]+}": "key:skills:write",
  "GET /v1/skills/:name{[A-Za-z0-9_-]+}/files/*": "key:skills:read",
  "PUT /v1/skills/:name{[A-Za-z0-9_-]+}/files/*": "key:skills:write",
  "GET /v1/bundles": "key:bundles:read",
  "GET /v1/bundles/:name{[A-Za-z0-9_-]+}": "key:bundles:read",
  "PUT /v1/bundles/:name{[A-Za-z0-9_-]+}": "key:bundles:write",
  "DELETE /v1/bundles/:name{[A-Za-z0-9_-]+}": "key:bundles:write",
  "GET /v1/jobs/:id{[A-Za-z0-9_-]+}/output": "key:crons:read",
  "GET /v1/jobs/:id{[A-Za-z0-9_-]+}/output/:file{[A-Za-z0-9_.-]+}": "key:crons:read",
  "GET /v1/subagents": "key:subagents:read",
  "GET /v1/models": "user:status:read",
  "GET /v1/models/options": "user:status:read",
  "GET /v1/health": "user:status:read",
  "GET /v1/capabilities": "user:status:read",
  "GET /v1/skills": "user:skills:read",
  "GET /v1/toolsets": "user:toolsets:read",
  "POST /v1/runs": "user:chat:invoke",
  "GET /v1/runs": "user:chat:invoke",
  "GET /v1/runs/:id": "user:chat:invoke",
  "GET /v1/runs/:id/events": "user:chat:invoke",
  "POST /v1/runs/:id/stop": "user:chat:invoke",
  "POST /v1/runs/:id/steer": "user:chat:invoke",
  "POST /v1/runs/:id/approval": "user:chat:invoke",
  "GET /v1/jobs": "key:crons:read",
  "GET /v1/jobs/:id": "key:crons:read",
  "POST /v1/jobs": "key:crons:write",
  "PATCH /v1/jobs/:id": "key:crons:write",
  "DELETE /v1/jobs/:id": "key:crons:write",
  "POST /v1/jobs/:id/pause": "key:crons:write",
  "POST /v1/jobs/:id/resume": "key:crons:write",
  "POST /v1/jobs/:id/run": "key:crons:write",
  "GET /v1/agent/sessions": "key:sessions:read-all",
  "POST /v1/agent/sessions": "key:sessions:write-all",
  "GET /v1/agent/sessions/:id{[A-Za-z0-9_-]+}": "key:sessions:read-all",
  "PATCH /v1/agent/sessions/:id{[A-Za-z0-9_-]+}": "key:sessions:write-all",
  "DELETE /v1/agent/sessions/:id{[A-Za-z0-9_-]+}": "key:sessions:write-all",
  "GET /v1/agent/sessions/:id{[A-Za-z0-9_-]+}/messages": "key:sessions:read-all",
  "POST /v1/agent/sessions/:id{[A-Za-z0-9_-]+}/fork": "key:sessions:write-all",
  "POST /v1/agent/sessions/:id{[A-Za-z0-9_-]+}/model": "key:sessions:write-all",
  "POST /v1/agent/sessions/:id{[A-Za-z0-9_-]+}/chat": "key:sessions:write-all+chat:invoke",
  "POST /v1/agent/sessions/:id{[A-Za-z0-9_-]+}/chat/stream": "key:sessions:write-all+chat:invoke",
  "POST /v1/media/tts": "user:chat:invoke",
  "POST /v1/media/images": "user:chat:invoke",
  "POST /v1/web/search": "user:chat:invoke",
  "POST /v1/web/extract": "user:chat:invoke",
  "POST /v1/browser/tasks": "user:chat:invoke",
  "POST /v1/chat/completions": "key:chat:invoke",
  "POST /v1/responses": "key:chat:invoke",
  "GET /v1/commands": "authenticated",
  "POST /v1/agent/sessions/:id{[A-Za-z0-9_-]+}/commands": "command",
  "GET /v1/agent/sessions/:id{[A-Za-z0-9_-]+}/goal": "key:goals:read",
  "PUT /v1/agent/sessions/:id{[A-Za-z0-9_-]+}/goal": "key:goals:write",
  "DELETE /v1/agent/sessions/:id{[A-Za-z0-9_-]+}/goal": "key:goals:write",
  "POST /v1/agent/sessions/:id{[A-Za-z0-9_-]+}/goal/pause": "key:goals:write",
  "POST /v1/agent/sessions/:id{[A-Za-z0-9_-]+}/goal/resume": "key:goals:write",
  "POST /v1/agent/sessions/:id{[A-Za-z0-9_-]+}/goal/wait": "key:goals:write",
  "POST /v1/agent/sessions/:id{[A-Za-z0-9_-]+}/goal/unwait": "key:goals:write",
  "GET /v1/agent/sessions/:id{[A-Za-z0-9_-]+}/goal/gates": "key:goals:read",
  "POST /v1/agent/sessions/:id{[A-Za-z0-9_-]+}/goal/gates": "key:goals:write",
  "DELETE /v1/agent/sessions/:id{[A-Za-z0-9_-]+}/goal/gates/:n{[0-9]+}": "key:goals:write",
  "DELETE /v1/agent/sessions/:id{[A-Za-z0-9_-]+}/goal/gates": "key:goals:write",
  "GET /v1/agent/sessions/:id{[A-Za-z0-9_-]+}/goal/subgoals": "key:goals:read",
  "POST /v1/agent/sessions/:id{[A-Za-z0-9_-]+}/goal/subgoals": "key:goals:write",
  "DELETE /v1/agent/sessions/:id{[A-Za-z0-9_-]+}/goal/subgoals/:n{[0-9]+}": "key:goals:write",
  "DELETE /v1/agent/sessions/:id{[A-Za-z0-9_-]+}/goal/subgoals": "key:goals:write",
  "POST /v1/sessions": "user:sessions:write",
  "GET /v1/sessions": "user:sessions:read",
  "DELETE /v1/sessions/:id{[0-9a-f]+}": "user:sessions:write",
  "POST /v1/sessions/:id{[0-9a-f]+}/stop": "user:chat:invoke",
  "GET /v1/sessions/:id{[0-9a-f]+}/messages": "user:sessions:read",
  "POST /v1/sessions/:id{[0-9a-f]+}/messages": "user:chat:invoke",
  "PATCH /v1/sessions/:id{[0-9a-f]+}/messages/:mid{[0-9a-f]+}": "user:chat:invoke",
  "POST /v1/sessions/:id{[0-9a-f]+}/messages/:mid{[0-9a-f]+}/reactions": "user:sessions:write",
};

describe("authorization matrix", () => {
  const closed = matrixApp(false);
  const open = matrixApp(true);

  test("every route has a declared access class", () => {
    const missing = closed.routes
      .map((r) => `${r.method} ${r.path}`)
      .filter((key) => EXPECTED[key] === undefined);
    expect(missing).toEqual([]);
    const stale = Object.keys(EXPECTED).filter(
      (key) => !closed.routes.some((r) => `${r.method} ${r.path}` === key),
    );
    expect(stale).toEqual([]);
  });

  test("every route admits and refuses exactly its declared principals", async () => {
    const mismatches: string[] = [];
    const check = (key: string, who: string, status: number, allow: boolean) => {
      if (denied(status) === allow) {
        mismatches.push(`${key} as ${who}: ${status}, expected ${allow ? "allowed" : "denied"}`);
      }
    };
    for (const { method, path } of closed.routes) {
      const key = `${method} ${path}`;
      const cls = EXPECTED[key] ?? "";
      const run = (app: App, token: string | null) => probe(app, method, path, token);
      if (cls === "public") {
        check(key, "nobody", await run(closed, null), true);
        continue;
      }
      check(key, "nobody", await run(closed, null), false);
      if (cls === "command") {
        continue;
      }
      const endUser = cls === "authenticated" || cls.startsWith("user:");
      check(key, "anonymous", await run(open, null), endUser);
      check(key, "user", await run(closed, userToken()), endUser);
      check(key, "key without scopes", await run(closed, keyToken([])), cls === "authenticated");
      const needed = cls.startsWith("key:") || cls.startsWith("user:")
        ? cls.slice(cls.indexOf(":") + 1).split("+")
        : [];
      if (needed.length > 0) {
        check(key, `key with ${needed.join("+")}`, await run(closed, keyToken(needed)), true);
        const others = ALL_SCOPES.filter((s) => !needed.includes(s));
        check(key, "key with every other scope", await run(closed, keyToken(others)), false);
      }
    }
    expect(mismatches).toEqual([]);
  });
});
