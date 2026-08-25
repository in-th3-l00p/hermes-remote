import type { Attachment } from "./store/index.ts";

export interface AgentTurnMessage {
  role: "system" | "user" | "assistant";
  content: string;
  attachments: Attachment[];
}

export interface AgentBackend {
  stream(
    messages: AgentTurnMessage[],
    signal?: AbortSignal,
  ): AsyncIterable<string>;
}

/** Offline fallback agent used when no Hermes upstream is configured. */
export class DemoAgent implements AgentBackend {
  // Explicit no-op constructor: Bun's coverage counts implicit constructors
  // as uncoverable functions.
  constructor() {}

  async *stream(
    messages: AgentTurnMessage[],
    signal?: AbortSignal,
  ): AsyncIterable<string> {
    const system = messages.find((m) => m.role === "system");
    const last = messages.at(-1);
    const reply =
      (system === undefined ? "" : `> ${system.content}\n\n`) +
      `You said: *${last?.content ?? ""}*` +
      (last !== undefined && last.attachments.length > 0
        ? `\n\n(and sent ${last.attachments.length} attachment(s))`
        : "") +
      "\n\nThis is the **demo agent** — configure a Hermes upstream to talk to a real agent.";
    for (const word of reply.split(/(?<= )/)) {
      if (signal?.aborted === true) {
        return;
      }
      yield word;
    }
  }
}

export class HermesUpstreamError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "HermesUpstreamError";
  }
}

export interface HermesAgentOptions {
  baseUrl: string;
  apiKey: string;
  model?: string;
  fetch?: typeof fetch;
}

type UpstreamPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

/** Streams turns through a Hermes agent's OpenAI-compatible API server. */
export class HermesAgent implements AgentBackend {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly model: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: HermesAgentOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.apiKey = options.apiKey;
    this.model = options.model ?? "hermes";
    this.fetchImpl = options.fetch ?? fetch;
  }

  async *stream(
    messages: AgentTurnMessage[],
    signal?: AbortSignal,
  ): AsyncIterable<string> {
    const body = {
      model: this.model,
      stream: true,
      messages: messages.map((m) => ({
        role: m.role,
        content:
          m.attachments.length === 0
            ? m.content
            : ([
                { type: "text", text: m.content },
                ...m.attachments.map(
                  (a): UpstreamPart => ({
                    type: "image_url",
                    image_url: { url: a.dataUrl },
                  }),
                ),
              ] satisfies UpstreamPart[]),
      })),
    };
    const res = await this.fetchImpl(`${this.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
      ...(signal === undefined ? {} : { signal }),
    });
    if (!res.ok || res.body === null) {
      throw new HermesUpstreamError(
        res.status,
        `Hermes upstream returned ${res.status}`,
      );
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() as string;
        for (const event of events) {
          for (const line of event.split("\n")) {
            if (!line.startsWith("data: ")) {
              continue;
            }
            const data = line.slice(6);
            if (data === "[DONE]") {
              return;
            }
            const parsed = JSON.parse(data) as {
              choices?: { delta?: { content?: string } }[];
            };
            const text = parsed.choices?.[0]?.delta?.content;
            if (text !== undefined && text !== "") {
              yield text;
            }
          }
        }
      }
    } finally {
      // Abandoning the generator must release the upstream connection.
      await reader.cancel().catch(() => {});
    }
  }
}
