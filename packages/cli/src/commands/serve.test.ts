import { describe, expect, test } from "bun:test";
import { runCli } from "../run.ts";
import { makeCtx } from "./harness.test.ts";

describe("serve", () => {
  test("starts the server through the context", async () => {
    const { ctx, serveCalls } = await makeCtx();
    const result = await runCli(["serve", "--port", "0"], ctx);
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("listening on port 12345");
    expect(serveCalls[0]?.logPath).toContain("server.log");
  });

  test("passes anonymous, cors, and upstream flags", async () => {
    const { ctx, serveCalls } = await makeCtx();
    await runCli(
      [
        "serve", "--port", "0", "--anonymous", "--cors", "http://localhost:5173",
        "--upstream", "http://127.0.0.1:8642", "--upstream-key", "k", "--model", "m",
      ],
      ctx,
    );
    expect(serveCalls[0]).toMatchObject({
      anonymous: true,
      corsOrigins: ["http://localhost:5173"],
      upstream: { baseUrl: "http://127.0.0.1:8642", apiKey: "k", model: "m" },
    });
  });

  test("passes the supabase jwt secret from flag or env", async () => {
    const { ctx, serveCalls } = await makeCtx();
    await runCli(
      ["serve", "--port", "0", "--supabase-jwt-secret", "s1"],
      ctx,
    );
    expect(serveCalls[0]?.supabaseJwtSecret).toBe("s1");
    ctx.env["SUPABASE_JWT_SECRET"] = "s2";
    await runCli(["serve", "--port", "0"], ctx);
    expect(serveCalls[1]?.supabaseJwtSecret).toBe("s2");
  });

  test("passes the supabase url from flag or env", async () => {
    const { ctx, serveCalls } = await makeCtx();
    await runCli(
      ["serve", "--port", "0", "--supabase-url", "https://p.supabase.co"],
      ctx,
    );
    expect(serveCalls[0]?.supabaseUrl).toBe("https://p.supabase.co");
    ctx.env["SUPABASE_URL"] = "https://env.supabase.co";
    await runCli(["serve", "--port", "0"], ctx);
    expect(serveCalls[1]?.supabaseUrl).toBe("https://env.supabase.co");
  });

  test("reads upstream from the environment", async () => {
    const { ctx, serveCalls } = await makeCtx();
    ctx.env["HERMES_UPSTREAM_URL"] = "http://env-upstream";
    ctx.env["HERMES_UPSTREAM_KEY"] = "env-key";
    const result = await runCli(["serve", "--port", "0"], ctx);
    expect(result.output).toContain("agent: http://env-upstream");
    expect(serveCalls[0]?.upstream).toEqual({
      baseUrl: "http://env-upstream",
      apiKey: "env-key",
    });
    expect(serveCalls[0]?.anonymous).toBe(false);
    expect(serveCalls[0]?.corsOrigins).toEqual([]);
  });

  test("upstream without a key fails", async () => {
    const { ctx } = await makeCtx();
    const result = await runCli(
      ["serve", "--upstream", "http://x"],
      ctx,
    );
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("requires a key");
  });

  test("no upstream reports demo agent", async () => {
    const { ctx } = await makeCtx();
    const result = await runCli(["serve", "--port", "0"], ctx);
    expect(result.output).toContain("demo (no upstream configured)");
  });

  test("defaults to port 8643 and validates --port", async () => {
    const { ctx, serveCalls } = await makeCtx();
    await runCli(["serve"], ctx);
    expect(serveCalls[0]?.port).toBe(8643);
    expect((await runCli(["serve", "--port", "hi"], ctx)).output).toContain(
      "invalid --port: hi",
    );
  });

  test("reports a busy port instead of crashing", async () => {
    const { ctx } = await makeCtx();
    ctx.serve = async () => {
      throw Object.assign(new Error("Failed to start server"), {
        code: "EADDRINUSE",
      });
    };
    const result = await runCli(["serve", "--port", "8643"], ctx);
    expect(result.exitCode).toBe(1);
    expect(result.output).toBe("port 8643 already in use");
  });

  test("rethrows non-port serve errors", async () => {
    const { ctx } = await makeCtx();
    ctx.serve = async () => {
      throw new Error("boom");
    };
    expect(runCli(["serve", "--port", "0"], ctx)).rejects.toThrow("boom");
  });

  test("rate limit flags override config", async () => {
    const { ctx, serveCalls } = await makeCtx();
    await runCli(
      ["serve", "--port", "0", "--rate-limit", "5", "--rate-window", "7"],
      ctx,
    );
    expect(serveCalls[0]?.rateLimit).toEqual({ limit: 5, windowSeconds: 7 });
  });
});
