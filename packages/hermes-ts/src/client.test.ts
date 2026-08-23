import { describe, expect, test } from "bun:test";
import { HermesApiError, HermesClient } from "./index.ts";

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

describe("HermesClient", () => {
  test("requires a token or tokenProvider", () => {
    expect(() => new HermesClient({ baseUrl: "http://x" })).toThrow(
      "HermesClient requires a token or a tokenProvider",
    );
  });

  test("strips trailing slashes from baseUrl", () => {
    const client = new HermesClient({ baseUrl: "http://x///", token: "t" });
    expect(client.baseUrl).toBe("http://x");
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
});
