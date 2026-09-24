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

  test("help documents every config.json setting and keys create --profile", async () => {
    const { ctx } = await makeCtx();
    const { output } = await runCli(["help"], ctx);
    // Settings with a serve flag appear as the flag; the rest by their config.json name.
    for (const option of [
      "--port",
      "--host",
      "--cors",
      "--trust-proxy",
      "--anonymous",
      "--upstream",
      "--upstream-key",
      "--model",
      "--rate-limit",
      '"auth"',
      '"hermesBinary"',
      '"profileHomes"',
      '"commandRelay"',
    ]) {
      expect(output).toContain(option);
    }
    expect(output).toContain("[--profile <name>]");
  });

  test("unknown command fails", async () => {
    const { ctx } = await makeCtx();
    const result = await runCli(["bogus"], ctx);
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("unknown command: bogus");
  });
});
