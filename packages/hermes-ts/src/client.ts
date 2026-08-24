import { parseSse } from "./sse.ts";
import type {
  Attachment,
  ChatEvent,
  ChatMessage,
  ChatSession,
} from "./types.ts";

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

export interface SendMessageInput {
  content: string;
  attachments?: Attachment[];
}

export class HermesClient {
  readonly baseUrl: string;
  private readonly tokenProvider: TokenProvider | null;
  private readonly fetchImpl: typeof fetch;

  constructor(options: HermesClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    const staticToken = options.token;
    this.tokenProvider =
      options.tokenProvider ??
      (staticToken === undefined ? null : () => staticToken);
    // Bind to globalThis: browsers throw "Illegal invocation" when fetch is
    // called detached from its global.
    this.fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
  }

  private async doFetch(
    method: string,
    path: string,
    body?: unknown,
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
    return res;
  }

  async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await this.doFetch(method, path, body);
    return (await res.json()) as T;
  }

  private async *stream(
    method: string,
    path: string,
    body: unknown,
  ): AsyncIterable<ChatEvent> {
    const res = await this.doFetch(method, path, body);
    if (res.body === null) {
      throw new HermesApiError(res.status, "no_body", "Response had no body");
    }
    for await (const event of parseSse(res.body)) {
      yield event as ChatEvent;
    }
  }

  status(): Promise<{ ok: boolean; version: string }> {
    return this.request("GET", "/v1/status");
  }

  createSession(): Promise<ChatSession> {
    return this.request("POST", "/v1/sessions", {});
  }

  async listMessages(sessionId: string): Promise<ChatMessage[]> {
    const res = await this.request<{ messages: ChatMessage[] }>(
      "GET",
      `/v1/sessions/${sessionId}/messages`,
    );
    return res.messages;
  }

  sendMessage(
    sessionId: string,
    input: SendMessageInput,
  ): AsyncIterable<ChatEvent> {
    return this.stream("POST", `/v1/sessions/${sessionId}/messages`, {
      content: input.content,
      attachments: input.attachments ?? [],
    });
  }

  editMessage(
    sessionId: string,
    messageId: string,
    content: string,
  ): AsyncIterable<ChatEvent> {
    return this.stream(
      "PATCH",
      `/v1/sessions/${sessionId}/messages/${messageId}`,
      { content },
    );
  }

  react(
    sessionId: string,
    messageId: string,
    emoji: string,
  ): Promise<ChatMessage> {
    return this.request(
      "POST",
      `/v1/sessions/${sessionId}/messages/${messageId}/reactions`,
      { emoji },
    );
  }
}
