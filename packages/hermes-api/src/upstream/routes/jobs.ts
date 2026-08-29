import type { Context, Hono } from "hono";
import { error, requireScope, type ChatEnv } from "../../chat/routes/shared.ts";
import { proxy, type UpstreamRouteOptions } from "./shared.ts";

function denyNonKey(c: Context<ChatEnv>, scope: string): Response | null {
  const principal = c.get("principal");
  if (principal.type !== "api_key") {
    return error(403, "api_key_required", "Jobs are managed with an API key");
  }
  return requireScope(principal, scope);
}

export function registerJobRoutes(
  app: Hono<ChatEnv>,
  options: UpstreamRouteOptions,
): void {
  const { jobs } = options.upstream;

  app.get("/v1/jobs", (c) => {
    return denyNonKey(c, "crons:read") ?? proxy(() => jobs.list());
  });

  app.get("/v1/jobs/:id", (c) => {
    return denyNonKey(c, "crons:read") ?? proxy(() => jobs.get(c.req.param("id")));
  });

  app.post("/v1/jobs", async (c) => {
    const denied = denyNonKey(c, "crons:write");
    if (denied !== null) {
      return denied;
    }
    const body = (await c.req.json().catch(() => ({}))) as unknown;
    return proxy(() => jobs.create(body));
  });

  app.patch("/v1/jobs/:id", async (c) => {
    const denied = denyNonKey(c, "crons:write");
    if (denied !== null) {
      return denied;
    }
    const body = (await c.req.json().catch(() => ({}))) as unknown;
    return proxy(() => jobs.update(c.req.param("id"), body));
  });

  app.delete("/v1/jobs/:id", (c) => {
    return (
      denyNonKey(c, "crons:write") ?? proxy(() => jobs.remove(c.req.param("id")))
    );
  });

  const lifecycle: [string, (id: string) => Promise<unknown>][] = [
    ["pause", jobs.pause],
    ["resume", jobs.resume],
    ["run", jobs.trigger],
  ];
  for (const [action, fn] of lifecycle) {
    app.post(`/v1/jobs/:id/${action}`, (c) => {
      return denyNonKey(c, "crons:write") ?? proxy(() => fn(c.req.param("id")));
    });
  }
}
