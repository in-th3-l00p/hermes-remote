import type { Hono } from "hono";
import { requireScope, type ChatEnv } from "../chat/routes/shared.ts";
import type { EventBus, HermesEvent } from "./bus.ts";

export function registerEventRoutes(
  app: Hono<ChatEnv>,
  bus: EventBus,
  heartbeatMs = 15_000,
): void {
  app.get("/v1/events", (c) => {
    const denied = requireScope(c.get("principal"), "events:subscribe");
    if (denied !== null) {
      return denied;
    }
    const signal = c.req.raw.signal;
    const encoder = new TextEncoder();
    const events = bus.subscribe(signal);
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const heartbeat = setInterval(() => {
          try {
            controller.enqueue(encoder.encode(": heartbeat\n\n"));
          } catch {
            clearInterval(heartbeat);
          }
        }, heartbeatMs);
        try {
          for await (const event of events) {
            controller.enqueue(encoder.encode(frame(event)));
          }
        } finally {
          clearInterval(heartbeat);
          try {
            controller.close();
          } catch {
            // already closed by the consumer
          }
        }
      },
    });
    return new Response(stream, {
      headers: { "content-type": "text/event-stream" },
    });
  });
}

function frame(event: HermesEvent): string {
  return `event: ${event.type}\ndata: ${JSON.stringify({ at: event.at, ...(typeof event.data === "object" && event.data !== null ? event.data : { value: event.data }) })}\n\n`;
}
