import { describe, expect, test } from "bun:test";
import { createApp } from "./index.ts";

describe("createApp", () => {
  test("GET /v1/status returns ok with default version", async () => {
    const app = createApp();
    const res = await app.fetch(new Request("http://localhost/v1/status"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, version: "0.0.1" });
  });

  test("GET /v1/status returns configured version", async () => {
    const app = createApp({ version: "1.2.3" });
    const res = await app.fetch(new Request("http://localhost/v1/status"));
    expect(await res.json()).toEqual({ ok: true, version: "1.2.3" });
  });

  test("unknown route returns 404", async () => {
    const app = createApp();
    const res = await app.fetch(new Request("http://localhost/nope"));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({
      error: { code: "not_found", message: "Unknown route" },
    });
  });

  test("non-GET on /v1/status returns 404", async () => {
    const app = createApp();
    const res = await app.fetch(
      new Request("http://localhost/v1/status", { method: "POST" }),
    );
    expect(res.status).toBe(404);
  });
});
