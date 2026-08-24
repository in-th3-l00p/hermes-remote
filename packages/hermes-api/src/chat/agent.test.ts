import { describe, expect, test } from "bun:test";
import { DemoAgent, HermesAgent, HermesUpstreamError } from "./agent.ts";
import type { AgentTurnMessage } from "./agent.ts";

async function collect(iter: AsyncIterable<string>): Promise<string> {
  let out = "";
  for await (const chunk of iter) {
    out += chunk;
  }
  return out;
}

const userTurn = (content: string, attachments = []): AgentTurnMessage[] => [
  { role: "user", content, attachments },
];

describe("DemoAgent", () => {
  test("echoes the last message", async () => {
    const text = await collect(new DemoAgent().stream(userTurn("hello")));
    expect(text).toContain("You said: *hello*");
    expect(text).toContain("demo agent");
  });

  test("supports abandoning the stream early", async () => {
    for await (const chunk of new DemoAgent().stream(userTurn("bye"))) {
      expect(chunk.length).toBeGreaterThan(0);
      break;
    }
  });

  test("mentions attachments and handles empty history", async () => {
    const agent = new DemoAgent();
    const withAttachment = await collect(
      agent.stream([
        {
          role: "user",
          content: "look",
          attachments: [{ name: "a.png", type: "image/png", dataUrl: "data:" }],
        },
      ]),
    );
    expect(withAttachment).toContain("1 attachment(s)");
    expect(await collect(agent.stream([]))).toContain("You said: **");
  });
});

function sseResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(encoder.encode(chunk));
        }
        controller.close();
      },
    }),
    { status: 200 },
  );
}

function chunk(content: string): string {
  return `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`;
}

describe("HermesAgent", () => {
  test("streams deltas and forwards attachments as image parts", async () => {
    const requests: { url: string; body: string }[] = [];
    const agent = new HermesAgent({
      baseUrl: "http://upstream/",
      apiKey: "k",
      fetch: (async (url: string | URL | Request, init?: RequestInit) => {
        requests.push({ url: String(url), body: String(init?.body) });
        return sseResponse([
          `: comment\n\n`,
          chunk("Hel"),
          chunk("lo"),
          `data: ${JSON.stringify({ choices: [{ delta: {} }] })}\n\n`,
          "data: [DONE]\n\n",
          chunk("never"),
        ]);
      }) as typeof fetch,
    });
    const text = await collect(
      agent.stream([
        {
          role: "user",
          content: "hi",
          attachments: [
            { name: "a.png", type: "image/png", dataUrl: "data:image/png;x" },
          ],
        },
      ]),
    );
    expect(text).toBe("Hello");
    expect(requests[0]?.url).toBe("http://upstream/v1/chat/completions");
    const body = JSON.parse(requests[0]?.body as string) as {
      model: string;
      messages: { content: unknown }[];
    };
    expect(body.model).toBe("hermes");
    expect(body.messages[0]?.content).toEqual([
      { type: "text", text: "hi" },
      { type: "image_url", image_url: { url: "data:image/png;x" } },
    ]);
  });

  test("uses plain string content without attachments and custom model", async () => {
    let captured = "";
    const agent = new HermesAgent({
      baseUrl: "http://upstream",
      apiKey: "k",
      model: "custom",
      fetch: (async (_url: string | URL | Request, init?: RequestInit) => {
        captured = String(init?.body);
        return sseResponse([chunk("ok")]);
      }) as typeof fetch,
    });
    expect(await collect(agent.stream(userTurn("hi")))).toBe("ok");
    const body = JSON.parse(captured) as {
      model: string;
      messages: { content: unknown }[];
    };
    expect(body.model).toBe("custom");
    expect(body.messages[0]?.content).toBe("hi");
  });

  test("handles chunks split across reads", async () => {
    const full = chunk("ab") + chunk("cd");
    const agent = new HermesAgent({
      baseUrl: "http://upstream",
      apiKey: "k",
      fetch: (async () =>
        sseResponse([full.slice(0, 10), full.slice(10)])) as typeof fetch,
    });
    expect(await collect(agent.stream(userTurn("x")))).toBe("abcd");
  });

  test("throws HermesUpstreamError on failure responses", async () => {
    const agent = new HermesAgent({
      baseUrl: "http://upstream",
      apiKey: "k",
      fetch: (async () => new Response("no", { status: 502 })) as typeof fetch,
    });
    const err = (await collect(agent.stream(userTurn("x"))).catch(
      (e: unknown) => e,
    )) as HermesUpstreamError;
    expect(err).toBeInstanceOf(HermesUpstreamError);
    expect(err.status).toBe(502);
  });

  test("throws when the upstream has no body", async () => {
    const agent = new HermesAgent({
      baseUrl: "http://upstream",
      apiKey: "k",
      fetch: (async () => new Response(null, { status: 200 })) as typeof fetch,
    });
    await expect(collect(agent.stream(userTurn("x")))).rejects.toBeInstanceOf(
      HermesUpstreamError,
    );
  });
});
