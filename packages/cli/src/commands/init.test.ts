import { describe, expect, test } from "bun:test";
import { stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { runCli } from "../run.ts";
import { makeCtx } from "./harness.test.ts";

describe("init and config file", () => {
  test("init writes config.json and serve reads it", async () => {
    const { ctx, serveCalls } = await makeCtx();
    const result = await runCli(
      [
        "init", "--port", "9999", "--cors", "http://a.test,http://b.test",
        "--anonymous", "--upstream", "http://up", "--upstream-key", "uk",
        "--model", "m", "--supabase-url", "https://sb",
        "--supabase-jwt-secret", "sec", "--rate-limit", "30", "--rate-window", "10",
      ],
      ctx,
    );
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("config.json");
    await runCli(["serve"], ctx);
    expect(serveCalls[0]).toMatchObject({
      port: 9999,
      anonymous: true,
      corsOrigins: ["http://a.test", "http://b.test"],
      supabaseUrl: "https://sb",
      supabaseJwtSecret: "sec",
      rateLimit: { limit: 30, windowSeconds: 10 },
      upstream: { baseUrl: "http://up", apiKey: "uk", model: "m" },
    });
    expect(serveCalls[0]?.auditPath).toContain("audit.log");
    await runCli(["serve", "--port", "0", "--cors", "http://c.test"], ctx);
    expect(serveCalls[1]?.port).toBe(0);
    expect(serveCalls[1]?.corsOrigins).toEqual(["http://c.test"]);
  });

  test("re-running init merges over the existing config", async () => {
    const { ctx } = await makeCtx();
    await runCli(
      ["init", "--port", "9999", "--upstream-key", "uk", "--anonymous"],
      ctx,
    );
    const result = await runCli(["init", "--port", "1234"], ctx);
    expect(result.exitCode).toBe(0);
    const config = await Bun.file(join(ctx.homeDir, "config.json")).json();
    expect(config).toEqual({ port: 1234, upstreamKey: "uk", anonymous: true });
  });

  test("init writes config.json with owner-only permissions", async () => {
    const { ctx } = await makeCtx();
    expect((await runCli(["init"], ctx)).exitCode).toBe(0);
    const file = await stat(join(ctx.homeDir, "config.json"));
    expect(file.mode & 0o777).toBe(0o600);
    const nested = { ...ctx, homeDir: join(ctx.homeDir, "fresh-home") };
    expect((await runCli(["init"], nested)).exitCode).toBe(0);
    const dir = await stat(nested.homeDir);
    expect(dir.mode & 0o777).toBe(0o700);
  });

  test("init and serve fail loudly on malformed config.json", async () => {
    const { ctx, serveCalls } = await makeCtx();
    await writeFile(join(ctx.homeDir, "config.json"), "not json");
    const init = await runCli(["init", "--port", "1"], ctx);
    expect(init.exitCode).toBe(1);
    expect(init.output).toContain("invalid config.json:");
    const serve = await runCli(["serve", "--port", "0"], ctx);
    expect(serve.exitCode).toBe(1);
    expect(serve.output).toContain("invalid config.json:");
    expect(serveCalls).toHaveLength(0);
  });
});
