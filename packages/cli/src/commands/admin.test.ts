import { describe, expect, test } from "bun:test";
import { chmod, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ChatStore, UserStore } from "@intheloop-studio/hermes-remote";
import { runCli } from "../run.ts";
import { loadSigningSecret } from "../signing.ts";
import { createKey, makeCtx } from "./harness.test.ts";

describe("signing key", () => {
  test("created once, owner-only, then reused; a short file is replaced", async () => {
    const { ctx } = await makeCtx();
    const first = await loadSigningSecret(ctx.homeDir);
    expect(first.length).toBeGreaterThanOrEqual(32);
    expect(await loadSigningSecret(ctx.homeDir)).toBe(first);
    expect((await stat(join(ctx.homeDir, "signing.key"))).mode & 0o777).toBe(0o600);
    await writeFile(join(ctx.homeDir, "signing.key"), "short");
    expect(await loadSigningSecret(ctx.homeDir)).not.toBe("short");
  });

  test("serve passes the signing secret to the server", async () => {
    const { ctx, serveCalls } = await makeCtx();
    await runCli(["serve", "--port", "0"], ctx);
    expect(serveCalls[0]?.signingSecret).toBe(await loadSigningSecret(ctx.homeDir));
  });
});

describe("users command", () => {
  test("list, show, disable, enable, delete with cascade", async () => {
    const { ctx } = await makeCtx();
    expect((await runCli(["users", "list"], ctx)).output).toBe("no users");
    const store = new UserStore(join(ctx.homeDir, "users.db"));
    const user = store.upsert({ provider: "auth0", subject: "a" });
    const chat = new ChatStore(join(ctx.homeDir, "chat.db"));
    chat.createSession({ userId: user.id });
    expect((await runCli(["users", "list"], ctx)).output).toContain(`${user.id}  active  anonymous  auth0:a`);
    expect((await runCli(["users", "show", user.id], ctx)).output).toContain('"provider": "auth0"');
    expect((await runCli(["users", "disable", user.id], ctx)).output).toContain("disabled");
    expect((await runCli(["users", "enable", user.id], ctx)).output).toContain("active");
    expect((await runCli(["users", "delete", user.id, "--cascade"], ctx)).output).toBe(
      `deleted user ${user.id} and 1 session(s)`,
    );
    const other = store.upsert({ provider: "auth0", subject: "b" });
    expect((await runCli(["users", "delete", other.id], ctx)).output).toBe(`deleted user ${other.id}`);
    expect((await runCli(["users", "show"], ctx)).exitCode).toBe(1);
    expect((await runCli(["users", "show", "usr_nope"], ctx)).exitCode).toBe(1);
    expect((await runCli(["users", "frobnicate"], ctx)).exitCode).toBe(1);
  });
});

describe("audit command", () => {
  test("tails the audit log", async () => {
    const { ctx } = await makeCtx();
    expect((await runCli(["audit", "tail"], ctx)).output).toBe("no audit entries yet");
    await createKey(ctx);
    await createKey(ctx);
    const tail = await runCli(["audit", "tail", "--lines", "1"], ctx);
    expect(tail.output.split("\n")).toHaveLength(1);
    expect(tail.output).toContain('"path":"keys create"');
    expect((await runCli(["audit", "tail", "--lines", "0"], ctx)).exitCode).toBe(1);
    expect((await runCli(["audit"], ctx)).exitCode).toBe(1);
  });
});

describe("doctor", () => {
  test("reports a fresh home with advice but no errors", async () => {
    const { ctx } = await makeCtx();
    const report = await runCli(["doctor"], { ...ctx, which: () => null });
    expect(report.exitCode).toBe(0);
    expect(report.output).toContain("! 0 usable API key(s)");
    expect(report.output).toContain('! hermes binary "hermes" not found');
    expect(report.output).toContain("! no upstream configured");
    expect(report.output).toContain("no config.json");
  });

  test("flags risky keys and settings, and an unreachable upstream as an error", async () => {
    const { ctx } = await makeCtx();
    await runCli(["keys", "create", "--name", "ops", "--scope", "config:write", "--dangerous"], ctx);
    await createKey(ctx, ["--expires", "30m"]);
    const later = { ...ctx, now: () => new Date(ctx.now().getTime() + 3_600_000) };
    await Bun.write(
      join(ctx.homeDir, "config.json"),
      JSON.stringify({ host: "0.0.0.0", anonymous: true, upstreamUrl: "http://127.0.0.1:1/", hermesBinary: "/bin/sh" }),
    );
    await loadSigningSecret(ctx.homeDir);
    const failing = await runCli(["doctor"], {
      ...later,
      fetch: (async () => {
        throw new Error("refused");
      }) as unknown as typeof fetch,
    });
    expect(failing.exitCode).toBe(1);
    for (const text of [
      "✓ config.json is valid",
      "1 expired key(s) not revoked",
      "dangerous scopes and no expiry",
      "✓ hermes binary: /bin/sh",
      "listening on 0.0.0.0",
      "anonymous mode is on",
      "✓ user token signing key present",
      "✗ upstream http://127.0.0.1:1/ is unreachable",
    ]) {
      expect(failing.output).toContain(text);
    }
    const healthy = await runCli(["doctor"], {
      ...later,
      fetch: (async () => new Response("ok")) as unknown as typeof fetch,
    });
    expect(healthy.output).toContain("answered 200");
    await Bun.write(join(ctx.homeDir, "config.json"), JSON.stringify({ hermesBinary: "/missing/hermes" }));
    expect((await runCli(["doctor"], ctx)).output).toContain('"/missing/hermes" not found');
    await writeFile(join(ctx.homeDir, "config.json"), "{broken");
    await chmod(join(ctx.homeDir, "config.json"), 0o600);
    expect((await runCli(["doctor"], ctx)).exitCode).toBe(1);
  });
});
