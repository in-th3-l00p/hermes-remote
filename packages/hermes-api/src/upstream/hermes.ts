import { HermesAgent, HermesUpstreamError } from "../chat/index.ts";
import type {
  Upstream,
  UpstreamDiscovery,
  UpstreamJobs,
  UpstreamRuns,
  UpstreamSessions,
} from "./types.ts";

export interface HermesUpstreamOptions {
  baseUrl: string;
  apiKey: string;
  model?: string;
  fetch?: typeof fetch;
}

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;

/**
 * An upstream id as a single URL path segment. Ids that could change the
 * request path (slashes, dot segments, encoded characters) never reach the
 * agent, which is called with its own all-powerful key.
 */
export function seg(id: string): string {
  if (!ID_PATTERN.test(id)) {
    throw new HermesUpstreamError(400, "Invalid id");
  }
  return encodeURIComponent(id);
}

/** Bridges every non-chat surface of a Hermes agent's API server. */
export class HermesUpstream implements Upstream {
  readonly chat: HermesAgent;
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: HermesUpstreamOptions) {
    this.chat = new HermesAgent(options);
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.apiKey = options.apiKey;
    this.fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
  }

  private async doFetch(
    method: string,
    path: string,
    body?: unknown,
    signal?: AbortSignal,
  ): Promise<Response> {
    const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      ...(signal === undefined ? {} : { signal }),
    });
    if (!res.ok) {
      const payload = (await res.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      throw new HermesUpstreamError(
        res.status,
        payload?.error?.message ?? `Hermes upstream returned ${res.status}`,
      );
    }
    return res;
  }

  private async request(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<unknown> {
    const res = await this.doFetch(method, path, body);
    return res.json();
  }

  readonly discovery: UpstreamDiscovery = {
    health: () =>
      this.request("GET", "/health/detailed").catch(() =>
        this.request("GET", "/health"),
      ),
    capabilities: () => this.request("GET", "/v1/capabilities"),
    models: () => this.request("GET", "/v1/models"),
    modelOptions: () => this.request("GET", "/api/model/options"),
    skills: () => this.request("GET", "/v1/skills"),
    toolsets: () => this.request("GET", "/v1/toolsets"),
  };

  readonly runs: UpstreamRuns = {
    create: (body) => this.request("POST", "/v1/runs", body),
    get: async (id) => this.request("GET", `/v1/runs/${seg(id)}`),
    events: async (id, signal) => {
      const res = await this.doFetch("GET", `/v1/runs/${seg(id)}/events`, undefined, signal);
      if (res.body === null) {
        throw new HermesUpstreamError(res.status, "Run event stream had no body");
      }
      return res.body;
    },
    stop: async (id) => this.request("POST", `/v1/runs/${seg(id)}/stop`, {}),
    steer: async (id, body) => this.request("POST", `/v1/runs/${seg(id)}/steer`, body),
    approve: async (id, body) => this.request("POST", `/v1/runs/${seg(id)}/approval`, body),
  };

  raw(
    method: string,
    path: string,
    body?: unknown,
    signal?: AbortSignal,
  ): Promise<Response> {
    return this.fetchImpl(`${this.baseUrl}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      ...(signal === undefined ? {} : { signal }),
    });
  }

  readonly sessions: UpstreamSessions = {
    list: () => this.request("GET", "/api/sessions"),
    create: (body) => this.request("POST", "/api/sessions", body),
    get: async (id) => this.request("GET", `/api/sessions/${seg(id)}`),
    update: async (id, body) => this.request("PATCH", `/api/sessions/${seg(id)}`, body),
    remove: async (id) => this.request("DELETE", `/api/sessions/${seg(id)}`),
    messages: async (id) => this.request("GET", `/api/sessions/${seg(id)}/messages`),
    fork: async (id, body) => this.request("POST", `/api/sessions/${seg(id)}/fork`, body),
    chat: async (id, body) => this.request("POST", `/api/sessions/${seg(id)}/chat`, body),
    chatStream: async (id, body, signal) => {
      const res = await this.doFetch(
        "POST",
        `/api/sessions/${seg(id)}/chat/stream`,
        body,
        signal,
      );
      if (res.body === null) {
        throw new HermesUpstreamError(res.status, "Chat stream had no body");
      }
      return res.body;
    },
    modelLock: async (id, body) => this.request("POST", `/api/sessions/${seg(id)}/model`, body),
  };

  readonly jobs: UpstreamJobs = {
    list: () => this.request("GET", "/api/jobs"),
    get: async (id) => this.request("GET", `/api/jobs/${seg(id)}`),
    create: (body) => this.request("POST", "/api/jobs", body),
    update: async (id, body) => this.request("PATCH", `/api/jobs/${seg(id)}`, body),
    remove: async (id) => this.request("DELETE", `/api/jobs/${seg(id)}`),
    pause: async (id) => this.request("POST", `/api/jobs/${seg(id)}/pause`, {}),
    resume: async (id) => this.request("POST", `/api/jobs/${seg(id)}/resume`, {}),
    trigger: async (id) => this.request("POST", `/api/jobs/${seg(id)}/run`, {}),
  };
}
