import { pickReply, pickRunOutput, chunked } from "./replies.ts";
import {
  DEMO_VERSION,
  MODELS,
  JOBS,
  PROFILES,
  UPSTREAM_CAPABILITIES,
  UPSTREAM_HEALTH,
  renderConfig,
} from "./seed.ts";
import { MEMORY_LIMIT, USER_LIMIT, type DemoState } from "./state.ts";
import type { Delay, DemoMessage, DemoRun, DemoSession } from "./types.ts";

/** Scopes held by the example apps' management key. */
export const KEY_SCOPES = [
  "chat:invoke",
  "sessions:read",
  "sessions:write",
  "status:read",
  "config:read",
  "config:write",
  "memory:read",
  "memory:write",
  "soul:read",
  "soul:write",
  "crons:read",
  "events:subscribe",
];

/** Scopes user and anonymous principals hold implicitly (tier 1). */
const USER_GRANTABLE = new Set([
  "chat:invoke",
  "sessions:read",
  "sessions:write",
  "status:read",
  "events:subscribe",
]);

export type Principal =
  | { type: "anonymous" }
  | { type: "user"; id: string; email?: string }
  | { type: "api_key"; id: string; name: string; scopes: string[] };

function json(status: number, body: unknown): Response {
  return Response.json(body, { status });
}

function error(status: number, code: string, message: string): Response {
  return json(status, { error: { code, message } });
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length !== 3) {
    return null;
  }
  try {
    const normalized = (parts[1] as string).replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(atob(normalized)) as unknown;
    return typeof payload === "object" && payload !== null
      ? (payload as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export function principalFrom(header: string | null): Principal | Response {
  if (header === null || header === "") {
    return { type: "anonymous" };
  }
  const token = header.replace(/^Bearer\s+/i, "");
  if (token.startsWith("hk_")) {
    const id = token.slice(3).split(".")[0] as string;
    return { type: "api_key", id, name: "workstation", scopes: KEY_SCOPES };
  }
  const payload = decodeJwtPayload(token);
  if (payload === null || typeof payload["sub"] !== "string") {
    return error(401, "unauthorized", "Invalid bearer token");
  }
  return {
    type: "user",
    id: payload["sub"],
    ...(typeof payload["email"] === "string" ? { email: payload["email"] } : {}),
  };
}

/** Tier-1 scopes pass for everyone; anything else needs the API key. */
export function guard(principal: Principal, scope: string): Response | null {
  if (principal.type === "api_key") {
    return principal.scopes.includes(scope)
      ? null
      : error(403, "missing_scope", `This route requires the ${scope} scope`);
  }
  return USER_GRANTABLE.has(scope)
    ? null
    : error(403, "api_key_required", "This surface requires an API key");
}

function whoami(principal: Principal): unknown {
  if (principal.type === "api_key") {
    return {
      type: "api_key",
      id: principal.id,
      name: principal.name,
      scopes: principal.scopes,
    };
  }
  if (principal.type === "user") {
    return {
      type: "user",
      id: principal.id,
      ...(principal.email === undefined ? {} : { email: principal.email }),
    };
  }
  return { type: "anonymous" };
}

function cli(raw: string): Response {
  return json(200, { ok: true, raw });
}

interface StreamFlags {
  /** The consumer went away; stop emitting and do not close. */
  closed: boolean;
}

function sse(
  producer: (
    emit: (event: string, data: unknown) => void,
    flags: StreamFlags,
  ) => Promise<void>,
  onCancel: () => void,
  signal: AbortSignal | null = null,
): Response {
  const encoder = new TextEncoder();
  const flags: StreamFlags = { closed: false };
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      // A real fetch closes the body stream when the caller aborts. The demo
      // fetch is not wired to the browser's fetch machinery, so mirror that
      // here: an aborted request stops the producer and closes the stream, or
      // the consumer would keep reading events from a stream it abandoned.
      const stop = (): void => {
        if (!flags.closed) {
          flags.closed = true;
          onCancel();
          try {
            controller.close();
          } catch {
            // Already closed by the producer finishing first.
          }
        }
      };
      signal?.addEventListener("abort", stop);
      const emit = (event: string, data: unknown): void => {
        if (!flags.closed) {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
          );
        }
      };
      await producer(emit, flags);
      signal?.removeEventListener("abort", stop);
      if (!flags.closed) {
        controller.close();
      }
    },
    cancel() {
      flags.closed = true;
      onCancel();
    },
  });
  return new Response(stream, {
    headers: { "content-type": "text/event-stream", "cache-control": "no-cache" },
  });
}

function streamTurn(
  state: DemoState,
  delay: Delay,
  session: DemoSession,
  userMessage: DemoMessage,
  signal: AbortSignal | null,
): Response {
  if (state.turns.has(session.id)) {
    return error(409, "turn_in_flight", "A turn is already streaming for this session");
  }
  const turn = { aborted: false };
  state.turns.set(session.id, turn);
  const chunks = chunked(pickReply(userMessage.content));
  return sse(
    async (emit, flags) => {
      emit("user", userMessage);
      const assistant = state.addMessage(session, "assistant", "", "streaming");
      emit("assistant", { id: assistant.id });
      for (const chunk of chunks) {
        await delay(24);
        if (turn.aborted || flags.closed) {
          break;
        }
        assistant.content += chunk;
        emit("delta", { id: assistant.id, text: chunk });
      }
      assistant.status = "done";
      session.updatedAt = state.now().toISOString();
      state.turns.delete(session.id);
      emit("done", { ...assistant });
      state.bus.publish("turn.completed", { session: session.id });
    },
    () => {
      turn.aborted = true;
      state.turns.delete(session.id);
    },
    signal,
  );
}

function runEvents(delay: Delay, run: DemoRun, signal: AbortSignal | null): Response {
  return sse(
    async (emit, flags) => {
      emit("run.started", { run_id: run.id });
      for (const chunk of chunked(run.output)) {
        await delay(16);
        if (flags.closed) {
          return;
        }
        if (run.status === "stopped") {
          emit("run.stopped", { run_id: run.id, status: run.status });
          return;
        }
        emit("message.delta", { run_id: run.id, delta: chunk });
      }
      const type = run.status === "failed" ? "run.failed" : "run.completed";
      emit(type, { run_id: run.id, status: run.status, output: run.output });
    },
    () => {},
    signal,
  );
}

function eventFirehose(state: DemoState, delay: Delay, signal: AbortSignal | null): Response {
  const internal = new AbortController();
  signal?.addEventListener("abort", () => internal.abort());
  return sse(
    async (emit) => {
      for (const event of state.backlog) {
        await delay(120);
        if (internal.signal.aborted) {
          return;
        }
        emit(event.type, { at: event.at, ...event.data });
      }
      for await (const event of state.bus.subscribe(internal.signal)) {
        emit(event.type, { at: event.at, ...event.data });
      }
    },
    () => internal.abort(),
  );
}

async function parseBody(request: Request): Promise<Record<string, unknown> | null> {
  const body = (await request.json().catch(() => null)) as unknown;
  return typeof body === "object" && body !== null && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : null;
}

interface Ctx {
  state: DemoState;
  delay: Delay;
  principal: Principal;
  request: Request;
  profile: string | null;
}

function sessionFor(ctx: Ctx, id: string): DemoSession | Response {
  const session = ctx.state.sessions.get(id);
  if (session === undefined) {
    return error(404, "session_not_found", "Unknown session");
  }
  return session;
}

async function handleSessions(ctx: Ctx, method: string, rest: string): Promise<Response | null> {
  const { state, principal } = ctx;
  if (rest === "" && method === "POST") {
    const denied = guard(principal, "sessions:write");
    return (
      denied ??
      json(201, state.createSession(principal.type === "user" ? principal.id : null))
    );
  }
  if (rest === "" && method === "GET") {
    return guard(principal, "sessions:read") ?? json(200, { sessions: state.listSessions() });
  }
  let match = rest.match(/^\/([0-9a-f]+)$/);
  if (match !== null && method === "DELETE") {
    const denied = guard(principal, "sessions:write");
    if (denied !== null) return denied;
    const session = sessionFor(ctx, match[1] as string);
    if (session instanceof Response) {
      return session;
    }
    state.sessions.delete(session.id);
    return json(200, { deleted: true });
  }
  match = rest.match(/^\/([0-9a-f]+)\/stop$/);
  if (match !== null && method === "POST") {
    const denied = guard(principal, "chat:invoke");
    if (denied !== null) return denied;
    const session = sessionFor(ctx, match[1] as string);
    if (session instanceof Response) {
      return session;
    }
    const turn = state.turns.get(session.id);
    if (turn !== undefined) {
      turn.aborted = true;
    }
    return json(200, { stopped: turn !== undefined });
  }
  match = rest.match(/^\/([0-9a-f]+)\/messages$/);
  if (match !== null && method === "GET") {
    const denied = guard(principal, "sessions:read");
    if (denied !== null) return denied;
    const session = sessionFor(ctx, match[1] as string);
    if (session instanceof Response) {
      return session;
    }
    return json(200, { messages: session.messages, total: session.messages.length });
  }
  if (match !== null && method === "POST") {
    const denied = guard(principal, "chat:invoke");
    if (denied !== null) return denied;
    const session = sessionFor(ctx, match[1] as string);
    if (session instanceof Response) {
      return session;
    }
    const body = await parseBody(ctx.request);
    const content = body?.["content"];
    if (typeof content !== "string" || content.trim() === "") {
      return error(400, "invalid_message", "content (string) is required");
    }
    const userMessage = state.addMessage(session, "user", content, "done");
    return streamTurn(state, ctx.delay, session, userMessage, ctx.request.signal);
  }
  match = rest.match(/^\/([0-9a-f]+)\/messages\/([0-9a-f]+)$/);
  if (match !== null && method === "PATCH") {
    const denied = guard(principal, "chat:invoke");
    if (denied !== null) return denied;
    const session = sessionFor(ctx, match[1] as string);
    if (session instanceof Response) {
      return session;
    }
    const body = await parseBody(ctx.request);
    const content = body?.["content"];
    if (typeof content !== "string" || content.trim() === "") {
      return error(400, "invalid_message", "content (string) is required");
    }
    const edited = state.editMessage(session, match[2] as string, content);
    if (edited === null) {
      return error(404, "message_not_found", "Unknown editable user message");
    }
    return streamTurn(state, ctx.delay, session, edited, ctx.request.signal);
  }
  match = rest.match(/^\/([0-9a-f]+)\/messages\/([0-9a-f]+)\/reactions$/);
  if (match !== null && method === "POST") {
    const denied = guard(principal, "sessions:write");
    if (denied !== null) return denied;
    const session = sessionFor(ctx, match[1] as string);
    if (session instanceof Response) {
      return session;
    }
    const body = await parseBody(ctx.request);
    const emoji = body?.["emoji"];
    if (typeof emoji !== "string" || emoji === "") {
      return error(400, "invalid_reaction", "emoji (string) is required");
    }
    const message = state.toggleReaction(session, match[2] as string, emoji);
    if (message === null) {
      return error(404, "message_not_found", "Unknown message");
    }
    return json(200, message);
  }
  return null;
}

async function handleRuns(ctx: Ctx, method: string, rest: string): Promise<Response | null> {
  const { state, principal } = ctx;
  const denied = guard(principal, "chat:invoke");
  if (denied !== null) return denied;
  if (rest === "" && method === "POST") {
    const body = await parseBody(ctx.request);
    const input = typeof body?.["input"] === "string" ? (body["input"] as string) : "";
    const run = state.createRun(input, pickRunOutput(input));
    return json(201, { ...run });
  }
  if (rest === "" && method === "GET") {
    const runs = [...state.runs.values()]
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
      .map((run) => ({ id: run.id, createdAt: run.created_at }));
    return json(200, { runs });
  }
  const match = rest.match(/^\/([A-Za-z0-9_-]+)(\/events|\/stop)?$/);
  if (match === null) {
    return null;
  }
  const run = state.runs.get(match[1] as string);
  if (run === undefined) {
    return error(404, "run_not_found", "Unknown run");
  }
  const tail = match[2];
  if (tail === undefined && method === "GET") {
    return json(200, { ...run });
  }
  if (tail === "/events" && method === "GET") {
    return runEvents(ctx.delay, run, ctx.request.signal);
  }
  if (tail === "/stop" && method === "POST") {
    run.status = "stopped";
    state.bus.publish("run.stopped", { id: run.id });
    return json(200, { ...run });
  }
  return null;
}

async function handleMemory(ctx: Ctx, method: string, rest: string): Promise<Response | null> {
  const home = ctx.state.home(ctx.profile);
  if (home === null) {
    return error(404, "unknown_profile", "Unknown hermes profile");
  }
  if ((rest === "" || rest === "/user") && method === "GET") {
    const denied = guard(ctx.principal, "memory:read");
    if (denied !== null) return denied;
    const content = rest === "" ? home.memory : home.user;
    const limit = rest === "" ? MEMORY_LIMIT : USER_LIMIT;
    return json(200, { content, chars: content.length, limit });
  }
  if ((rest === "" || rest === "/user") && method === "PUT") {
    const denied = guard(ctx.principal, "memory:write");
    if (denied !== null) return denied;
    const body = await parseBody(ctx.request);
    const content = body?.["content"];
    if (typeof content !== "string") {
      return error(400, "invalid_request", "content (string) is required");
    }
    const limit = rest === "" ? MEMORY_LIMIT : USER_LIMIT;
    if (content.length > limit) {
      return error(400, "memory_overflow", `content exceeds ${limit} chars`);
    }
    if (rest === "") {
      home.memory = content;
    } else {
      home.user = content;
    }
    ctx.state.bus.publish("memory.updated", {
      file: rest === "" ? "memories/MEMORY.md" : "memories/USER.md",
    });
    return json(200, { content, chars: content.length, limit });
  }
  if (rest === "/entries" && method === "POST") {
    const denied = guard(ctx.principal, "memory:write");
    if (denied !== null) return denied;
    const body = await parseBody(ctx.request);
    const action = body?.["action"];
    const text = typeof body?.["text"] === "string" ? (body["text"] as string) : null;
    if (text === null || (action !== "add" && action !== "replace" && action !== "remove")) {
      return error(400, "invalid_request", "action (add|replace|remove) and text are required");
    }
    const lines = home.memory === "" ? [] : home.memory.split("\n");
    if (action === "add") {
      lines.push(text);
    } else if (action === "replace") {
      const from = typeof body?.["from"] === "string" ? (body["from"] as string) : "";
      const index = lines.indexOf(from);
      if (index === -1) {
        return error(404, "entry_not_found", "No matching memory entry");
      }
      lines[index] = text;
    } else {
      const index = lines.indexOf(text);
      if (index === -1) {
        return error(404, "entry_not_found", "No matching memory entry");
      }
      lines.splice(index, 1);
    }
    const next = lines.join("\n");
    if (next.length > MEMORY_LIMIT) {
      return error(400, "memory_overflow", `content exceeds ${MEMORY_LIMIT} chars`);
    }
    home.memory = next;
    ctx.state.bus.publish("memory.updated", { file: "memories/MEMORY.md" });
    return json(200, { content: next, chars: next.length, limit: MEMORY_LIMIT });
  }
  return null;
}

async function handleConfig(ctx: Ctx, method: string, rest: string): Promise<Response | null> {
  const home = ctx.state.home(ctx.profile);
  if (home === null) {
    return error(404, "unknown_profile", "Unknown hermes profile");
  }
  if (rest === "" && method === "GET") {
    return guard(ctx.principal, "config:read") ?? cli(renderConfig(home.config));
  }
  const match = rest.match(/^\/([A-Za-z0-9_.-]+)$/);
  if (match === null) {
    return null;
  }
  const key = match[1] as string;
  if (method === "GET") {
    const denied = guard(ctx.principal, "config:read");
    if (denied !== null) return denied;
    const value = home.config[key];
    return value === undefined
      ? json(502, { error: { code: "cli_error", message: `Key '${key}' not found` } })
      : cli(value);
  }
  if (method === "PUT") {
    const denied = guard(ctx.principal, "config:write");
    if (denied !== null) return denied;
    const body = await parseBody(ctx.request);
    const value = body?.["value"];
    if (typeof value !== "string" || value === "") {
      return error(400, "invalid_request", "value is required");
    }
    home.config[key] = value;
    return cli(`Set ${key} = ${value}`);
  }
  if (method === "DELETE") {
    const denied = guard(ctx.principal, "config:write");
    if (denied !== null) return denied;
    delete home.config[key];
    return cli(`Unset ${key}`);
  }
  return null;
}

async function handleSoul(ctx: Ctx, method: string, rest: string): Promise<Response | null> {
  const home = ctx.state.home(ctx.profile);
  if (home === null) {
    return error(404, "unknown_profile", "Unknown hermes profile");
  }
  if (rest !== "") {
    return null;
  }
  if (method === "GET") {
    return guard(ctx.principal, "soul:read") ?? json(200, { content: home.soul });
  }
  if (method === "PUT") {
    const denied = guard(ctx.principal, "soul:write");
    if (denied !== null) return denied;
    const body = await parseBody(ctx.request);
    const content = body?.["content"];
    if (typeof content !== "string") {
      return error(400, "invalid_request", "content (string) is required");
    }
    home.soul = content;
    return json(200, { content });
  }
  return null;
}

export async function handle(
  state: DemoState,
  delay: Delay,
  request: Request,
): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method.toUpperCase();
  const auth = principalFrom(request.headers.get("authorization"));
  if (auth instanceof Response) {
    return auth;
  }
  const ctx: Ctx = {
    state,
    delay,
    principal: auth,
    request,
    profile: request.headers.get("x-hermes-profile"),
  };
  if (path === "/v1/status" && method === "GET") {
    return json(200, { ok: true, version: DEMO_VERSION });
  }
  if (path === "/v1/auth/whoami" && method === "GET") {
    return json(200, whoami(auth));
  }
  if (path === "/v1/health" && method === "GET") {
    const denied = guard(auth, "status:read");
    return (
      denied ?? json(200, { status: "ok", version: DEMO_VERSION, upstream: UPSTREAM_HEALTH })
    );
  }
  if (path === "/v1/capabilities" && method === "GET") {
    const denied = guard(auth, "status:read");
    return (
      denied ??
      json(200, {
        object: "hermes-remote.capabilities",
        version: DEMO_VERSION,
        auth: { provider: "jwt" },
        anonymous: true,
        features: { chat: true, runs: true, jobs: true, discovery: true },
        upstream: UPSTREAM_CAPABILITIES,
      })
    );
  }
  if (path === "/v1/models" && method === "GET") {
    return guard(auth, "status:read") ?? json(200, MODELS);
  }
  if (path === "/v1/profiles" && method === "GET") {
    return guard(auth, "status:read") ?? json(200, { profiles: PROFILES });
  }
  if (path === "/v1/agent/status" && method === "GET") {
    if (auth.type !== "api_key") {
      return error(403, "api_key_required", "Agent status is read with an API key");
    }
    const denied = guard(auth, "status:read");
    if (denied !== null) return denied;
    const home = state.home(ctx.profile);
    return home === null
      ? error(404, "unknown_profile", "Unknown hermes profile")
      : cli(home.status);
  }
  if (path === "/v1/jobs" && method === "GET") {
    if (auth.type !== "api_key") {
      return error(403, "api_key_required", "Jobs are managed with an API key");
    }
    return guard(auth, "crons:read") ?? json(200, { jobs: JOBS });
  }
  if (path === "/v1/events" && method === "GET") {
    const denied = guard(auth, "events:subscribe");
    return denied ?? eventFirehose(state, delay, request.signal);
  }
  let response: Response | null = null;
  if (path.startsWith("/v1/sessions")) {
    response = await handleSessions(ctx, method, path.slice("/v1/sessions".length));
  } else if (path.startsWith("/v1/runs")) {
    response = await handleRuns(ctx, method, path.slice("/v1/runs".length));
  } else if (path.startsWith("/v1/memory")) {
    response = await handleMemory(ctx, method, path.slice("/v1/memory".length));
  } else if (path.startsWith("/v1/config")) {
    response = await handleConfig(ctx, method, path.slice("/v1/config".length));
  } else if (path.startsWith("/v1/soul")) {
    response = await handleSoul(ctx, method, path.slice("/v1/soul".length));
  }
  return response ?? error(404, "not_found", `No demo route for ${method} ${path}`);
}
