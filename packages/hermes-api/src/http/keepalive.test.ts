import { describe, expect, test } from "bun:test";
import { DEFAULT_KEEPALIVE_MS, KEEPALIVE_FRAME, keepAlive } from "./keepalive.ts";

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

describe("keepAlive", () => {
  test("writes repeatedly until stopped, and never after", async () => {
    let writes = 0;
    const stop = keepAlive(() => {
      writes += 1;
    }, 10);
    await sleep(75);
    expect(writes).toBeGreaterThanOrEqual(2);
    stop();
    const atStop = writes;
    await sleep(50);
    expect(writes).toBe(atStop);
  });

  test("writes nothing before the first interval elapses", async () => {
    let writes = 0;
    const stop = keepAlive(() => {
      writes += 1;
    }, 10_000);
    await sleep(30);
    stop();
    expect(writes).toBe(0);
  });

  test("falls back to the default cadence when none is given", async () => {
    let writes = 0;
    const stop = keepAlive(() => {
      writes += 1;
    });
    await sleep(20);
    stop();
    // The default is far longer than this test waits, which is the point:
    // a fast turn must cost nothing.
    expect(writes).toBe(0);
    expect(DEFAULT_KEEPALIVE_MS).toBeGreaterThanOrEqual(5_000);
  });

  test("the frame carries no event and no data, so clients discard it", () => {
    expect(KEEPALIVE_FRAME.startsWith(":")).toBe(true);
    expect(KEEPALIVE_FRAME).not.toContain("event:");
    expect(KEEPALIVE_FRAME).not.toContain("data:");
    expect(KEEPALIVE_FRAME.endsWith("\n\n")).toBe(true);
  });
});
