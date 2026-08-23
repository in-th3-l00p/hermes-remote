export type TokenProvider = () => string | Promise<string>;

export interface HermesClientOptions {
  baseUrl: string;
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

export class HermesClient {
  readonly baseUrl: string;
  private readonly tokenProvider: TokenProvider;
  private readonly fetchImpl: typeof fetch;

  constructor(options: HermesClientOptions) {
    if (options.token === undefined && options.tokenProvider === undefined) {
      throw new Error("HermesClient requires a token or a tokenProvider");
    }
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    const staticToken = options.token;
    this.tokenProvider =
      options.tokenProvider ?? (() => staticToken as string);
    this.fetchImpl = options.fetch ?? fetch;
  }

  async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const token = await this.tokenProvider();
    const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
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
    return (await res.json()) as T;
  }

  status(): Promise<{ ok: boolean; version: string }> {
    return this.request("GET", "/v1/status");
  }
}
