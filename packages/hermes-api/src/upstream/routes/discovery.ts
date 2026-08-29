import type { Hono } from "hono";
import { json, requireScope, type ChatEnv } from "../../chat/routes/shared.ts";
import { proxy, type UpstreamRouteOptions } from "./shared.ts";

function upstreamStatus(health: unknown): string {
  const status = (health as { status?: unknown }).status;
  return typeof status === "string" ? status : "ok";
}

export function registerDiscoveryRoutes(
  app: Hono<ChatEnv>,
  options: UpstreamRouteOptions,
): void {
  const { discovery } = options.upstream;

  const statusRoutes: [string, () => Promise<unknown>][] = [
    ["/v1/models", discovery.models],
    ["/v1/models/options", discovery.modelOptions],
  ];
  for (const [path, fn] of statusRoutes) {
    app.get(path, (c) => {
      const denied = requireScope(c.get("principal"), "status:read");
      return denied ?? proxy(fn);
    });
  }

  app.get("/v1/health", async (c) => {
    const denied = requireScope(c.get("principal"), "status:read");
    if (denied !== null) {
      return denied;
    }
    const health = await discovery.health().catch(() => null);
    if (health === null) {
      return json(200, { status: "unreachable", version: options.version, upstream: null });
    }
    return json(200, {
      status: upstreamStatus(health),
      version: options.version,
      upstream: health,
    });
  });

  app.get("/v1/capabilities", async (c) => {
    const denied = requireScope(c.get("principal"), "status:read");
    if (denied !== null) {
      return denied;
    }
    return json(200, {
      object: "hermes-remote.capabilities",
      version: options.version,
      auth: { provider: options.authProviderName ?? null },
      anonymous: options.anonymous,
      features: { chat: true, runs: true, jobs: true, discovery: true },
      upstream: await discovery.capabilities().catch(() => null),
    });
  });

  app.get("/v1/skills", (c) => {
    const denied = requireScope(c.get("principal"), "skills:read");
    return denied ?? proxy(discovery.skills);
  });

  app.get("/v1/toolsets", (c) => {
    const denied = requireScope(c.get("principal"), "toolsets:read");
    return denied ?? proxy(discovery.toolsets);
  });
}
