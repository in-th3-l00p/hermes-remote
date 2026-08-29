import { describe, expect, test } from "bun:test";
import { HermesCliBridge, type SpawnLike } from "./cli.ts";
import { FakeCliBridge } from "./fake.ts";

describe("HermesCliBridge", () => {
  test("runs the binary with the given argv", async () => {
    const seen: { argv: string[]; timeoutMs: number }[] = [];
    const spawn: SpawnLike = async (argv, timeoutMs) => {
      seen.push({ argv, timeoutMs });
      return { exitCode: 0, stdout: "out", stderr: "" };
    };
    const bridge = new HermesCliBridge({ binary: "/bin/hermes", spawn });
    const result = await bridge.run(["status"]);
    expect(result).toEqual({ ok: true, exitCode: 0, stdout: "out", stderr: "" });
    expect(seen).toEqual([
      { argv: ["/bin/hermes", "status"], timeoutMs: 30_000 },
    ]);
  });

  test("propagates failures and custom timeouts", async () => {
    const spawn: SpawnLike = async () => ({
      exitCode: 2,
      stdout: "",
      stderr: "boom",
    });
    const bridge = new HermesCliBridge({
      binary: "hermes",
      spawn,
      timeoutMs: 5000,
    });
    const seen: number[] = [];
    const probing = new HermesCliBridge({
      binary: "hermes",
      spawn: async (_argv, timeoutMs) => {
        seen.push(timeoutMs);
        return { exitCode: 2, stdout: "", stderr: "boom" };
      },
      timeoutMs: 5000,
    });
    await probing.run(["doctor"]);
    await probing.run(["doctor"], { timeoutMs: 111 });
    expect(seen).toEqual([5000, 111]);
    const result = await bridge.run(["doctor"]);
    expect(result.ok).toBe(false);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toBe("boom");
  });

  test("caps concurrency", async () => {
    let active = 0;
    let peak = 0;
    const gates: (() => void)[] = [];
    const spawn: SpawnLike = async () => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise<void>((resolve) => gates.push(resolve));
      active -= 1;
      return { exitCode: 0, stdout: "", stderr: "" };
    };
    const bridge = new HermesCliBridge({
      binary: "hermes",
      spawn,
      maxConcurrent: 2,
    });
    const runs = [bridge.run(["a"]), bridge.run(["b"]), bridge.run(["c"])];
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(peak).toBe(2);
    expect(gates).toHaveLength(2);
    gates.shift()?.();
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(gates).toHaveLength(2);
    while (gates.length > 0) {
      gates.shift()?.();
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    await Promise.all(runs);
    expect(peak).toBe(2);
  });

  test("the default spawn executes a real process and times out hung ones", async () => {
    const bridge = new HermesCliBridge({ binary: "echo" });
    const result = await bridge.run(["hello", "world"]);
    expect(result.ok).toBe(true);
    expect(result.stdout.trim()).toBe("hello world");
    const hung = new HermesCliBridge({ binary: "sleep", timeoutMs: 200 });
    const timedOut = await hung.run(["30"]);
    expect(timedOut.ok).toBe(false);
    expect(timedOut.stderr).toContain("timed out");
  });
});

describe("FakeCliBridge", () => {
  test("matches the longest argv prefix and records calls", async () => {
    const fake = new FakeCliBridge({
      "profile list": { stdout: "table" },
      profile: { stdout: "generic" },
    });
    fake.on("config get key", { stdout: "value", exitCode: 0 });
    expect((await fake.run(["profile", "list"])).stdout).toBe("table");
    expect((await fake.run(["profile", "show", "x"])).stdout).toBe("generic");
    expect((await fake.run(["config", "get", "key"])).stdout).toBe("value");
    expect(fake.calls).toEqual([
      ["profile", "list"],
      ["profile", "show", "x"],
      ["config", "get", "key"],
    ]);
  });

  test("unmatched argv fails with exit 127 and supports function responses", async () => {
    let n = 0;
    const fake = new FakeCliBridge({
      tick: () => ({ stdout: String((n += 1)) }),
    });
    const missing = await fake.run(["nope"]);
    expect(missing.ok).toBe(false);
    expect(missing.exitCode).toBe(127);
    expect((await fake.run(["tick"])).stdout).toBe("1");
    expect((await fake.run(["tick"])).stdout).toBe("2");
  });
});
