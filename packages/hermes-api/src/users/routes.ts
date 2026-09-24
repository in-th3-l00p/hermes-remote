import type { Context, Hono } from "hono";
import { error, json, type ChatEnv } from "../chat/routes/shared.ts";
import type { ChatStore } from "../chat/store/index.ts";
import { requireKeyScope } from "../mgmt/shared.ts";
import { isEndUserScope } from "../scopes/index.ts";
import { VISIBILITIES, type AgentVisibility, type User, type UserStore } from "./store.ts";
import type { UserTokenIssuer } from "./tokens.ts";

export interface UserRouteOptions {
  store: UserStore;
  issuer: UserTokenIssuer;
  /** Chat store, for DELETE /v1/users/:id?cascade=true. */
  chat?: ChatStore;
  now: () => Date;
}

const USER_ID = ":id{usr_[0-9a-f]{20}}";
const DEFAULT_TTL = 900;
const MAX_TTL = 86_400;
const MAX_JSON = 8_192;

function publicUser(user: User): Omit<User, "generation"> {
  const { generation: _generation, ...rest } = user;
  return rest;
}

function plainString(value: unknown, max = 200): value is string {
  return typeof value === "string" && value.trim() !== "" && value.length <= max;
}

function plainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    JSON.stringify(value).length <= MAX_JSON
  );
}

function visibility(value: unknown): value is AgentVisibility {
  return typeof value === "string" && (VISIBILITIES as readonly string[]).includes(value);
}

/** Validated profile/metadata/visibility changes, or an error message. */
function parseChanges(body: Record<string, unknown>):
  | { profile?: Record<string, unknown>; metadata?: Record<string, unknown>; agentVisibility?: AgentVisibility }
  | string {
  const { profile, metadata, agent_visibility: vis } = body;
  if (profile !== undefined && !plainObject(profile)) {
    return `profile must be an object of at most ${MAX_JSON} bytes`;
  }
  if (metadata !== undefined && !plainObject(metadata)) {
    return `metadata must be an object of at most ${MAX_JSON} bytes`;
  }
  if (vis !== undefined && !visibility(vis)) {
    return `agent_visibility must be one of ${VISIBILITIES.join(", ")}`;
  }
  return {
    ...(profile === undefined ? {} : { profile }),
    ...(metadata === undefined ? {} : { metadata }),
    ...(vis === undefined ? {} : { agentVisibility: vis }),
  };
}

const guard = (c: Context<ChatEnv>) => requireKeyScope(c.get("principal"), "auth:users");

/** Token exchange and user administration (API keys with auth:users). */
export function registerUserRoutes(app: Hono<ChatEnv>, options: UserRouteOptions): void {
  const { store, issuer, now } = options;

  app.post("/v1/auth/token", async (c) => {
    const denied = guard(c);
    if (denied !== null) {
      return denied;
    }
    const principal = c.get("principal");
    const grantable = principal.type === "api_key" ? principal.record.userGrantable : [];
    const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
    const user = body?.["user"] as Record<string, unknown> | undefined;
    if (user === undefined || !plainString(user["provider"]) || !plainString(user["subject"])) {
      return error(400, "invalid_request", "user.provider and user.subject are required");
    }
    const changes = parseChanges(user);
    if (typeof changes === "string") {
      return error(400, "invalid_request", changes);
    }
    const scopes = body?.["scopes"];
    if (!Array.isArray(scopes) || scopes.length === 0 || !scopes.every((s) => typeof s === "string")) {
      return error(400, "invalid_request", "scopes (non-empty string array) is required");
    }
    // Only scopes this key was created to hand out, and only end-user ones.
    const refused = (scopes as string[]).filter((s) => !grantable.includes(s) || !isEndUserScope(s));
    if (refused.length > 0) {
      return error(403, "scope_not_grantable", `This key cannot grant: ${refused.join(", ")}`);
    }
    const ttl = body?.["ttl"] ?? DEFAULT_TTL;
    if (typeof ttl !== "number" || !Number.isInteger(ttl) || ttl < 60 || ttl > MAX_TTL) {
      return error(400, "invalid_request", `ttl must be an integer between 60 and ${MAX_TTL} seconds`);
    }
    const record = store.upsert(
      { provider: user["provider"] as string, subject: user["subject"] as string },
      changes,
    );
    if (record.disabled) {
      return error(403, "user_disabled", "This user is disabled");
    }
    const minted = issuer.mint({
      userId: record.id,
      scopes: [...new Set(scopes as string[])],
      generation: record.generation,
      ttlSeconds: ttl,
      now: now(),
    });
    return json(201, { token: minted.token, expires_at: minted.expiresAt, user: publicUser(record) });
  });

  app.get("/v1/users", (c) => {
    const denied = guard(c);
    if (denied !== null) {
      return denied;
    }
    const limit = Math.min(Math.max(Number(c.req.query("limit") ?? "50") || 50, 1), 200);
    const offset = Math.max(Number(c.req.query("offset") ?? "0") || 0, 0);
    const { users, total } = store.list(limit, offset);
    return json(200, { users: users.map(publicUser), total });
  });

  const withUser = (
    handler: (c: Context<ChatEnv>, user: User) => Response | Promise<Response>,
  ) => async (c: Context<ChatEnv>): Promise<Response> => {
    const denied = guard(c);
    if (denied !== null) {
      return denied;
    }
    const user = store.get(c.req.param("id") ?? "");
    return user === null ? error(404, "user_not_found", "Unknown user") : handler(c, user);
  };

  app.get(`/v1/users/${USER_ID}`, withUser((_c, user) => json(200, publicUser(user))));

  app.patch(
    `/v1/users/${USER_ID}`,
    withUser(async (c, user) => {
      const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
      const changes = body === null ? "a JSON body is required" : parseChanges(body);
      if (typeof changes === "string") {
        return error(400, "invalid_request", changes);
      }
      return json(200, publicUser(store.update(user.id, changes) as User));
    }),
  );

  for (const [action, disabled] of [["disable", true], ["enable", false]] as const) {
    app.post(
      `/v1/users/${USER_ID}/${action}`,
      withUser((_c, user) => json(200, publicUser(store.setDisabled(user.id, disabled) as User))),
    );
  }

  app.delete(
    `/v1/users/${USER_ID}`,
    withUser((c, user) => {
      let sessions = 0;
      if (c.req.query("cascade") === "true" && options.chat !== undefined) {
        for (const archived of [false, true]) {
          for (const session of options.chat.listSessions({ userId: user.id, archived })) {
            options.chat.deleteSession(session.id);
            sessions += 1;
          }
        }
      }
      store.delete(user.id);
      return json(200, { deleted: true, sessions });
    }),
  );

  app.post(
    `/v1/users/${USER_ID}/identities`,
    withUser(async (c, user) => {
      const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
      if (!plainString(body?.["provider"]) || !plainString(body?.["subject"])) {
        return error(400, "invalid_request", "provider and subject are required");
      }
      const linked = store.link(user.id, {
        provider: body?.["provider"] as string,
        subject: body?.["subject"] as string,
      });
      return linked
        ? json(200, publicUser(store.get(user.id) as User))
        : error(409, "identity_taken", "That identity belongs to another user");
    }),
  );

  app.delete(
    `/v1/users/${USER_ID}/identities/:provider`,
    withUser((c, user) =>
      store.unlink(user.id, c.req.param("provider") ?? "")
        ? json(200, publicUser(store.get(user.id) as User))
        : error(409, "identity_required", "Unknown provider, or the user's last identity"),
    ),
  );
}
