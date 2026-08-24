import { describe, expect, test } from "bun:test";
import { HermesApiError, HermesClient } from "./index.ts";
import type { ChatEvent } from "./index.ts";

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
  test("strips trailing slashes from baseUrl", () => {
    const client = new HermesClient({ baseUrl: "http://x///", token: "t" });
    expect(client.baseUrl).toBe("http://x");
  });

  test("anonymous clients send no authorization header", async () => {
    const { calls, fetch } = mockFetch(() =>
      Response.json({ ok: true, version: "0.1.0" }),
    );
    const client = new HermesClient({ baseUrl: "http://x", fetch });
    await client.status();
    expect(
      (calls[0]?.init.headers as Record<string, string>).authorization,
    ).toBeUndefined();
  });

  test("sends bearer token from static token", async () => {
    const { calls, fetch } = mockFetch(() =>
      Response.json({ ok: true, version: "0.0.1" }),
    );
    const client = new HermesClient({ baseUrl: "http://x", token: "t1", fetch });
    const status = await client.status();
    expect(status).toEqual({ ok: true, version: "0.0.1" });
    expect(calls[0]?.url).toBe("http://x/v1/status");
    expect(
      (calls[0]?.init.headers as Record<string, string>).authorization,
    ).toBe("Bearer t1");
  });

  test("uses async tokenProvider", async () => {
    const { calls, fetch } = mockFetch(() => Response.json({}));
    const client = new HermesClient({
      baseUrl: "http://x",
      tokenProvider: async () => "t2",
      fetch,
    });
    await client.request("GET", "/v1/status");
    expect(
      (calls[0]?.init.headers as Record<string, string>).authorization,
    ).toBe("Bearer t2");
  });

  test("serializes JSON bodies with content-type", async () => {
    const { calls, fetch } = mockFetch(() => Response.json({}));
    const client = new HermesClient({ baseUrl: "http://x", token: "t", fetch });
    await client.request("POST", "/v1/sessions", { title: "hi" });
    expect(calls[0]?.init.method).toBe("POST");
    expect(calls[0]?.init.body).toBe('{"title":"hi"}');
    expect(
      (calls[0]?.init.headers as Record<string, string>)["content-type"],
    ).toBe("application/json");
  });

  test("throws HermesApiError with server error payload", async () => {
    const { fetch } = mockFetch(() =>
      Response.json(
        { error: { code: "not_found", message: "Unknown route" } },
        { status: 404 },
      ),
    );
    const client = new HermesClient({ baseUrl: "http://x", token: "t", fetch });
    const err = (await client
      .request("GET", "/nope")
      .catch((e: unknown) => e)) as HermesApiError;
    expect(err).toBeInstanceOf(HermesApiError);
    expect(err.status).toBe(404);
    expect(err.code).toBe("not_found");
    expect(err.message).toBe("Unknown route");
  });

  test("throws HermesApiError on non-JSON error body", async () => {
    const { fetch } = mockFetch(() => new Response("boom", { status: 500 }));
    const client = new HermesClient({ baseUrl: "http://x", token: "t", fetch });
    const err = (await client
      .request("GET", "/x")
      .catch((e: unknown) => e)) as HermesApiError;
    expect(err.status).toBe(500);
    expect(err.code).toBe("unknown_error");
    expect(err.message).toBe("Request failed with status 500");
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
    expect(calls[2]?.url).toBe("http://x/v1/sessions?ids=a,b");
    await client.deleteSession("s1");
    expect(calls[3]?.init.method).toBe("DELETE");
    expect(calls[3]?.url).toBe("http://x/v1/sessions/s1");
  });

  test("sendMessage streams chat events", async () => {
    const { calls, fetch } = mockFetch(() =>
      sseBody([
        { event: "user", data: { id: "u1" } },
        { event: "delta", data: { id: "a1", text: "hi" } },
        { event: "done", data: { id: "a1", content: "hi" } },
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
        : sseBody([{ event: "done", data: { id: "a1" } }]),
    );
    const client = new HermesClient({ baseUrl: "http://x", fetch });
    const events = await collect(client.editMessage("s1", "m1", "new"));
    expect(events[0]?.event).toBe("done");
    expect(calls[0]?.init.method).toBe("PATCH");
    const reacted = await client.react("s1", "m1", "👍");
    expect(reacted.reactions).toEqual({ "👍": 1 });
  });

  test("stream errors on failure status and missing body", async () => {
    const failing = new HermesClient({
      baseUrl: "http://x",
      fetch: mockFetch(() => new Response("no", { status: 401 })).fetch,
    });
    await expect(
      collect(failing.sendMessage("s1", { content: "x" })),
    ).rejects.toBeInstanceOf(HermesApiError);
    const empty = new HermesClient({
      baseUrl: "http://x",
      fetch: mockFetch(() => new Response(null, { status: 200 })).fetch,
    });
    const err = (await collect(empty.sendMessage("s1", { content: "x" })).catch(
      (e: unknown) => e,
    )) as HermesApiError;
    expect(err.code).toBe("no_body");
  });
});
