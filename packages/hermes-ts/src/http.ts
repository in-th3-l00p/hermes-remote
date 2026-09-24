import { parseSse } from "./sse.ts";
import type { SseEvent } from "./sse.ts";

export type TokenProvider = () => string | Promise<string>;

export interface HermesClientOptions {
  baseUrl: string;
  /** Static bearer token. Omit both token options for anonymous servers. */
  token?: string;
  tokenProvider?: TokenProvider;
  /** Extra headers sent with every request (e.g. X-Hermes-Profile). */
  headers?: Record<string, string>;
  fetch?: typeof fetch;
  /**
   * Retries for idempotent requests (GET/HEAD) after a network error or a
   * 502/503/504, with exponential backoff. Defaults to 2 retries starting at
   * 250 ms; `false` disables retrying.
   */
  retry?: { attempts?: number; baseDelayMs?: number } | false;
}

const RETRYABLE_STATUS = new Set([502, 503, 504]);

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

/** Raw bytes sent as `application/octet-stream` (archive uploads). */
export type BinaryBody = Blob | ArrayBuffer | Uint8Array;

function isBinary(body: unknown): body is BinaryBody {
  return (
    body instanceof Blob ||
    body instanceof ArrayBuffer ||
    body instanceof Uint8Array
  );
}

export class HttpClient {
  readonly baseUrl: string;
  private readonly tokenProvider: TokenProvider | null;
  private readonly refreshable: boolean;
  private readonly fetchImpl: typeof fetch;
  private readonly extraHeaders: Record<string, string>;
  private readonly retryAttempts: number;
  private readonly retryDelayMs: number;

  constructor(options: HermesClientOptions) {
    this.retryAttempts = options.retry === false ? 0 : (options.retry?.attempts ?? 2);
    this.retryDelayMs = options.retry === false ? 0 : (options.retry?.baseDelayMs ?? 250);
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.extraHeaders = options.headers ?? {};
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

  /** Retries idempotent requests on transient failures, then gives up. */
  private async doFetch(
    method: string,
    path: string,
    body?: unknown,
    signal?: AbortSignal,
  ): Promise<Response> {
    const idempotent = method === "GET" || method === "HEAD";
    for (let attempt = 0; ; attempt += 1) {
      const last = !idempotent || attempt >= this.retryAttempts;
      try {
        const res = await this.fetchOnce(method, path, body, signal);
        if (last || !RETRYABLE_STATUS.has(res.status)) {
          return await this.checked(res);
        }
        await res.body?.cancel();
      } catch (cause) {
        if (last || signal?.aborted === true || cause instanceof HermesApiError) {
          throw cause;
        }
      }
      await new Promise((resolve) => setTimeout(resolve, this.retryDelayMs * 2 ** attempt));
    }
  }

  private async fetchOnce(
    method: string,
    path: string,
    body?: unknown,
    signal?: AbortSignal,
    retried = false,
  ): Promise<Response> {
    const headers: Record<string, string> = { ...this.extraHeaders };
    if (this.tokenProvider !== null) {
      headers["authorization"] = `Bearer ${await this.tokenProvider()}`;
    }
    const binary = isBinary(body);
    if (body !== undefined) {
      headers["content-type"] = binary ? "application/octet-stream" : "application/json";
    }
    const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method,
      headers,
      ...(body === undefined
        ? {}
        : { body: binary ? (body as NonNullable<RequestInit["body"]>) : JSON.stringify(body) }),
      ...(signal === undefined ? {} : { signal }),
    });
    if (res.status === 401 && this.refreshable && !retried) {
      await res.body?.cancel();
      return this.fetchOnce(method, path, body, signal, true);
    }
    return res;
  }

  /** Turns a non-2xx response into a typed HermesApiError. */
  private async checked(res: Response): Promise<Response> {
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

  /** Authenticated request returning the raw Response (binary/stream bodies). */
  raw(
    method: string,
    path: string,
    body?: unknown,
    signal?: AbortSignal,
  ): Promise<Response> {
    return this.doFetch(method, path, body, signal);
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
