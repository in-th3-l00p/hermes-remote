import { describe, expect, test } from "bun:test";
import { writeFile } from "node:fs/promises";
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

  test("init with no flags writes an empty config", async () => {
    const { ctx } = await makeCtx();
    expect((await runCli(["init"], ctx)).exitCode).toBe(0);
    const { ctx: fresh, serveCalls } = await makeCtx();
    await writeFile(join(fresh.homeDir, "config.json"), "not json");
    await runCli(["serve", "--port", "0"], fresh);
    expect(serveCalls[0]?.rateLimit).toBeNull();
  });
});
