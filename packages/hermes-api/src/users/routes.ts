import type { Context, Hono } from "hono";
import { error, json, type ChatEnv } from "../chat/routes/shared.ts";
import type { ChatStore } from "../chat/store/index.ts";
import { requireKeyScope } from "../mgmt/shared.ts";
import { isEndUserScope } from "../scopes/index.ts";
import { Identity, TokenExchange, UserChanges } from "../openapi/schemas.ts";
import { readBody } from "../openapi/validate.ts";
import type { User, UserStore } from "./store.ts";
import type { UserTokenIssuer } from "./tokens.ts";

export interface UserRouteOptions {
  store: UserStore;
  issuer: UserTokenIssuer;
  /** Chat store, for DELETE /v1/users/:id?cascade=true. */
  chat?: ChatStore;
  now: () => Date;
}

const USER_ID = ":id{usr_[0-9a-f]{20}}";

function publicUser(user: User): Omit<User, "generation"> {
  const { generation: _generation, ...rest } = user;
  return rest;
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
    const body = await readBody(c, TokenExchange);
    if (body instanceof Response) {
      return body;
    }
    // Only scopes this key was created to hand out, and only end-user ones.
    const refused = body.scopes.filter((s) => !grantable.includes(s) || !isEndUserScope(s));
    if (refused.length > 0) {
      return error(403, "scope_not_grantable", `This key cannot grant: ${refused.join(", ")}`);
    }
    const { provider, subject, profile, metadata, agent_visibility } = body.user;
    const record = store.upsert(
      { provider, subject },
      {
        ...(profile === undefined ? {} : { profile }),
        ...(metadata === undefined ? {} : { metadata }),
        ...(agent_visibility === undefined ? {} : { agentVisibility: agent_visibility }),
      },
    );
    if (record.disabled) {
      return error(403, "user_disabled", "This user is disabled");
    }
    const minted = issuer.mint({
      userId: record.id,
      scopes: [...new Set(body.scopes)],
      generation: record.generation,
      ttlSeconds: body.ttl,
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
      const body = await readBody(c, UserChanges);
      if (body instanceof Response) {
        return body;
      }
      const { profile, metadata, agent_visibility } = body;
      const updated = store.update(user.id, {
        ...(profile === undefined ? {} : { profile }),
        ...(metadata === undefined ? {} : { metadata }),
        ...(agent_visibility === undefined ? {} : { agentVisibility: agent_visibility }),
      });
      return json(200, publicUser(updated as User));
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
      const body = await readBody(c, Identity);
      if (body instanceof Response) {
        return body;
      }
      const linked = store.link(user.id, body);
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
