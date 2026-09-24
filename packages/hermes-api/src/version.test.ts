import { describe, expect, test } from "bun:test";
import { VERSION } from "./version.ts";
import { createApp } from "./index.ts";
import pkg from "../package.json";

describe("version", () => {
  test("comes from package.json and is reported by /v1/status", async () => {
    expect(VERSION).toBe(pkg.version);
    const res = await createApp().fetch(new Request("http://x/v1/status"));
    expect(await res.json()).toEqual({ ok: true, version: pkg.version });
  });
});
