import { describe, expect, test } from "bun:test";
import { runCli } from "./run.ts";
import { makeCtx } from "./commands/harness.test.ts";

describe("usage", () => {
  test("no args fails with usage; help succeeds", async () => {
    const { ctx } = await makeCtx();
    expect(await runCli([], ctx)).toMatchObject({ exitCode: 1 });
    expect(await runCli(["help"], ctx)).toMatchObject({ exitCode: 0 });
    expect((await runCli(["--help"], ctx)).output).toContain("Commands:");
  });

  test("unknown command fails", async () => {
    const { ctx } = await makeCtx();
    const result = await runCli(["bogus"], ctx);
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("unknown command: bogus");
  });
});
