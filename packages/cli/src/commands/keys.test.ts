import { describe, expect, test } from "bun:test";
import { runCli } from "../run.ts";
import { createKey, makeCtx } from "./harness.test.ts";

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
