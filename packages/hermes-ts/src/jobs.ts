import type { HttpClient } from "./http.ts";

/** Scheduled-job administration; requires an API key with crons scopes. */
export class JobsResource {
  constructor(private readonly http: HttpClient) {}

  list<T = unknown>(): Promise<T> {
    return this.http.request("GET", "/v1/jobs");
  }

  get<T = unknown>(id: string): Promise<T> {
    return this.http.request("GET", `/v1/jobs/${id}`);
  }

  create<T = unknown>(body: unknown): Promise<T> {
    return this.http.request("POST", "/v1/jobs", body);
  }

  update<T = unknown>(id: string, body: unknown): Promise<T> {
    return this.http.request("PATCH", `/v1/jobs/${id}`, body);
  }

  remove<T = unknown>(id: string): Promise<T> {
    return this.http.request("DELETE", `/v1/jobs/${id}`);
  }

  pause<T = unknown>(id: string): Promise<T> {
    return this.http.request("POST", `/v1/jobs/${id}/pause`, {});
  }

  resume<T = unknown>(id: string): Promise<T> {
    return this.http.request("POST", `/v1/jobs/${id}/resume`, {});
  }

  trigger<T = unknown>(id: string): Promise<T> {
    return this.http.request("POST", `/v1/jobs/${id}/run`, {});
  }
}
