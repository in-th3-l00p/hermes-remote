import { describe, expect, test } from "bun:test";
import { HermesApiError, HttpClient } from "./http.ts";

function mockFetch(handler: (url: string, init: RequestInit) => Response): {
  calls: { url: string; init: RequestInit }[];
  fetch: typeof fetch;
} {
  const calls: { url: string; init: RequestInit }[] = [];
  const impl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const captured = init ?? {};
    calls.push({ url, init: captured });
    return handler(url, captured);
  }) as typeof fetch;
  return { calls, fetch: impl };
}

async function drain(iter: AsyncIterable<unknown>): Promise<unknown[]> {
  const out: unknown[] = [];
  for await (const event of iter) {
    out.push(event);
  }
  return out;
}

describe("HttpClient", () => {
  test("strips trailing slashes from baseUrl", () => {
    const http = new HttpClient({ baseUrl: "http://x///", token: "t" });
    expect(http.baseUrl).toBe("http://x");
  });

  test("anonymous clients send no authorization header", async () => {
    const { calls, fetch } = mockFetch(() => Response.json({ ok: true }));
    const http = new HttpClient({ baseUrl: "http://x", fetch });
    await http.request("GET", "/v1/status");
    expect((calls[0]?.init.headers as Record<string, string>).authorization).toBeUndefined();
  });

  test("sends bearer token from static token", async () => {
    const { calls, fetch } = mockFetch(() => Response.json({ ok: true, version: "0.0.1" }));
    const http = new HttpClient({ baseUrl: "http://x", token: "t1", fetch });
    const status = await http.request("GET", "/v1/status");
    expect(status).toEqual({ ok: true, version: "0.0.1" });
    expect(calls[0]?.url).toBe("http://x/v1/status");
    expect((calls[0]?.init.headers as Record<string, string>).authorization).toBe("Bearer t1");
  });

  test("uses async tokenProvider", async () => {
    const { calls, fetch } = mockFetch(() => Response.json({}));
    const http = new HttpClient({
      baseUrl: "http://x",
      tokenProvider: async () => "t2",
      fetch,
    });
    await http.request("GET", "/v1/status");
    expect((calls[0]?.init.headers as Record<string, string>).authorization).toBe("Bearer t2");
  });

  test("serializes JSON bodies with content-type", async () => {
    const { calls, fetch } = mockFetch(() => Response.json({}));
    const http = new HttpClient({ baseUrl: "http://x", token: "t", fetch });
    await http.request("POST", "/v1/sessions", { title: "hi" });
    expect(calls[0]?.init.method).toBe("POST");
    expect(calls[0]?.init.body).toBe('{"title":"hi"}');
    expect((calls[0]?.init.headers as Record<string, string>)["content-type"]).toBe(
      "application/json",
    );
  });

  test("throws HermesApiError with server error payload", async () => {
    const { fetch } = mockFetch(() =>
      Response.json({ error: { code: "not_found", message: "Unknown route" } }, { status: 404 }),
    );
    const http = new HttpClient({ baseUrl: "http://x", token: "t", fetch });
    const err = (await http.request("GET", "/nope").catch((e: unknown) => e)) as HermesApiError;
    expect(err).toBeInstanceOf(HermesApiError);
    expect(err.status).toBe(404);
    expect(err.code).toBe("not_found");
    expect(err.message).toBe("Unknown route");
  });

  test("throws HermesApiError on non-JSON error body", async () => {
    const { fetch } = mockFetch(() => new Response("boom", { status: 500 }));
    const http = new HttpClient({ baseUrl: "http://x", token: "t", fetch });
    const err = (await http.request("GET", "/x").catch((e: unknown) => e)) as HermesApiError;
    expect(err.status).toBe(500);
    expect(err.code).toBe("unknown_error");
    expect(err.message).toBe("Request failed with status 500");
  });

  test("retries once on 401 with a token provider", async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls += 1;
      return calls === 1
        ? new Response("no", { status: 401 })
        : Response.json({ ok: true, version: "1" });
    }) as unknown as typeof fetch;
    const http = new HttpClient({
      baseUrl: "http://x",
      tokenProvider: async () => `t${calls}`,
      fetch: fetchImpl,
    });
    expect(((await http.request("GET", "/v1/status")) as { ok: boolean }).ok).toBe(true);
    expect(calls).toBe(2);
    let anonCalls = 0;
    const anonymous = new HttpClient({
      baseUrl: "http://x",
      fetch: (async () => {
        anonCalls += 1;
        return new Response("no", { status: 401 });
      }) as unknown as typeof fetch,
    });
    await expect(anonymous.request("GET", "/v1/status")).rejects.toBeInstanceOf(HermesApiError);
    expect(anonCalls).toBe(1);
  });

  test("does not retry 401 with a static token", async () => {
    let calls = 0;
    const http = new HttpClient({
      baseUrl: "http://x",
      token: "t",
      fetch: (async () => {
        calls += 1;
        return new Response("no", { status: 401 });
      }) as unknown as typeof fetch,
    });
    await expect(http.request("GET", "/v1/status")).rejects.toBeInstanceOf(HermesApiError);
    expect(calls).toBe(1);
  });

  test("stream errors on failure status and missing body", async () => {
    const failing = new HttpClient({
      baseUrl: "http://x",
      fetch: mockFetch(() => new Response("no", { status: 401 })).fetch,
    });
    await expect(drain(failing.stream("POST", "/x", {}))).rejects.toBeInstanceOf(HermesApiError);
    const empty = new HttpClient({
      baseUrl: "http://x",
      fetch: mockFetch(() => new Response(null, { status: 200 })).fetch,
    });
    const err = (await drain(empty.stream("POST", "/x", {})).catch(
      (e: unknown) => e,
    )) as HermesApiError;
    expect(err.code).toBe("no_body");
  });
});

describe("retries", () => {
  const counting = (responses: (() => Response | Promise<Response>)[]) => {
    const calls: string[] = [];
    const fetchImpl = (async (_url: string | URL | Request, init?: RequestInit) => {
      calls.push(init?.method ?? "GET");
      const next = responses.shift();
      if (next === undefined) {
        throw new Error("no more responses");
      }
      return next();
    }) as unknown as typeof fetch;
    return { calls, fetchImpl };
  };

  test("idempotent requests retry transient failures with backoff", async () => {
    const { calls, fetchImpl } = counting([
      () => new Response("busy", { status: 503 }),
      () => {
        throw new TypeError("connection reset");
      },
      () => Response.json({ ok: true }),
    ]);
    const http = new HttpClient({
      baseUrl: "http://x",
      fetch: fetchImpl,
      retry: { baseDelayMs: 1 },
    });
    expect(await http.request<{ ok: boolean }>("GET", "/v1/status")).toEqual({ ok: true });
    expect(calls).toEqual(["GET", "GET", "GET"]);
  });

  test("gives up after the configured attempts with the last error", async () => {
    const { calls, fetchImpl } = counting([
      () => new Response("", { status: 502 }),
      () => new Response("", { status: 502 }),
    ]);
    const http = new HttpClient({
      baseUrl: "http://x",
      fetch: fetchImpl,
      retry: { attempts: 1, baseDelayMs: 1 },
    });
    const error = await http.request("GET", "/v1/x").catch((e: unknown) => e);
    expect((error as HermesApiError).status).toBe(502);
    expect(calls).toHaveLength(2);
    const failing = counting([
      () => {
        throw new TypeError("down");
      },
      () => {
        throw new TypeError("still down");
      },
    ]);
    const net = new HttpClient({
      baseUrl: "http://x",
      fetch: failing.fetchImpl,
      retry: { attempts: 1, baseDelayMs: 1 },
    });
    expect(net.request("GET", "/v1/x")).rejects.toThrow("still down");
  });

  test("mutations, client errors, aborts and retry: false are never retried", async () => {
    const post = counting([() => new Response("", { status: 503 })]);
    const http = new HttpClient({
      baseUrl: "http://x",
      fetch: post.fetchImpl,
      retry: { baseDelayMs: 1 },
    });
    expect(http.request("POST", "/v1/sessions", {})).rejects.toBeInstanceOf(HermesApiError);
    await Promise.resolve();
    expect(post.calls).toEqual(["POST"]);

    const notFound = counting([() => new Response("", { status: 404 })]);
    const four = new HttpClient({
      baseUrl: "http://x",
      fetch: notFound.fetchImpl,
      retry: { baseDelayMs: 1 },
    });
    expect(four.request("GET", "/v1/x")).rejects.toBeInstanceOf(HermesApiError);

    const disabled = counting([() => new Response("", { status: 503 })]);
    const off = new HttpClient({ baseUrl: "http://x", fetch: disabled.fetchImpl, retry: false });
    expect(off.request("GET", "/v1/x")).rejects.toBeInstanceOf(HermesApiError);

    const controller = new AbortController();
    const aborted = counting([
      () => {
        controller.abort();
        throw new DOMException("aborted", "AbortError");
      },
    ]);
    const cancelling = new HttpClient({
      baseUrl: "http://x",
      fetch: aborted.fetchImpl,
      retry: { baseDelayMs: 1 },
    });
    expect(cancelling.raw("GET", "/v1/x", undefined, controller.signal)).rejects.toThrow("aborted");
    await new Promise((r) => setTimeout(r, 20));
    expect([disabled.calls.length, aborted.calls.length, notFound.calls.length]).toEqual([1, 1, 1]);
  });
});
