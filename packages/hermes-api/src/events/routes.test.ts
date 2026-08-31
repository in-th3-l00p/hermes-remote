import { describe, expect, test } from "bun:test";
import { createApp, EventBus, type KeyVerifier } from "../index.ts";
import type { ApiKeyRecord } from "../auth/index.ts";

function keyStore(scopes: string[]): KeyVerifier {
  const record: ApiKeyRecord = {
    id: "abc123",
    name: "ops",
    hash: "h",
    scopes,
    userGrantable: [],
    createdAt: "2026-08-23T00:00:00.000Z",
    expiresAt: null,
    revoked: false,
  };
  return { verifyToken: async (t) => (t === "hk_good" ? record : null) };
}

describe("event routes", () => {
  test("keys without events:subscribe are denied", async () => {
    const app = createApp({ store: keyStore(["status:read"]) });
    const res = await app.fetch(
      new Request("http://x/v1/events", {
        headers: { authorization: "Bearer hk_good" },
      }),
    );
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({
      error: {
        code: "missing_scope",
        message: "This route requires the events:subscribe scope",
      },
    });
  });

  test("heartbeats stop once the consumer cancels the stream", async () => {
    const events = new EventBus(() => new Date("2026-08-24T00:00:00Z"));
    const app = createApp({
      store: keyStore(["events:subscribe"]),
      events,
      eventsHeartbeatMs: 5,
    });
    const res = await app.fetch(
      new Request("http://x/v1/events", {
        headers: { authorization: "Bearer hk_good" },
      }),
    );
    expect(res.headers.get("content-type")).toBe("text/event-stream");
    const reader = (res.body as ReadableStream<Uint8Array>).getReader();
    await reader.cancel();
    // Let a heartbeat tick fire against the cancelled stream; the route
    // catches the failed enqueue and clears its own interval.
    await new Promise((resolve) => setTimeout(resolve, 25));
    events.publish("late", null);
  });
});
