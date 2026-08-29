import type { HttpClient } from "./http.ts";
import type { SseEvent } from "./sse.ts";

/** The agent's own session store (API-key surface). */
export class AgentSessionsResource {
  constructor(private readonly http: HttpClient) {}

  list<T = unknown>(): Promise<T> {
    return this.http.request("GET", "/v1/agent/sessions");
  }

  create<T = unknown>(body: unknown = {}): Promise<T> {
    return this.http.request("POST", "/v1/agent/sessions", body);
  }

  get<T = unknown>(id: string): Promise<T> {
    return this.http.request("GET", `/v1/agent/sessions/${id}`);
  }

  update<T = unknown>(id: string, body: unknown): Promise<T> {
    return this.http.request("PATCH", `/v1/agent/sessions/${id}`, body);
  }

  remove<T = unknown>(id: string): Promise<T> {
    return this.http.request("DELETE", `/v1/agent/sessions/${id}`);
  }

  messages<T = unknown>(id: string): Promise<T> {
    return this.http.request("GET", `/v1/agent/sessions/${id}/messages`);
  }

  fork<T = unknown>(id: string, body: unknown = {}): Promise<T> {
    return this.http.request("POST", `/v1/agent/sessions/${id}/fork`, body);
  }

  modelLock<T = unknown>(id: string, model: string): Promise<T> {
    return this.http.request("POST", `/v1/agent/sessions/${id}/model`, { model });
  }

  chat<T = unknown>(id: string, message: string): Promise<T> {
    return this.http.request("POST", `/v1/agent/sessions/${id}/chat`, { message });
  }

  chatStream(
    id: string,
    message: string,
    signal?: AbortSignal,
  ): AsyncIterable<SseEvent> {
    return this.http.stream(
      "POST",
      `/v1/agent/sessions/${id}/chat/stream`,
      { message },
      signal,
    );
  }
}

export interface CommandInfo {
  command: string;
  scope: string;
}

export interface CommandResult {
  ok: boolean;
  events: { event: string; data: unknown }[];
}

/** Slash commands over agent sessions. */
export class CommandsResource {
  constructor(private readonly http: HttpClient) {}

  list(): Promise<{ relay: boolean; commands: CommandInfo[] }> {
    return this.http.request("GET", "/v1/commands");
  }

  run(sessionId: string, command: string): Promise<CommandResult> {
    return this.http.request(
      "POST",
      `/v1/agent/sessions/${sessionId}/commands`,
      { command },
    );
  }
}

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

/** Ralph loops: standing goals, contracts, gates, subgoals, waits. */
export class GoalsResource {
  constructor(private readonly http: HttpClient) {}

  private base(sessionId: string): string {
    return `/v1/agent/sessions/${sessionId}/goal`;
  }

  get(sessionId: string): Promise<GoalState> {
    return this.http.request("GET", this.base(sessionId));
  }

  set(
    sessionId: string,
    text: string,
    options: { draft?: boolean } = {},
  ): Promise<CommandResult> {
    return this.http.request("PUT", this.base(sessionId), {
      text,
      ...(options.draft === true ? { draft: true } : {}),
    });
  }

  clear(sessionId: string): Promise<CommandResult> {
    return this.http.request("DELETE", this.base(sessionId));
  }

  pause(sessionId: string): Promise<CommandResult> {
    return this.http.request("POST", `${this.base(sessionId)}/pause`);
  }

  resume(sessionId: string): Promise<CommandResult> {
    return this.http.request("POST", `${this.base(sessionId)}/resume`);
  }

  wait(sessionId: string, pid: number, reason?: string): Promise<CommandResult> {
    return this.http.request("POST", `${this.base(sessionId)}/wait`, {
      pid,
      ...(reason === undefined ? {} : { reason }),
    });
  }

  unwait(sessionId: string): Promise<CommandResult> {
    return this.http.request("POST", `${this.base(sessionId)}/unwait`);
  }

  gates(sessionId: string): Promise<{ gates: GoalGate[] }> {
    return this.http.request("GET", `${this.base(sessionId)}/gates`);
  }

  addGate(sessionId: string, command: string): Promise<CommandResult> {
    return this.http.request("POST", `${this.base(sessionId)}/gates`, { command });
  }

  removeGate(sessionId: string, n: number): Promise<CommandResult> {
    return this.http.request("DELETE", `${this.base(sessionId)}/gates/${n}`);
  }

  clearGates(sessionId: string): Promise<CommandResult> {
    return this.http.request("DELETE", `${this.base(sessionId)}/gates`);
  }

  subgoals(sessionId: string): Promise<{ subgoals: string[] }> {
    return this.http.request("GET", `${this.base(sessionId)}/subgoals`);
  }

  addSubgoal(sessionId: string, text: string): Promise<CommandResult> {
    return this.http.request("POST", `${this.base(sessionId)}/subgoals`, { text });
  }

  removeSubgoal(sessionId: string, n: number): Promise<CommandResult> {
    return this.http.request("DELETE", `${this.base(sessionId)}/subgoals/${n}`);
  }

  clearSubgoals(sessionId: string): Promise<CommandResult> {
    return this.http.request("DELETE", `${this.base(sessionId)}/subgoals`);
  }
}

export interface ToolRunResult {
  runId: string;
  output: unknown;
  raw: string;
}

export class MediaResource {
  constructor(private readonly http: HttpClient) {}

  tts(body: Record<string, unknown>, signal?: AbortSignal): Promise<Response> {
    return this.http.raw("POST", "/v1/media/tts", body, signal);
  }

  images(prompt: string, model?: string): Promise<ToolRunResult> {
    return this.http.request("POST", "/v1/media/images", {
      prompt,
      ...(model === undefined ? {} : { model }),
    });
  }
}

export class WebToolsResource {
  constructor(private readonly http: HttpClient) {}

  search(query: string): Promise<ToolRunResult> {
    return this.http.request("POST", "/v1/web/search", { query });
  }

  extract(url: string): Promise<ToolRunResult> {
    return this.http.request("POST", "/v1/web/extract", { url });
  }
}

export class BrowserResource {
  constructor(private readonly http: HttpClient) {}

  task(task: string): Promise<{ runId: string }> {
    return this.http.request("POST", "/v1/browser/tasks", { task });
  }
}

export class EventsResource {
  constructor(private readonly http: HttpClient) {}

  subscribe(signal?: AbortSignal): AsyncIterable<SseEvent> {
    return this.http.stream("GET", "/v1/events", undefined, signal);
  }
}

export class PassthroughResource {
  constructor(private readonly http: HttpClient) {}

  chatCompletions(body: unknown, signal?: AbortSignal): Promise<Response> {
    return this.http.raw("POST", "/v1/chat/completions", body, signal);
  }

  responses(body: unknown, signal?: AbortSignal): Promise<Response> {
    return this.http.raw("POST", "/v1/responses", body, signal);
  }
}
