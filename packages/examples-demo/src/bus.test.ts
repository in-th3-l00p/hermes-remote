import { describe, expect, test } from "bun:test";
import { DemoEventBus } from "./bus.ts";

const at = () => new Date("2026-08-31T12:00:00Z");

describe("DemoEventBus", () => {
  test("publish stamps and returns the event", () => {
    const bus = new DemoEventBus(at);
    const event = bus.publish("run.created", { id: "r1" });
    expect(event).toEqual({
      type: "run.created",
      at: "2026-08-31T12:00:00.000Z",
      data: { id: "r1" },
    });
  });

  test("subscribers receive queued and awaited events", async () => {
    const bus = new DemoEventBus(at);
    const controller = new AbortController();
    const iterator = bus.subscribe(controller.signal)[Symbol.asyncIterator]();
    bus.publish("first", {});
    expect((await iterator.next()).value?.type).toBe("first");
    const pending = iterator.next();
    bus.publish("second", {});
    expect((await pending).value?.type).toBe("second");
    controller.abort();
    expect(await iterator.next()).toEqual({ value: undefined, done: true });
  });

  test("aborting while parked ends iteration", async () => {
    const bus = new DemoEventBus(at);
    const controller = new AbortController();
    const iterator = bus.subscribe(controller.signal)[Symbol.asyncIterator]();
    const pending = iterator.next();
    controller.abort();
    expect(await pending).toEqual({ value: undefined, done: true });
    bus.publish("after", {});
    expect(await iterator.next()).toEqual({ value: undefined, done: true });
  });

  test("an already aborted signal never subscribes", async () => {
    const bus = new DemoEventBus(at);
    const controller = new AbortController();
    controller.abort();
    const iterator = bus.subscribe(controller.signal)[Symbol.asyncIterator]();
    bus.publish("missed", {});
    expect(await iterator.next()).toEqual({ value: undefined, done: true });
  });
});
