import { keepAlive } from "../../http/keepalive.ts";
import type { Hono } from "hono";
import { principalKey } from "../../auth/index.ts";
import { error, json, requireScope, type ChatEnv } from "../../chat/routes/shared.ts";
import { injectRunIdentity } from "../identity.ts";
import {
  denyUnownedRun,
  proxy,
  upstreamFailure,
  type UpstreamRouteOptions,
} from "./shared.ts";

function createdRunId(created: unknown): string | null {
  const body = created as { id?: unknown; run_id?: unknown };
  if (typeof body.id === "string" && body.id !== "") {
    return body.id;
  }
  if (typeof body.run_id === "string" && body.run_id !== "") {
    return body.run_id;
  }
  return null;
}

/** Serialized size cap for a run's input; runs go to a paid upstream model. */
const MAX_RUN_INPUT = 100_000;

export function registerRunRoutes(
  app: Hono<ChatEnv>,
  options: UpstreamRouteOptions,
): void {
  const { runs } = options.upstream;
  const { runStore } = options;

  app.post("/v1/runs", async (c) => {
    const principal = c.get("principal");
    const denied = requireScope(principal, "chat:invoke");
    if (denied !== null) {
      return denied;
    }
    const body = (await c.req.json().catch(() => null)) as unknown;
    if (body === null || typeof body !== "object" || Array.isArray(body)) {
      return error(400, "invalid_run", "A JSON object body is required");
    }
    if (JSON.stringify((body as Record<string, unknown>)["input"] ?? "").length > MAX_RUN_INPUT) {
      return error(400, "invalid_run", `input is limited to ${MAX_RUN_INPUT} characters`);
    }
    const payload =
      principal.type === "api_key"
        ? (body as Record<string, unknown>)
        : injectRunIdentity(body as Record<string, unknown>, principal);
    if (payload === null) {
      return error(400, "invalid_run", "input must be a string or an array of messages");
    }
    try {
      const created = await runs.create(payload);
      const id = createdRunId(created);
      if (id === null) {
        return error(502, "upstream_error", "Upstream did not return a run id");
      }
      runStore.record(id, principalKey(principal));
      options.events?.publish("run.created", { id });
      return json(201, created);
    } catch (cause) {
      return upstreamFailure(cause);
    }
  });

  app.get("/v1/runs", (c) => {
    const principal = c.get("principal");
    const denied = requireScope(principal, "chat:invoke");
    if (denied !== null) {
      return denied;
    }
    const owner = principal.type === "api_key" ? null : principalKey(principal);
    return json(200, { runs: runStore.list(owner) });
  });

  app.get("/v1/runs/:id", (c) => {
    const denied =
      requireScope(c.get("principal"), "chat:invoke") ??
      denyUnownedRun(c, runStore);
    return denied ?? proxy(() => runs.get(c.req.param("id")));
  });

  app.get("/v1/runs/:id/events", async (c) => {
    const denied =
      requireScope(c.get("principal"), "chat:invoke") ??
      denyUnownedRun(c, runStore);
    if (denied !== null) {
      return denied;
    }
    try {
      const stream = await runs.events(c.req.param("id"), c.req.raw.signal);
      return new Response(keepAlive(stream), {
        headers: { "content-type": "text/event-stream" },
      });
    } catch (cause) {
      return upstreamFailure(cause);
    }
  });

  app.post("/v1/runs/:id/stop", (c) => {
    const denied =
      requireScope(c.get("principal"), "chat:invoke") ??
      denyUnownedRun(c, runStore);
    if (denied !== null) {
      return denied;
    }
    options.events?.publish("run.stopped", { id: c.req.param("id") });
    return proxy(() => runs.stop(c.req.param("id")));
  });

  app.post("/v1/runs/:id/steer", async (c) => {
    const denied =
      requireScope(c.get("principal"), "chat:invoke") ??
      denyUnownedRun(c, runStore);
    if (denied !== null) {
      return denied;
    }
    const body = (await c.req.json().catch(() => ({}))) as unknown;
    return proxy(() => runs.steer(c.req.param("id"), body));
  });

  app.post("/v1/runs/:id/approval", async (c) => {
    const denied =
      requireScope(c.get("principal"), "chat:invoke") ??
      denyUnownedRun(c, runStore);
    if (denied !== null) {
      return denied;
    }
    const body = (await c.req.json().catch(() => ({}))) as unknown;
    return proxy(() => runs.approve(c.req.param("id"), body));
  });
}
