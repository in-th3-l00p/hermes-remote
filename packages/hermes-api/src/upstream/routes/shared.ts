import type { Context } from "hono";
import { HermesUpstreamError } from "../../chat/index.ts";
import { error, json, type ChatEnv } from "../../chat/routes/shared.ts";
import { principalKey } from "../../auth/index.ts";
import type { EventBus } from "../../events/index.ts";
import type { RunStore } from "../run-store.ts";
import type { Upstream } from "../types.ts";

export interface UpstreamRouteOptions {
  upstream: Upstream;
  runStore: RunStore;
  version: string;
  authProviderName?: string;
  anonymous: boolean;
  events?: EventBus;
  /** Poll cadence for templated tool runs. */
  pollMs?: number;
  toolRunTimeoutMs?: number;
}

export function upstreamFailure(cause: unknown): Response {
  if (cause instanceof HermesUpstreamError) {
    return Response.json(
      {
        error: {
          code: "upstream_error",
          message: cause.message,
          upstreamStatus: cause.status,
        },
      },
      { status: 502 },
    );
  }
  throw cause;
}

export async function proxy(fn: () => Promise<unknown>): Promise<Response> {
  try {
    return json(200, await fn());
  } catch (cause) {
    return upstreamFailure(cause);
  }
}

/** Users and guests may only touch runs they created; api keys see all. */
export function denyUnownedRun(
  c: Context<ChatEnv>,
  runStore: RunStore,
): Response | null {
  const principal = c.get("principal");
  const record = runStore.get(c.req.param("id") ?? "");
  if (
    record === null ||
    (principal.type !== "api_key" && record.principal !== principalKey(principal))
  ) {
    return error(404, "run_not_found", "Unknown run");
  }
  return null;
}
