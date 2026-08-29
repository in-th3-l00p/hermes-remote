import type { AgentBackend } from "../chat/index.ts";

export interface UpstreamDiscovery {
  health(): Promise<unknown>;
  capabilities(): Promise<unknown>;
  models(): Promise<unknown>;
  modelOptions(): Promise<unknown>;
  skills(): Promise<unknown>;
  toolsets(): Promise<unknown>;
}

export interface UpstreamRuns {
  create(body: Record<string, unknown>): Promise<unknown>;
  get(id: string): Promise<unknown>;
  events(id: string, signal?: AbortSignal): Promise<ReadableStream<Uint8Array>>;
  stop(id: string): Promise<unknown>;
  steer(id: string, body: unknown): Promise<unknown>;
  approve(id: string, body: unknown): Promise<unknown>;
}

export interface UpstreamJobs {
  list(): Promise<unknown>;
  get(id: string): Promise<unknown>;
  create(body: unknown): Promise<unknown>;
  update(id: string, body: unknown): Promise<unknown>;
  remove(id: string): Promise<unknown>;
  pause(id: string): Promise<unknown>;
  resume(id: string): Promise<unknown>;
  trigger(id: string): Promise<unknown>;
}

/** Everything hermes-remote can reach on the agent, behind one facade. */
export interface UpstreamSessions {
  list(): Promise<unknown>;
  create(body: unknown): Promise<unknown>;
  get(id: string): Promise<unknown>;
  update(id: string, body: unknown): Promise<unknown>;
  remove(id: string): Promise<unknown>;
  messages(id: string): Promise<unknown>;
  fork(id: string, body: unknown): Promise<unknown>;
  chat(id: string, body: unknown): Promise<unknown>;
  chatStream(
    id: string,
    body: unknown,
    signal?: AbortSignal,
  ): Promise<ReadableStream<Uint8Array>>;
  modelLock(id: string, body: unknown): Promise<unknown>;
}

export interface Upstream {
  chat: AgentBackend;
  discovery: UpstreamDiscovery;
  runs: UpstreamRuns;
  jobs: UpstreamJobs;
  sessions: UpstreamSessions;
  /** Verbatim request to the upstream; the Response comes back untouched. */
  raw(
    method: string,
    path: string,
    body?: unknown,
    signal?: AbortSignal,
  ): Promise<Response>;
}
