import { describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCli, type CliContext, type ServeRequest } from "./run.ts";

async function makeCtx(): Promise<{
  ctx: CliContext;
  serveCalls: ServeRequest[];
}> {
  const homeDir = await mkdtemp(join(tmpdir(), "hermes-api-cli-"));
  const serveCalls: ServeRequest[] = [];
  const ctx: CliContext = {
    homeDir,
    platform: "darwin",
    now: () => new Date("2026-08-23T00:00:00Z"),
    env: {},
    serve: async (request) => {
      serveCalls.push(request);
      return { port: request.port === 0 ? 12345 : request.port };
    },
  };
  return { ctx, serveCalls };
}

async function createKey(ctx: CliContext, extra: string[] = []): Promise<string> {
  const result = await runCli(
    ["keys", "create", "--name", "ci", "--scope", "chat:invoke", ...extra],
    ctx,
  );
  expect(result.exitCode).toBe(0);
  return (result.output.match(/^([0-9a-f]+) /m) ??
    result.output.match(/created key ([0-9a-f]+)/))?.[1] as string;
}

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

describe("keys create", () => {
  test("creates a key and prints the token once", async () => {
    const { ctx } = await makeCtx();
    const result = await runCli(
      [
        "keys", "create", "--name", "ci",
        "--scope", "chat:invoke", "--scope", "sessions:read",
        "--user-grantable", "chat:invoke,sessions:read",
        "--expires", "90d",
      ],
      ctx,
    );
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("hk_");
    expect(result.output).toContain("cannot be shown again");
  });

  test("requires name and scope", async () => {
    const { ctx } = await makeCtx();
    expect(
      (await runCli(["keys", "create", "--scope", "chat:invoke"], ctx)).output,
    ).toContain("requires --name");
    expect(
      (await runCli(["keys", "create", "--name", "x"], ctx)).output,
    ).toContain("at least one --scope");
  });

  test("rejects unknown scopes", async () => {
    const { ctx } = await makeCtx();
    const result = await runCli(
      ["keys", "create", "--name", "x", "--scope", "nope:nope"],
      ctx,
    );
    expect(result.output).toContain("unknown scope: nope:nope");
  });

  test("dangerous scopes require --dangerous", async () => {
    const { ctx } = await makeCtx();
    const denied = await runCli(
      ["keys", "create", "--name", "x", "--scope", "config:write"],
      ctx,
    );
    expect(denied.exitCode).toBe(1);
    expect(denied.output).toContain("require --dangerous");
    const allowed = await runCli(
      ["keys", "create", "--name", "x", "--scope", "config:write", "--dangerous"],
      ctx,
    );
    expect(allowed.exitCode).toBe(0);
  });

  test("user-grantable accepts tier-1 only", async () => {
    const { ctx } = await makeCtx();
    const result = await runCli(
      [
        "keys", "create", "--name", "x",
        "--scope", "chat:invoke", "--user-grantable", "memory:write",
      ],
      ctx,
    );
    expect(result.output).toContain("tier-1 scopes only: memory:write");
  });

  test("rejects invalid --expires", async () => {
    const { ctx } = await makeCtx();
    const result = await runCli(
      ["keys", "create", "--name", "x", "--scope", "chat:invoke", "--expires", "soon"],
      ctx,
    );
    expect(result.output).toContain("invalid --expires value: soon");
  });
});

describe("keys management", () => {
  test("list is empty then shows keys", async () => {
    const { ctx } = await makeCtx();
    expect((await runCli(["keys", "list"], ctx)).output).toBe("no API keys");
    await createKey(ctx);
    const result = await runCli(["keys", "list"], ctx);
    expect(result.output).toContain("ci  active  scopes=chat:invoke");
  });

  test("show redacts the hash", async () => {
    const { ctx } = await makeCtx();
    const id = await createKey(ctx);
    const result = await runCli(["keys", "show", id], ctx);
    expect(result.output).toContain('"hash": "(redacted)"');
    expect((await runCli(["keys", "show", "ffffff"], ctx)).exitCode).toBe(1);
  });

  test("revoke", async () => {
    const { ctx } = await makeCtx();
    const id = await createKey(ctx);
    expect((await runCli(["keys", "revoke", id], ctx)).output).toBe(
      `revoked key ${id}`,
    );
    expect((await runCli(["keys", "revoke", "ffffff"], ctx)).exitCode).toBe(1);
    expect((await runCli(["keys", "revoke"], ctx)).output).toContain(
      "requires a key id",
    );
  });

  test("grant and ungrant scopes", async () => {
    const { ctx } = await makeCtx();
    const id = await createKey(ctx);
    const granted = await runCli(
      ["keys", "grant", id, "--scope", "sessions:read"],
      ctx,
    );
    expect(granted.output).toContain("scopes=chat:invoke,sessions:read");
    const ungranted = await runCli(
      ["keys", "ungrant", id, "--scope", "chat:invoke"],
      ctx,
    );
    expect(ungranted.output).toContain("scopes=sessions:read");
  });

  test("grant validations", async () => {
    const { ctx } = await makeCtx();
    const id = await createKey(ctx);
    expect((await runCli(["keys", "grant", id], ctx)).output).toContain(
      "at least one --scope",
    );
    expect(
      (await runCli(["keys", "grant", id, "--scope", "bad"], ctx)).output,
    ).toContain("unknown scope: bad");
    expect(
      (await runCli(["keys", "grant", id, "--scope", "mcp:manage"], ctx)).output,
    ).toContain("require --dangerous");
    expect(
      (
        await runCli(
          ["keys", "grant", id, "--scope", "mcp:manage", "--dangerous"],
          ctx,
        )
      ).exitCode,
    ).toBe(0);
    expect(
      (await runCli(["keys", "grant", "ffffff", "--scope", "chat:invoke"], ctx))
        .exitCode,
    ).toBe(1);
    expect(
      (
        await runCli(
          ["keys", "ungrant", "ffffff", "--scope", "chat:invoke"],
          ctx,
        )
      ).exitCode,
    ).toBe(1);
  });

  test("unknown keys action", async () => {
    const { ctx } = await makeCtx();
    expect((await runCli(["keys"], ctx)).output).toContain(
      "unknown keys action: (none)",
    );
    expect((await runCli(["keys", "explode"], ctx)).output).toContain(
      "unknown keys action: explode",
    );
  });
});

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
});

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

  test("rate limit flags override config", async () => {
    const { ctx, serveCalls } = await makeCtx();
    await runCli(
      ["serve", "--port", "0", "--rate-limit", "5", "--rate-window", "7"],
      ctx,
    );
    expect(serveCalls[0]?.rateLimit).toEqual({ limit: 5, windowSeconds: 7 });
  });
});

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

describe("keys rotate and cidr", () => {
  test("rotate prints a fresh token once", async () => {
    const { ctx } = await makeCtx();
    const id = await createKey(ctx, ["--cidr", "10.0.0.0/8,192.168.1.0/24"]);
    const shown = await runCli(["keys", "show", id], ctx);
    expect(shown.output).toContain("10.0.0.0/8");
    const rotated = await runCli(["keys", "rotate", id], ctx);
    expect(rotated.exitCode).toBe(0);
    expect(rotated.output).toContain("hk_");
    expect(rotated.output).toContain("previous secret no longer works");
    expect((await runCli(["keys", "rotate", "ffffff"], ctx)).exitCode).toBe(1);
  });
});

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
