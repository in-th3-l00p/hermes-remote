import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BridgeDenied, FsBridge } from "./fs.ts";

async function makeBridge(maxBytes?: number): Promise<FsBridge> {
  const root = await mkdtemp(join(tmpdir(), "hermes-fs-bridge-"));
  return new FsBridge({ root, ...(maxBytes === undefined ? {} : { maxBytes }) });
}

describe("FsBridge", () => {
  test("read write remove list round trip with nested dirs", async () => {
    const bridge = await makeBridge();
    expect(await bridge.read("memories/MEMORY.md")).toBeNull();
    expect(await bridge.list("memories")).toEqual([]);
    await bridge.write("memories/MEMORY.md", "hello");
    expect(await bridge.read("memories/MEMORY.md")).toBe("hello");
    await bridge.write("memories/USER.md", "user");
    expect((await bridge.list("memories")).sort()).toEqual([
      "MEMORY.md",
      "USER.md",
    ]);
    expect(await bridge.remove("memories/USER.md")).toBe(true);
    expect(await bridge.remove("memories/USER.md")).toBe(false);
  });

  test("enforces size caps on read and write", async () => {
    const bridge = await makeBridge(10);
    expect(bridge.write("big.md", "x".repeat(11))).rejects.toBeInstanceOf(
      BridgeDenied,
    );
    await bridge.write("ok.md", "x".repeat(10));
    const sneaky = await makeBridge();
    await sneaky.write("grown.md", "y".repeat(50));
    const capped = new FsBridge({ root: sneaky.resolve(""), maxBytes: 10 });
    expect(capped.read("grown.md")).rejects.toBeInstanceOf(BridgeDenied);
  });

  test("rejects traversal outside the root", async () => {
    const bridge = await makeBridge();
    for (const path of ["../evil", "a/../../evil", "/etc/passwd"]) {
      expect(() => bridge.resolve(path)).toThrow(BridgeDenied);
    }
  });

  test("denylists credential files", async () => {
    const bridge = await makeBridge();
    for (const path of [
      ".env",
      "profiles/x/.env",
      "auth.json",
      "keys.json",
      "certs/server.pem",
      "certs/server.key",
      "credentials/token.txt",
    ]) {
      expect(() => bridge.resolve(path)).toThrow(BridgeDenied);
    }
    expect(bridge.resolve("memories/MEMORY.md")).toContain("MEMORY.md");
  });

  test("rejects NUL bytes", async () => {
    const bridge = await makeBridge();
    expect(() => bridge.resolve("notes.md\0.txt")).toThrow(BridgeDenied);
  });

  test("symlinks cannot escape the root or reach credentials", async () => {
    const outside = await mkdtemp(join(tmpdir(), "hermes-fs-outside-"));
    await writeFile(join(outside, "secret.txt"), "secret");
    const bridge = await makeBridge();
    const root = bridge.resolve("");
    await writeFile(join(root, ".env"), "KEY=1");
    await mkdir(join(root, "skills", "demo"), { recursive: true });
    await symlink(join(outside, "secret.txt"), join(root, "skills", "demo", "out.txt"));
    await symlink(outside, join(root, "skills", "demo", "outdir"));
    await symlink(join(root, ".env"), join(root, "skills", "demo", "env.txt"));
    expect(bridge.read("skills/demo/out.txt")).rejects.toBeInstanceOf(BridgeDenied);
    expect(bridge.write("skills/demo/outdir/new.txt", "x")).rejects.toBeInstanceOf(
      BridgeDenied,
    );
    expect(bridge.read("skills/demo/env.txt")).rejects.toBeInstanceOf(BridgeDenied);
  });

  test("scoped bridges are confined to their subdirectory", async () => {
    const bridge = await makeBridge();
    const root = bridge.resolve("");
    await mkdir(join(root, "skills", "demo"), { recursive: true });
    await mkdir(join(root, "skills", "other"), { recursive: true });
    await writeFile(join(root, "config.yaml"), "model: x");
    await symlink(join(root, "config.yaml"), join(root, "skills", "demo", "cfg"));
    const skill = bridge.scoped("skills/demo");
    await skill.write("references/a.md", "a");
    expect(await bridge.read("skills/demo/references/a.md")).toBe("a");
    for (const path of ["../../config.yaml", "../other/SKILL.md", "cfg"]) {
      expect(() => skill.resolve(path)).toThrow(BridgeDenied);
    }
    expect(() => bridge.scoped("../elsewhere")).toThrow(BridgeDenied);
  });
});
