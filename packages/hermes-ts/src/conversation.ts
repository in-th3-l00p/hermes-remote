import type { HermesClient } from "./client.ts";
import type { SendMessageInput } from "./client.ts";
import type { Attachment, ChatEvent, ChatMessage } from "./types.ts";

export interface ConversationSendOptions {
  attachments?: Attachment[];
  signal?: AbortSignal;
}

/**
 * A handle on one conversation with the agent. Without a session id it
 * creates the session on the first send and exposes the id afterward.
 */
export class Conversation {
  private sessionId: string | null;

  constructor(
    readonly client: HermesClient,
    sessionId?: string,
  ) {
    this.sessionId = sessionId ?? null;
  }

  get id(): string | null {
    return this.sessionId;
  }

  /**
   * Sends a message: a plain string, or the same `{ content, attachments }`
   * object `client.sendMessage` takes.
   */
  send(
    input: string | SendMessageInput,
    options: ConversationSendOptions = {},
  ): AsyncIterable<ChatEvent> {
    const message: SendMessageInput = typeof input === "string" ? { content: input } : input;
    const attachments = options.attachments ?? message.attachments;
    return this.#stream(
      { content: message.content, ...(attachments === undefined ? {} : { attachments }) },
      options.signal,
    );
  }

  async *#stream(
    message: SendMessageInput,
    signal: AbortSignal | undefined,
  ): AsyncIterable<ChatEvent> {
    this.sessionId ??= (await this.client.createSession()).id;
    yield* this.client.sendMessage(this.sessionId, message, signal === undefined ? {} : { signal });
  }

  edit(
    messageId: string,
    content: string,
    options: { signal?: AbortSignal } = {},
  ): AsyncIterable<ChatEvent> {
    return this.client.editMessage(this.requireId(), messageId, content, options);
  }

  async stop(): Promise<{ stopped: boolean }> {
    return this.client.stopTurn(this.requireId());
  }

  async react(messageId: string, emoji: string): Promise<ChatMessage> {
    return this.client.react(this.requireId(), messageId, emoji);
  }

  async messages(): Promise<ChatMessage[]> {
    return this.client.listMessages(this.requireId());
  }

  async remove(): Promise<void> {
    return this.client.deleteSession(this.requireId());
  }

  private requireId(): string {
    if (this.sessionId === null) {
      throw new Error("conversation has no session yet");
    }
    return this.sessionId;
  }
}
