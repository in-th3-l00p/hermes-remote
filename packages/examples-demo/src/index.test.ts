import { describe, expect, test } from "bun:test";
import { createDemoFetch, defaultDelay } from "./index.ts";

describe("createDemoFetch", () => {
  test("defaults work end to end with real time and delays", async () => {
    const fetchImpl = createDemoFetch();
    const res = await fetchImpl("https://hermes.local/v1/status");
    expect(res.status).toBe(200);
    const sessions = await fetchImpl("https://hermes.local/v1/sessions");
    const body = (await sessions.json()) as { sessions: { updatedAt: string }[] };
    expect(Date.parse(body.sessions[0]?.updatedAt ?? "")).toBeLessThanOrEqual(Date.now());
  });

  test("two instances have isolated state", async () => {
    const first = createDemoFetch({ delay: () => Promise.resolve() });
    const second = createDemoFetch({ delay: () => Promise.resolve() });
    await first("https://hermes.local/v1/sessions/9f21c8a4d301", { method: "DELETE" });
    const untouched = await second("https://hermes.local/v1/sessions/9f21c8a4d301/messages");
    expect(untouched.status).toBe(200);
  });

  test("accepts a fixed clock", async () => {
    const fetchImpl = createDemoFetch({
      delay: () => Promise.resolve(),
      now: () => new Date("2026-08-31T12:00:00Z"),
    });
    const res = await fetchImpl("https://hermes.local/v1/sessions", { method: "POST" });
    const body = (await res.json()) as { createdAt: string };
    expect(body.createdAt).toBe("2026-08-31T12:00:00.000Z");
  });
});

describe("defaultDelay", () => {
  test("waits via setTimeout", async () => {
    const before = Date.now();
    await defaultDelay(5);
    expect(Date.now() - before).toBeGreaterThanOrEqual(3);
  });
});
