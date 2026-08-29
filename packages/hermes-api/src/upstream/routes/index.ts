import { Hono } from "hono";
import type { ChatEnv } from "../../chat/routes/shared.ts";
import { registerDiscoveryRoutes } from "./discovery.ts";
import { registerJobRoutes } from "./jobs.ts";
import { registerRunRoutes } from "./runs.ts";
import type { UpstreamRouteOptions } from "./shared.ts";

export type { UpstreamRouteOptions } from "./shared.ts";

export function upstreamRoutes(options: UpstreamRouteOptions): Hono<ChatEnv> {
  const app = new Hono<ChatEnv>();
  registerDiscoveryRoutes(app, options);
  registerRunRoutes(app, options);
  registerJobRoutes(app, options);
  return app;
}
