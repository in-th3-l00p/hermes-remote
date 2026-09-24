import { describe, expect, test } from "bun:test";
import { HermesClient } from "./index.ts";
import type { ChatEvent, ChatMessage } from "./index.ts";

const message = (
  id: string,
  role: "user" | "assistant",
  content: string,
): ChatMessage => ({
  id,
  role,
  content,
  attachments: [],
  reactions: {},
  createdAt: "2026-08-25T00:00:00.000Z",
  editedAt: null,
  status: "done",
});

function mockFetch(
  handler: (url: string, init: RequestInit) => Response,
): { calls: { url: string; init: RequestInit }[]; fetch: typeof fetch } {
  const calls: { url: string; init: RequestInit }[] = [];
  const impl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const captured = init ?? {};
    calls.push({ url, init: captured });
    return handler(url, captured);
  }) as typeof fetch;
  return { calls, fetch: impl };
}

function sseBody(events: { event: string; data: unknown }[]): Response {
  const text = events
    .map((e) => `event: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`)
    .join("");
  return new Response(text, {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });
}

async function collect(iter: AsyncIterable<ChatEvent>): Promise<ChatEvent[]> {
  const out: ChatEvent[] = [];
  for await (const event of iter) {
    out.push(event);
  }
  return out;
}

describe("HermesClient", () => {
  test("exposes the normalized baseUrl", () => {
    const client = new HermesClient({ baseUrl: "http://x///", token: "t" });
    expect(client.baseUrl).toBe("http://x");
  });

  test("reports status", async () => {
    const { calls, fetch } = mockFetch(() =>
      Response.json({ ok: true, version: "0.0.1" }),
    );
    const client = new HermesClient({ baseUrl: "http://x", token: "t1", fetch });
    expect(await client.status()).toEqual({ ok: true, version: "0.0.1" });
    expect(calls[0]?.url).toBe("http://x/v1/status");
    expect(
      (calls[0]?.init.headers as Record<string, string>).authorization,
    ).toBe("Bearer t1");
  });

  test("creates sessions and lists messages", async () => {
    const { calls, fetch } = mockFetch((url) =>
      url.endsWith("/v1/sessions")
        ? Response.json({ id: "s1", createdAt: "t", messages: [] })
        : Response.json({ messages: [{ id: "m1" }] }),
    );
    const client = new HermesClient({ baseUrl: "http://x", fetch });
    expect((await client.createSession()).id).toBe("s1");
    expect(await client.listMessages("s1")).toEqual([
      { id: "m1" } as never,
    ]);
    expect(calls[1]?.url).toBe("http://x/v1/sessions/s1/messages");
  });

  test("lists and deletes sessions", async () => {
    const { calls, fetch } = mockFetch((url, init) =>
      init.method === "DELETE"
        ? Response.json({ deleted: true })
        : Response.json({ sessions: [{ id: "s1" }] }),
    );
    const client = new HermesClient({ baseUrl: "http://x", fetch });
    expect(await client.listSessions()).toEqual([{ id: "s1" } as never]);
    expect(await client.listSessions([])).toEqual([{ id: "s1" } as never]);
    await client.listSessions(["a", "b"]);
    expect(new URL(calls[2]?.url ?? "").searchParams.get("ids")).toBe("a,b");
    await client.deleteSession("s1");
    expect(calls[3]?.init.method).toBe("DELETE");
    expect(calls[3]?.url).toBe("http://x/v1/sessions/s1");
    await client.listSessions(undefined, { archived: true });
    expect(calls[4]?.url).toBe("http://x/v1/sessions?archived=true");
  });

  test("whoami asks the server who the caller is", async () => {
    const { calls, fetch } = mockFetch(() => Response.json({ type: "anonymous" }));
    const client = new HermesClient({ baseUrl: "http://x", fetch });
    expect(await client.whoami()).toEqual({ type: "anonymous" });
    expect(calls[0]?.url).toBe("http://x/v1/auth/whoami");
  });

  test("renames, archives, forks, searches and exports sessions", async () => {
    const { calls, fetch } = mockFetch((url) =>
      url.includes("/export")
        ? new Response("# T")
        : url.includes("/search")
          ? Response.json({ sessions: [{ id: "s2" }] })
          : Response.json({ id: "s1" }),
    );
    const client = new HermesClient({ baseUrl: "http://x", fetch });
    await client.renameSession("s1", "Plans");
    expect([calls[0]?.init.method, calls[0]?.url, calls[0]?.init.body]).toEqual([
      "PATCH",
      "http://x/v1/sessions/s1",
      JSON.stringify({ title: "Plans" }),
    ]);
    await client.archiveSession("s1");
    expect(calls[1]?.init.body).toBe(JSON.stringify({ archived: true }));
    await client.archiveSession("s1", false);
    expect(calls[2]?.init.body).toBe(JSON.stringify({ archived: false }));
    await client.forkSession("s1", "m1");
    expect([calls[3]?.url, calls[3]?.init.body]).toEqual([
      "http://x/v1/sessions/s1/fork",
      JSON.stringify({ messageId: "m1" }),
    ]);
    await client.forkSession("s1");
    expect(calls[4]?.init.body).toBe("{}");
    expect(await client.searchSessions("launch plan", 5)).toEqual([{ id: "s2" } as never]);
    expect(calls[5]?.url).toBe("http://x/v1/sessions/search?q=launch+plan&limit=5");
    await client.searchSessions("x");
    expect(calls[6]?.url).toBe("http://x/v1/sessions/search?q=x");
    expect(await (await client.exportSession("s1", "markdown")).text()).toBe("# T");
    expect(calls[7]?.url).toBe("http://x/v1/sessions/s1/export?format=markdown");
    await client.exportSession("s1");
    expect(calls[8]?.url).toBe("http://x/v1/sessions/s1/export");
  });

  test("sendMessage streams chat events", async () => {
    const { calls, fetch } = mockFetch(() =>
      sseBody([
        { event: "user", data: message("u1", "user", "hello") },
        { event: "delta", data: { id: "a1", text: "hi" } },
        { event: "done", data: message("a1", "assistant", "hi") },
      ]),
    );
    const client = new HermesClient({ baseUrl: "http://x", fetch });
    const events = await collect(
      client.sendMessage("s1", { content: "hello" }),
    );
    expect(events.map((e) => e.event)).toEqual(["user", "delta", "done"]);
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({
      content: "hello",
      attachments: [],
    });
  });

  test("editMessage streams and react toggles", async () => {
    const { calls, fetch } = mockFetch((url) =>
      url.includes("/reactions")
        ? Response.json({ id: "m1", reactions: { "👍": 1 } })
        : sseBody([{ event: "done", data: message("a1", "assistant", "re") }]),
    );
    const client = new HermesClient({ baseUrl: "http://x", fetch });
    const events = await collect(client.editMessage("s1", "m1", "new"));
    expect(events[0]?.event).toBe("done");
    expect(calls[0]?.init.method).toBe("PATCH");
    const reacted = await client.react("s1", "m1", "👍");
    expect(reacted.reactions).toEqual({ "👍": 1 });
  });

  test("drops non-conforming and unknown stream events", async () => {
    const { fetch } = mockFetch(() =>
      sseBody([
        { event: "hermes.tool.progress", data: { step: 1 } },
        { event: "delta", data: { id: "a1" } },
        { event: "delta", data: { id: "a1", text: "hi" } },
      ]),
    );
    const client = new HermesClient({ baseUrl: "http://x", fetch });
    const events = await collect(client.sendMessage("s1", { content: "x" }));
    expect(events).toEqual([
      { event: "delta", data: { id: "a1", text: "hi" } },
    ]);
  });

  test("passes abort signals through and stops turns", async () => {
    const { calls, fetch } = mockFetch((url) =>
      url.endsWith("/stop")
        ? Response.json({ stopped: true })
        : sseBody([{ event: "done", data: message("a1", "assistant", "ok") }]),
    );
    const client = new HermesClient({ baseUrl: "http://x", fetch });
    const controller = new AbortController();
    await collect(
      client.sendMessage("s1", { content: "x" }, { signal: controller.signal }),
    );
    expect(calls[0]?.init.signal).toBe(controller.signal);
    await collect(client.editMessage("s1", "m1", "y", { signal: controller.signal }));
    expect(calls[1]?.init.signal).toBe(controller.signal);
    expect(await client.stopTurn("s1")).toEqual({ stopped: true });
    expect(calls[2]?.url).toBe("http://x/v1/sessions/s1/stop");
  });
});
