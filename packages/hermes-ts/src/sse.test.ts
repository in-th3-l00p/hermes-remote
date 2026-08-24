import { describe, expect, test } from "bun:test";
import { parseSse } from "./sse.ts";

function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
}

async function collect(stream: ReadableStream<Uint8Array>) {
  const out = [];
  for await (const event of parseSse(stream)) {
    out.push(event);
  }
  return out;
}

describe("parseSse", () => {
  test("parses events split across chunks", async () => {
    const text = 'event: delta\ndata: {"text":"a"}\n\nevent: done\ndata: {"x":1}\n\n';
    const events = await collect(streamOf([text.slice(0, 12), text.slice(12)]));
    expect(events).toEqual([
      { event: "delta", data: { text: "a" } },
      { event: "done", data: { x: 1 } },
    ]);
  });

  test("defaults event name and skips data-less blocks", async () => {
    const events = await collect(
      streamOf(['data: {"a":1}\n\n', ": comment\n\n", "event: ping\n\n"]),
    );
    expect(events).toEqual([{ event: "message", data: { a: 1 } }]);
  });
});
