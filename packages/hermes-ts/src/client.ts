import { narrowChatEvent } from "./chat-event.ts";
import { Conversation } from "./conversation.ts";
import { DiscoveryResource } from "./discovery.ts";
import { HttpClient } from "./http.ts";
import { JobsResource } from "./jobs.ts";
import { RunsResource } from "./runs.ts";
import type { HermesClientOptions } from "./http.ts";
import type {
  Attachment,
  ChatEvent,
  ChatMessage,
  ChatSession,
  ChatSessionMeta,
} from "./types.ts";

export interface SendMessageInput {
  content: string;
  attachments?: Attachment[];
}

export class HermesClient {
  readonly baseUrl: string;
  readonly discovery: DiscoveryResource;
  readonly runs: RunsResource;
  readonly jobs: JobsResource;
  private readonly http: HttpClient;

  constructor(options: HermesClientOptions) {
    this.http = new HttpClient(options);
    this.baseUrl = this.http.baseUrl;
    this.discovery = new DiscoveryResource(this.http);
    this.runs = new RunsResource(this.http);
    this.jobs = new JobsResource(this.http);
  }

  /** A handle on one conversation; without an id, created on first send. */
  conversation(sessionId?: string): Conversation {
    return new Conversation(this, sessionId);
  }

  request<T>(method: string, path: string, body?: unknown): Promise<T> {
    return this.http.request(method, path, body);
  }

  private async *stream(
    method: string,
    path: string,
    body: unknown,
    signal?: AbortSignal,
  ): AsyncIterable<ChatEvent> {
    for await (const event of this.http.stream(method, path, body, signal)) {
      const narrowed = narrowChatEvent(event);
      if (narrowed !== null) {
        yield narrowed;
      }
    }
  }

  status(): Promise<{ ok: boolean; version: string }> {
    return this.request("GET", "/v1/status");
  }

  createSession(): Promise<ChatSession> {
    return this.request("POST", "/v1/sessions", {});
  }

  async listSessions(ids?: string[]): Promise<ChatSessionMeta[]> {
    const query =
      ids === undefined || ids.length === 0
        ? ""
        : `?ids=${ids.map(encodeURIComponent).join(",")}`;
    const res = await this.request<{ sessions: ChatSessionMeta[] }>(
      "GET",
      `/v1/sessions${query}`,
    );
    return res.sessions;
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.request("DELETE", `/v1/sessions/${sessionId}`);
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
    options: { signal?: AbortSignal } = {},
  ): AsyncIterable<ChatEvent> {
    return this.stream(
      "POST",
      `/v1/sessions/${sessionId}/messages`,
      { content: input.content, attachments: input.attachments ?? [] },
      options.signal,
    );
  }

  /** Aborts the in-flight agent turn; the partial reply is kept. */
  stopTurn(sessionId: string): Promise<{ stopped: boolean }> {
    return this.request("POST", `/v1/sessions/${sessionId}/stop`, {});
  }

  editMessage(
    sessionId: string,
    messageId: string,
    content: string,
    options: { signal?: AbortSignal } = {},
  ): AsyncIterable<ChatEvent> {
    return this.stream(
      "PATCH",
      `/v1/sessions/${sessionId}/messages/${messageId}`,
      { content },
      options.signal,
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
