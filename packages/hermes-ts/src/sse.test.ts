import { describe, expect, test } from "bun:test";
import { parseSse } from "./sse.ts";

function streamOf(
  chunks: (string | Uint8Array)[],
  onCancel?: () => void,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(
          typeof chunk === "string" ? encoder.encode(chunk) : chunk,
        );
      }
      controller.close();
    },
    cancel() {
      onCancel?.();
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

  test("treats CRLF as line and block boundaries", async () => {
    const events = await collect(
      streamOf(['event: a\r\ndata: {"n":1}\r\n\r\ndata: {"n":2}\r\n\r\n']),
    );
    expect(events).toEqual([
      { event: "a", data: { n: 1 } },
      { event: "message", data: { n: 2 } },
    ]);
  });

  test("handles CRLF split across chunk edges and lone CR", async () => {
    const events = await collect(
      streamOf(['data: {"n":1}\r', '\n\r\ndata: {"n":2}\r\r', "\r\n"]),
    );
    expect(events).toEqual([
      { event: "message", data: { n: 1 } },
      { event: "message", data: { n: 2 } },
    ]);
  });

  test("concatenates multi-line data with newlines", async () => {
    const events = await collect(streamOf(["data: [1,\ndata: 2]\n\n"]));
    expect(events).toEqual([{ event: "message", data: [1, 2] }]);
  });

  test("accepts fields without a space after the colon", async () => {
    const events = await collect(streamOf(['event:ping\ndata:{"n":1}\n\n']));
    expect(events).toEqual([{ event: "ping", data: { n: 1 } }]);
  });

  test("strips a leading UTF-8 BOM", async () => {
    const body = new TextEncoder().encode('data: {"n":1}\n\n');
    const events = await collect(
      streamOf([new Uint8Array([0xef, 0xbb, 0xbf]), body]),
    );
    expect(events).toEqual([{ event: "message", data: { n: 1 } }]);
  });

  test("skips events with malformed JSON payloads", async () => {
    const events = await collect(
      streamOf(['data: {"n":1}\n\ndata: keepalive\n\ndata: {"n":2}\n\n']),
    );
    expect(events).toEqual([
      { event: "message", data: { n: 1 } },
      { event: "message", data: { n: 2 } },
    ]);
  });

  test("consumer break cancels the underlying stream", async () => {
    let cancelled = false;
    const stream = streamOf(
      ['data: {"n":1}\n\n', 'data: {"n":2}\n\n'],
      () => {
        cancelled = true;
      },
    );
    for await (const event of parseSse(stream)) {
      expect(event).toEqual({ event: "message", data: { n: 1 } });
      break;
    }
    expect(cancelled).toBe(true);
  });

  test("swallows cancellation failures on teardown", async () => {
    const stream = streamOf(['data: {"n":1}\n\n', 'data: {"n":2}\n\n'], () => {
      throw new Error("cancel failed");
    });
    for await (const event of parseSse(stream)) {
      expect(event).toEqual({ event: "message", data: { n: 1 } });
      break;
    }
  });
});
