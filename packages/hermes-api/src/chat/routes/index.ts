import { Hono } from "hono";
import type { Limits } from "../../limits/index.ts";
import { registerMessageRoutes } from "./messages.ts";
import { registerSessionRoutes } from "./sessions.ts";
import type { ChatEnv, ChatOptions } from "./shared.ts";

export type { ChatEnv, ChatOptions } from "./shared.ts";

export function chatRoutes(options: ChatOptions, limits: Limits): Hono<ChatEnv> {
  const app = new Hono<ChatEnv>();
  registerSessionRoutes(app, options);
  registerMessageRoutes(app, options, limits);
  return app;
}
