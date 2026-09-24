import { describe, expect, test } from "bun:test";
import { keepAlive } from "./keepalive.ts";

const enc = new TextEncoder();
const dec = new TextDecoder();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A source that emits `chunks`, waiting `gapMs` before each. */
function slowSource(chunks: string[], gapMs: number): ReadableStream<Uint8Array> {
  let i = 0;
  return new ReadableStream({
    async pull(controller) {
      await sleep(gapMs);
      const next = chunks[i++];
      if (next === undefined) {
        controller.close();
      } else {
        controller.enqueue(enc.encode(next));
      }
    },
  });
}

async function readAll(stream: ReadableStream<Uint8Array>): Promise<string> {
  return dec.decode(await new Response(stream).arrayBuffer());
}

describe("keepAlive", () => {
  test("adds comments while the source is quiet, only between frames", async () => {
    const text = await readAll(
      keepAlive(slowSource(["data: a\n\n", "data: b", "\n\n"], 60), 20),
    );
    expect(text).toContain(": keepalive\n\n");
    expect(text.replaceAll(": keepalive\n\n", "")).toBe("data: a\n\ndata: b\n\n");
    // Never between "data: b" and its terminating blank line.
    expect(text).not.toContain("data: b: keepalive");
  });

  test("recognizes CRLF frame endings", async () => {
    const text = await readAll(keepAlive(slowSource(["data: a\r\n\r\n", "x"], 60), 20));
    expect(text).toContain("data: a\r\n\r\n: keepalive");
  });

  test("a fast source gets no comments", async () => {
    const text = await readAll(keepAlive(slowSource(["data: a\n\n"], 0), 1_000));
    expect(text).toBe("data: a\n\n");
  });

  test("cancelling the result cancels the source", async () => {
    let cancelled = false;
    const source = new ReadableStream<Uint8Array>({
      pull: async () => {
        await sleep(10);
      },
      cancel: () => {
        cancelled = true;
      },
    });
    const reader = keepAlive(source, 5).getReader();
    await sleep(20);
    await reader.cancel();
    expect(cancelled).toBe(true);
  });

  test("a failing source fails the stream and stops the timer", async () => {
    const source = new ReadableStream<Uint8Array>({
      async pull() {
        await sleep(15);
        throw new Error("upstream reset");
      },
    });
    expect(readAll(keepAlive(source, 5))).rejects.toThrow("upstream reset");
    await sleep(40);
  });
});
