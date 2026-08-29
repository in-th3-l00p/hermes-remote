import { Database } from "bun:sqlite";
import type { Context, Hono } from "hono";
import { error, json, type ChatEnv } from "../chat/routes/shared.ts";
import { currentProfile, requireKeyScope, type ManagementOptions } from "./shared.ts";
import { runCommand, type CommandRelayOptions } from "./commands.ts";

export interface GoalGate {
  command: string;
  passing: boolean | null;
}

export interface GoalState {
  text: string | null;
  contract: Record<string, unknown> | null;
  subgoals: string[];
  gates: GoalGate[];
  turns: { used: number; max: number } | null;
  wait: Record<string, unknown> | null;
  verdict: string | null;
  raw: unknown;
}

function asObject(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function toGates(value: unknown): GoalGate[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((gate) => {
    if (typeof gate === "string") {
      return { command: gate, passing: null };
    }
    const record = asObject(gate) ?? {};
    return {
      command: typeof record["command"] === "string" ? record["command"] : "",
      passing:
        typeof record["passing"] === "boolean" ? record["passing"] : null,
    };
  });
}

export function toGoalState(value: unknown): GoalState {
  const record = asObject(value) ?? {};
  const used = record["turns_used"] ?? record["turn_count"];
  const max = record["max_turns"];
  return {
    text:
      typeof record["text"] === "string"
        ? record["text"]
        : typeof record["goal"] === "string"
          ? record["goal"]
          : null,
    contract: asObject(record["contract"]),
    subgoals: Array.isArray(record["subgoals"])
      ? record["subgoals"].filter((s): s is string => typeof s === "string")
      : [],
    gates: toGates(record["gates"]),
    turns:
      typeof used === "number" && typeof max === "number"
        ? { used, max }
        : null,
    wait: asObject(record["wait"]),
    verdict: typeof record["verdict"] === "string" ? record["verdict"] : null,
    raw: value,
  };
}

/** Read-only view over the agent's SessionDB goal state. */
export class GoalStore {
  constructor(private readonly statePath: string) {}

  get(sessionId: string): GoalState | null {
    let db: Database;
    try {
      db = new Database(this.statePath, { readonly: true });
    } catch {
      return null;
    }
    try {
      const row = db
        .query<{ value: string }, [string]>(
          "SELECT value FROM state_meta WHERE key = ?",
        )
        .get(`goal:${sessionId}`);
      if (row === null) {
        return null;
      }
      try {
        return toGoalState(JSON.parse(row.value));
      } catch {
        return toGoalState({ text: row.value });
      }
    } catch {
      return null;
    } finally {
      db.close();
    }
  }
}

export interface GoalRouteOptions extends CommandRelayOptions {
  management: ManagementOptions;
}

const SESSION = ":id{[A-Za-z0-9_-]+}";

export function registerGoalRoutes(
  app: Hono<ChatEnv>,
  options: GoalRouteOptions,
): void {
  const store = (c: Context<ChatEnv>): GoalStore =>
    new GoalStore(`${options.management.homeFor(currentProfile(c))}/state.db`);

  const relay = (c: Context<ChatEnv>, command: string): Promise<Response> =>
    runCommand(c, options, c.req.param("id") ?? "", command);

  const writeGuard = (c: Context<ChatEnv>): Response | null =>
    requireKeyScope(c.get("principal"), "goals:write");

  app.get(`/v1/agent/sessions/${SESSION}/goal`, (c) => {
    const denied = requireKeyScope(c.get("principal"), "goals:read");
    if (denied !== null) {
      return denied;
    }
    const goal = store(c).get(c.req.param("id"));
    if (goal === null) {
      return error(404, "goal_not_found", "No goal for this session");
    }
    return json(200, goal);
  });

  app.put(`/v1/agent/sessions/${SESSION}/goal`, async (c) => {
    const denied = writeGuard(c);
    if (denied !== null) {
      return denied;
    }
    const body = (await c.req.json().catch(() => null)) as {
      text?: unknown;
      draft?: unknown;
    } | null;
    if (typeof body?.text !== "string" || body.text.trim() === "") {
      return error(400, "invalid_request", "text (string) is required");
    }
    return relay(
      c,
      body.draft === true ? `/goal draft ${body.text}` : `/goal ${body.text}`,
    );
  });

  app.delete(`/v1/agent/sessions/${SESSION}/goal`, (c) => {
    return writeGuard(c) ?? relay(c, "/goal clear");
  });
  app.post(`/v1/agent/sessions/${SESSION}/goal/pause`, (c) => {
    return writeGuard(c) ?? relay(c, "/goal pause");
  });
  app.post(`/v1/agent/sessions/${SESSION}/goal/resume`, (c) => {
    return writeGuard(c) ?? relay(c, "/goal resume");
  });

  app.post(`/v1/agent/sessions/${SESSION}/goal/wait`, async (c) => {
    const denied = writeGuard(c);
    if (denied !== null) {
      return denied;
    }
    const body = (await c.req.json().catch(() => null)) as {
      pid?: unknown;
      reason?: unknown;
    } | null;
    if (typeof body?.pid !== "number") {
      return error(400, "invalid_request", "pid (number) is required");
    }
    const reason = typeof body.reason === "string" ? ` ${body.reason}` : "";
    return relay(c, `/goal wait ${body.pid}${reason}`);
  });
  app.post(`/v1/agent/sessions/${SESSION}/goal/unwait`, (c) => {
    return writeGuard(c) ?? relay(c, "/goal unwait");
  });

  app.get(`/v1/agent/sessions/${SESSION}/goal/gates`, (c) => {
    const denied = requireKeyScope(c.get("principal"), "goals:read");
    if (denied !== null) {
      return denied;
    }
    const goal = store(c).get(c.req.param("id"));
    return json(200, { gates: goal?.gates ?? [] });
  });
  app.post(`/v1/agent/sessions/${SESSION}/goal/gates`, async (c) => {
    const denied = writeGuard(c);
    if (denied !== null) {
      return denied;
    }
    const body = (await c.req.json().catch(() => null)) as {
      command?: unknown;
    } | null;
    if (typeof body?.command !== "string" || body.command.trim() === "") {
      return error(400, "invalid_request", "command (string) is required");
    }
    return relay(c, `/goal gate add ${body.command}`);
  });
  app.delete(`/v1/agent/sessions/${SESSION}/goal/gates/:n{[0-9]+}`, (c) => {
    return writeGuard(c) ?? relay(c, `/goal gate remove ${c.req.param("n")}`);
  });
  app.delete(`/v1/agent/sessions/${SESSION}/goal/gates`, (c) => {
    return writeGuard(c) ?? relay(c, "/goal gate clear");
  });

  app.get(`/v1/agent/sessions/${SESSION}/goal/subgoals`, (c) => {
    const denied = requireKeyScope(c.get("principal"), "goals:read");
    if (denied !== null) {
      return denied;
    }
    const goal = store(c).get(c.req.param("id"));
    return json(200, { subgoals: goal?.subgoals ?? [] });
  });
  app.post(`/v1/agent/sessions/${SESSION}/goal/subgoals`, async (c) => {
    const denied = writeGuard(c);
    if (denied !== null) {
      return denied;
    }
    const body = (await c.req.json().catch(() => null)) as {
      text?: unknown;
    } | null;
    if (typeof body?.text !== "string" || body.text.trim() === "") {
      return error(400, "invalid_request", "text (string) is required");
    }
    return relay(c, `/subgoal ${body.text}`);
  });
  app.delete(`/v1/agent/sessions/${SESSION}/goal/subgoals/:n{[0-9]+}`, (c) => {
    return writeGuard(c) ?? relay(c, `/subgoal remove ${c.req.param("n")}`);
  });
  app.delete(`/v1/agent/sessions/${SESSION}/goal/subgoals`, (c) => {
    return writeGuard(c) ?? relay(c, "/subgoal clear");
  });
}
