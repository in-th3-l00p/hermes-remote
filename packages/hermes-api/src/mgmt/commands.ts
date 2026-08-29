import type { Context, Hono } from "hono";
import { error, json, type ChatEnv } from "../chat/routes/shared.ts";
import type { Scope } from "../scopes/index.ts";
import type { Upstream } from "../upstream/types.ts";
import type { EventBus } from "../events/index.ts";
import { upstreamFailure } from "../upstream/routes/shared.ts";
import { requireKeyScope } from "./shared.ts";

export const COMMAND_SCOPES: Record<string, Scope> = {
  "/goal": "goals:write",
  "/subgoal": "goals:write",
  "/title": "sessions:write-all",
  "/model": "providers:manage",
  "/busy": "chat:invoke",
  "/rollback": "checkpoints:rollback",
  "/context": "status:read",
  "/status": "status:read",
  "/journey": "memory:read",
  "/personality": "soul:write",
  "/skills": "skills:write",
  "/cron": "crons:write",
  "/sessions": "sessions:read-all",
  "/hatch": "chat:invoke",
};

export interface RelayedEvent {
  event: string;
  data: unknown;
}

export interface CommandRelayOptions {
  upstream: Upstream;
  events?: EventBus;
  /** Whether the upstream intercepts slash commands over session chat. */
  commandRelay: boolean;
  relayTimeoutMs?: number;
}

function parseFrames(text: string): RelayedEvent[] {
  const frames: RelayedEvent[] = [];
  for (const block of text.split("\n\n")) {
    let event = "message";
    let data = "";
    for (const line of block.split("\n")) {
      if (line.startsWith("event: ")) {
        event = line.slice(7);
      } else if (line.startsWith("data: ")) {
        data += line.slice(6);
      }
    }
    if (data === "") {
      continue;
    }
    try {
      frames.push({ event, data: JSON.parse(data) });
    } catch {
      frames.push({ event, data });
    }
  }
  return frames;
}

export async function relayCommand(
  options: CommandRelayOptions,
  sessionId: string,
  command: string,
): Promise<RelayedEvent[]> {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    options.relayTimeoutMs ?? 60_000,
  );
  try {
    const stream = await options.upstream.sessions.chatStream(
      sessionId,
      { message: command },
      controller.signal,
    );
    const text = await new Response(stream).text();
    return parseFrames(text);
  } finally {
    clearTimeout(timer);
  }
}

export function commandScope(command: string): Scope | null {
  const head = command.trim().split(/\s+/)[0] ?? "";
  const base = `/${head.replace(/^\//, "").split(" ")[0]}`;
  return COMMAND_SCOPES[base] ?? null;
}

export async function runCommand(
  c: Context<ChatEnv>,
  options: CommandRelayOptions,
  sessionId: string,
  command: string,
): Promise<Response> {
  if (!options.commandRelay) {
    return error(
      501,
      "not_supported",
      "Slash-command relay is disabled on this server",
    );
  }
  try {
    const events = await relayCommand(options, sessionId, command);
    options.events?.publish("command", { sessionId, command: command.split(/\s+/)[0] });
    return json(200, { ok: true, events });
  } catch (cause) {
    return upstreamFailure(cause);
  }
}

export function registerCommandRoutes(
  app: Hono<ChatEnv>,
  options: CommandRelayOptions,
): void {
  app.get("/v1/commands", (c) => {
    void c;
    return json(200, {
      relay: options.commandRelay,
      commands: Object.entries(COMMAND_SCOPES).map(([command, scope]) => ({
        command,
        scope,
      })),
    });
  });

  app.post("/v1/agent/sessions/:id{[A-Za-z0-9_-]+}/commands", async (c) => {
    const body = (await c.req.json().catch(() => null)) as {
      command?: unknown;
    } | null;
    const command = body?.command;
    if (typeof command !== "string" || !command.startsWith("/")) {
      return error(400, "invalid_request", "command (starting with /) is required");
    }
    const scope = commandScope(command);
    if (scope === null) {
      return error(400, "unknown_command", "Command is not in the allowlist");
    }
    const denied = requireKeyScope(c.get("principal"), scope);
    if (denied !== null) {
      return denied;
    }
    return runCommand(c, options, c.req.param("id"), command);
  });
}
