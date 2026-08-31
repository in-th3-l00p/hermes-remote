import { describe, expect, test } from "bun:test";
import { EventBus, type HermesEvent } from "./bus.ts";

describe("EventBus", () => {
  test("publish stamps events with the current time by default", () => {
    const bus = new EventBus();
    const event = bus.publish("run.created", { id: "r1" });
    expect(event.type).toBe("run.created");
    expect(event.data).toEqual({ id: "r1" });
    expect(Number.isNaN(Date.parse(event.at))).toBe(false);
  });

  test("subscribers receive queued and awaited events", async () => {
    const bus = new EventBus(() => new Date("2026-08-24T00:00:00Z"));
    const iterator = bus.subscribe()[Symbol.asyncIterator]();
    bus.publish("first", 1);
    expect(await iterator.next()).toEqual({
      value: { type: "first", at: "2026-08-24T00:00:00.000Z", data: 1 },
      done: false,
    });
    const pending = iterator.next();
    bus.publish("second", 2);
    expect((await pending).value?.type).toBe("second");
  });

  test("breaking out of iteration unsubscribes the listener", async () => {
    const bus = new EventBus(() => new Date("2026-08-24T00:00:00Z"));
    const received: HermesEvent[] = [];
    const events = bus.subscribe();
    bus.publish("only", null);
    for await (const event of events) {
      received.push(event);
      break;
    }
    expect(received.map((e) => e.type)).toEqual(["only"]);
    bus.publish("after", null);
    expect(received).toHaveLength(1);
  });

  test("aborting the signal ends iteration", async () => {
    const bus = new EventBus(() => new Date("2026-08-24T00:00:00Z"));
    const controller = new AbortController();
    const iterator = bus.subscribe(controller.signal)[Symbol.asyncIterator]();
    const pending = iterator.next();
    controller.abort();
    expect(await pending).toEqual({ value: undefined, done: true });
    expect(await iterator.next()).toEqual({ value: undefined, done: true });
  });
});
