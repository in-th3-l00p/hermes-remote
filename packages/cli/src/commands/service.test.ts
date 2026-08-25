import { describe, expect, test } from "bun:test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { runCli } from "../run.ts";
import { makeCtx } from "./harness.test.ts";

describe("service", () => {
  test("install writes a launchd plist on darwin with absolute paths", async () => {
    const { ctx } = await makeCtx();
    const result = await runCli(["service", "install"], ctx);
    expect(result.exitCode).toBe(0);
    const unit = await Bun.file(
      join(ctx.homeDir, "com.hermes-remote.server.plist"),
    ).text();
    expect(unit).toContain("<string>/test/bin/hermes-remote</string>");
    expect(unit).toContain("<string>serve</string>");
    expect(unit).toContain(
      "<key>PATH</key><string>/test/bin:/usr/local/bin:/usr/bin:/bin</string>",
    );
    expect(unit).toContain("<key>ThrottleInterval</key><integer>5</integer>");
    expect(unit).toContain(
      `<key>StandardOutPath</key><string>${join(ctx.homeDir, "logs", "service.log")}</string>`,
    );
    expect(unit).not.toContain("HERMES_REMOTE_HOME");
    expect((await runCli(["service", "status"], ctx)).output).toContain(
      "launchctl load",
    );
    expect((await runCli(["service", "uninstall"], ctx)).output).toContain(
      "launchctl unload",
    );
  });

  test("install writes a systemd unit on linux with absolute paths", async () => {
    const { ctx } = await makeCtx();
    ctx.platform = "linux";
    ctx.env["HERMES_REMOTE_HOME"] = ctx.homeDir;
    await runCli(["service", "install"], ctx);
    const unit = await Bun.file(
      join(ctx.homeDir, "hermes-remote.service"),
    ).text();
    expect(unit).toContain("ExecStart=/test/bin/hermes-remote serve");
    expect(unit).toContain(
      "Environment=PATH=/test/bin:/usr/local/bin:/usr/bin:/bin",
    );
    expect(unit).toContain(`Environment=HERMES_REMOTE_HOME=${ctx.homeDir}`);
    expect(unit).toContain("RestartSec=5");
    expect(unit).toContain(
      `StandardError=append:${join(ctx.homeDir, "logs", "service.log")}`,
    );
    expect((await runCli(["service", "status"], ctx)).output).toContain(
      "systemctl --user",
    );
    expect((await runCli(["service", "uninstall"], ctx)).output).toContain(
      "systemctl --user disable",
    );
    expect((await runCli(["service", "explode"], ctx)).exitCode).toBe(1);
    expect((await runCli(["service"], ctx)).exitCode).toBe(1);
  });

  test("install falls back to the runtime and entry script when not on PATH", async () => {
    const { ctx } = await makeCtx();
    ctx.platform = "linux";
    ctx.which = () => null;
    await runCli(["service", "install"], ctx);
    const unit = await Bun.file(
      join(ctx.homeDir, "hermes-remote.service"),
    ).text();
    expect(unit).toContain("ExecStart=/test/bun /test/cli.ts serve");
    expect(unit).toContain("Environment=PATH=/test:");
  });

  test("install fails when the unit file cannot be written", async () => {
    const { ctx } = await makeCtx();
    await mkdir(join(ctx.homeDir, "com.hermes-remote.server.plist"));
    const result = await runCli(["service", "install"], ctx);
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("failed to write");
  });
});
