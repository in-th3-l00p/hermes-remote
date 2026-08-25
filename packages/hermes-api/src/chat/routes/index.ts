import type { Principal } from "../../auth/index.ts";
import type { Limits } from "../../limits/index.ts";
import { handleMessageRoutes } from "./messages.ts";
import { handleSessionRoutes } from "./sessions.ts";
import type { ChatOptions } from "./shared.ts";

export type { ChatOptions } from "./shared.ts";

/** Returns null when the request doesn't match a chat route. */
export async function handleChatRoute(
  request: Request,
  url: URL,
  options: ChatOptions,
  principal: Principal,
  limits: Limits,
): Promise<Response | null> {
  const sessionResponse = handleSessionRoutes(request, url, options, principal);
  if (sessionResponse !== null) {
    return sessionResponse;
  }
  return handleMessageRoutes(request, url, options, principal, limits);
}
