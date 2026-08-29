import { HermesAgent, HermesUpstreamError } from "../chat/index.ts";
import type {
  Upstream,
  UpstreamDiscovery,
  UpstreamJobs,
  UpstreamRuns,
} from "./types.ts";

export interface HermesUpstreamOptions {
  baseUrl: string;
  apiKey: string;
  model?: string;
  fetch?: typeof fetch;
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
    get: (id) => this.request("GET", `/v1/runs/${id}`),
    events: async (id, signal) => {
      const res = await this.doFetch("GET", `/v1/runs/${id}/events`, undefined, signal);
      if (res.body === null) {
        throw new HermesUpstreamError(res.status, "Run event stream had no body");
      }
      return res.body;
    },
    stop: (id) => this.request("POST", `/v1/runs/${id}/stop`, {}),
    steer: (id, body) => this.request("POST", `/v1/runs/${id}/steer`, body),
    approve: (id, body) => this.request("POST", `/v1/runs/${id}/approval`, body),
  };

  readonly jobs: UpstreamJobs = {
    list: () => this.request("GET", "/api/jobs"),
    get: (id) => this.request("GET", `/api/jobs/${id}`),
    create: (body) => this.request("POST", "/api/jobs", body),
    update: (id, body) => this.request("PATCH", `/api/jobs/${id}`, body),
    remove: (id) => this.request("DELETE", `/api/jobs/${id}`),
    pause: (id) => this.request("POST", `/api/jobs/${id}/pause`, {}),
    resume: (id) => this.request("POST", `/api/jobs/${id}/resume`, {}),
    trigger: (id) => this.request("POST", `/api/jobs/${id}/run`, {}),
  };
}
