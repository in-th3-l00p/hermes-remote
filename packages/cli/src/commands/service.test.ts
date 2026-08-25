import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { runCli } from "../run.ts";
import { makeCtx } from "./harness.test.ts";

describe("service", () => {
  test("install writes a launchd plist on darwin", async () => {
    const { ctx } = await makeCtx();
    const result = await runCli(["service", "install"], ctx);
    expect(result.exitCode).toBe(0);
    const unit = await Bun.file(
      join(ctx.homeDir, "com.hermes-remote.server.plist"),
    ).text();
    expect(unit).toContain("<string>hermes-remote</string>");
    expect((await runCli(["service", "status"], ctx)).output).toContain(
      "launchctl load",
    );
    expect((await runCli(["service", "uninstall"], ctx)).output).toContain(
      "launchctl unload",
    );
  });

  test("install writes a systemd unit on linux", async () => {
    const { ctx } = await makeCtx();
    ctx.platform = "linux";
    await runCli(["service", "install"], ctx);
    const unit = await Bun.file(
      join(ctx.homeDir, "hermes-remote.service"),
    ).text();
    expect(unit).toContain("ExecStart=hermes-remote serve");
    expect((await runCli(["service", "status"], ctx)).output).toContain(
      "systemctl --user",
    );
    expect((await runCli(["service", "uninstall"], ctx)).output).toContain(
      "systemctl --user disable",
    );
    expect((await runCli(["service", "explode"], ctx)).exitCode).toBe(1);
    expect((await runCli(["service"], ctx)).exitCode).toBe(1);
  });
});
