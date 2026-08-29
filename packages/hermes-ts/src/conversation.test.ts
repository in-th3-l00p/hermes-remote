import { describe, expect, test } from "bun:test";
import { HermesClient } from "./client.ts";

const sse = (events: { event: string; data: unknown }[]): Response =>
  new Response(
    events
      .map((e) => `event: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`)
      .join(""),
    { headers: { "content-type": "text/event-stream" } },
  );

const doneEvent = {
  event: "done",
  data: {
    id: "m2",
    role: "assistant",
    content: "hi there",
    attachments: [],
    reactions: {},
    createdAt: "2026-08-24T00:00:00.000Z",
    editedAt: null,
    status: "done",
  },
};

function makeClient(): { client: HermesClient; calls: string[] } {
  const calls: string[] = [];
  const client = new HermesClient({
    baseUrl: "http://x",
    fetch: (async (url: string | URL | Request, init?: RequestInit) => {
      const path = String(url).replace("http://x", "");
      const method = init?.method ?? "GET";
      calls.push(`${method} ${path}`);
      if (method === "POST" && path === "/v1/sessions") {
        return Response.json({ id: "s1", userId: null, messages: [] });
      }
      if (path.endsWith("/messages") && method === "POST") {
        return sse([doneEvent]);
      }
      if (path.includes("/messages/") && method === "PATCH") {
        return sse([doneEvent]);
      }
      if (path.endsWith("/reactions")) {
        return Response.json({ id: "m2", reactions: { "🔥": 1 } });
      }
      if (path.endsWith("/messages")) {
        return Response.json({ messages: [{ id: "m1" }], total: 1 });
      }
      if (path.endsWith("/stop")) {
        return Response.json({ stopped: true });
      }
      return Response.json({ deleted: true });
    }) as unknown as typeof fetch,
  });
  return { client, calls };
}

describe("conversation handle", () => {
  test("creates the session lazily on first send", async () => {
    const { client, calls } = makeClient();
    const conversation = client.conversation();
    expect(conversation.id).toBeNull();
    const events = [];
    for await (const event of conversation.send("hello")) {
      events.push(event);
    }
    expect(conversation.id).toBe("s1");
    expect(events).toHaveLength(1);
    expect(calls).toEqual([
      "POST /v1/sessions",
      "POST /v1/sessions/s1/messages",
    ]);
    for await (const event of conversation.send("again")) {
      void event;
    }
    expect(calls).toHaveLength(3);
  });

  test("wraps an existing session and delegates every operation", async () => {
    const { client, calls } = makeClient();
    const conversation = client.conversation("s9");
    expect(conversation.id).toBe("s9");
    for await (const event of conversation.edit("m1", "fixed")) {
      void event;
    }
    expect(await conversation.stop()).toEqual({ stopped: true });
    await conversation.react("m2", "🔥");
    expect(await conversation.messages()).toEqual([
      { id: "m1" } as unknown as Awaited<
        ReturnType<typeof conversation.messages>
      >[number],
    ]);
    await conversation.remove();
    expect(calls).toEqual([
      "PATCH /v1/sessions/s9/messages/m1",
      "POST /v1/sessions/s9/stop",
      "POST /v1/sessions/s9/messages/m2/reactions",
      "GET /v1/sessions/s9/messages",
      "DELETE /v1/sessions/s9",
    ]);
  });

  test("session-bound operations throw before the first send", async () => {
    const { client } = makeClient();
    const conversation = client.conversation();
    expect(() => conversation.edit("m1", "x")).toThrow(
      "conversation has no session yet",
    );
    expect(conversation.stop()).rejects.toThrow("conversation has no session yet");
    expect(conversation.react("m", "x")).rejects.toThrow(
      "conversation has no session yet",
    );
    expect(conversation.messages()).rejects.toThrow(
      "conversation has no session yet",
    );
    expect(conversation.remove()).rejects.toThrow(
      "conversation has no session yet",
    );
  });

  test("passes attachments and abort signals through", async () => {
    const { client, calls } = makeClient();
    const conversation = client.conversation("s2");
    const controller = new AbortController();
    for await (const event of conversation.send("look", {
      attachments: [
        { name: "a.png", type: "image/png", dataUrl: "data:image/png;base64,AA==" },
      ],
      signal: controller.signal,
    })) {
      void event;
    }
    expect(calls).toEqual(["POST /v1/sessions/s2/messages"]);
  });
});
