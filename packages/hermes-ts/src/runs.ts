import type { HttpClient } from "./http.ts";
import type { SseEvent } from "./sse.ts";

export interface RunRef {
  id: string;
  principal?: string;
  createdAt?: string;
}

/** Long-running agent tasks: submit, inspect, stream events, and control. */
export class RunsResource {
  constructor(private readonly http: HttpClient) {}

  create<T = unknown>(body: Record<string, unknown>): Promise<T> {
    return this.http.request("POST", "/v1/runs", body);
  }

  async list(): Promise<RunRef[]> {
    const res = await this.http.request<{ runs: RunRef[] }>("GET", "/v1/runs");
    return res.runs;
  }

  get<T = unknown>(id: string): Promise<T> {
    return this.http.request("GET", `/v1/runs/${id}`);
  }

  events(id: string, signal?: AbortSignal): AsyncIterable<SseEvent> {
    return this.http.stream("GET", `/v1/runs/${id}/events`, undefined, signal);
  }

  stop<T = unknown>(id: string): Promise<T> {
    return this.http.request("POST", `/v1/runs/${id}/stop`, {});
  }

  steer<T = unknown>(id: string, body: unknown): Promise<T> {
    return this.http.request("POST", `/v1/runs/${id}/steer`, body);
  }

  approve<T = unknown>(id: string, body: unknown): Promise<T> {
    return this.http.request("POST", `/v1/runs/${id}/approval`, body);
  }
}
