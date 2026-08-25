import { parseSse } from "./sse.ts";
import type { SseEvent } from "./sse.ts";

export type TokenProvider = () => string | Promise<string>;

export interface HermesClientOptions {
  baseUrl: string;
  /** Static bearer token. Omit both token options for anonymous servers. */
  token?: string;
  tokenProvider?: TokenProvider;
  fetch?: typeof fetch;
}

export class HermesApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "HermesApiError";
  }
}

export class HttpClient {
  readonly baseUrl: string;
  private readonly tokenProvider: TokenProvider | null;
  private readonly refreshable: boolean;
  private readonly fetchImpl: typeof fetch;

  constructor(options: HermesClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    const staticToken = options.token;
    this.tokenProvider =
      options.tokenProvider ??
      (staticToken === undefined ? null : () => staticToken);
    // A 401 retry only helps when a provider can mint a fresh token; a
    // static token would repeat the identical request.
    this.refreshable = options.tokenProvider !== undefined;
    // Bind to globalThis: browsers throw "Illegal invocation" when fetch is
    // called detached from its global.
    this.fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
  }

  private async doFetch(
    method: string,
    path: string,
    body?: unknown,
    signal?: AbortSignal,
    retried = false,
  ): Promise<Response> {
    const headers: Record<string, string> = {};
    if (this.tokenProvider !== null) {
      headers["authorization"] = `Bearer ${await this.tokenProvider()}`;
    }
    if (body !== undefined) {
      headers["content-type"] = "application/json";
    }
    const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      ...(signal === undefined ? {} : { signal }),
    });
    if (res.status === 401 && this.refreshable && !retried) {
      return this.doFetch(method, path, body, signal, true);
    }
    if (!res.ok) {
      const payload = (await res
        .json()
        .catch(() => null)) as { error?: { code?: string; message?: string } } | null;
      throw new HermesApiError(
        res.status,
        payload?.error?.code ?? "unknown_error",
        payload?.error?.message ?? `Request failed with status ${res.status}`,
      );
    }
    return res;
  }

  async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await this.doFetch(method, path, body);
    return (await res.json()) as T;
  }

  async *stream(
    method: string,
    path: string,
    body: unknown,
    signal?: AbortSignal,
  ): AsyncIterable<SseEvent> {
    const res = await this.doFetch(method, path, body, signal);
    if (res.body === null) {
      throw new HermesApiError(res.status, "no_body", "Response had no body");
    }
    yield* parseSse(res.body);
  }
}
