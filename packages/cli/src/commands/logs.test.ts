import { describe, expect, test } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { runCli } from "../run.ts";
import { makeCtx } from "./harness.test.ts";

describe("logs", () => {
  test("reports when there are no logs", async () => {
    const { ctx } = await makeCtx();
    expect((await runCli(["logs"], ctx)).output).toBe("no logs yet");
  });

  test("tails the log file", async () => {
    const { ctx } = await makeCtx();
    await mkdir(join(ctx.homeDir, "logs"), { recursive: true });
    await writeFile(
      join(ctx.homeDir, "logs", "server.log"),
      "one\ntwo\nthree\n",
    );
    expect((await runCli(["logs"], ctx)).output).toBe("one\ntwo\nthree");
    expect((await runCli(["logs", "--tail", "2"], ctx)).output).toBe(
      "two\nthree",
    );
    expect((await runCli(["logs", "--tail", "-1"], ctx)).output).toContain(
      "invalid --tail: -1",
    );
  });
});
