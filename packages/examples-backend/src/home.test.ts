import { describe, expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SANDBOX_PROFILES, seedSandboxHome } from "./home.ts";
import { sandboxCli } from "./cli.ts";
import { ProfileRegistry } from "@in-th3-l00p/hermes-remote";

describe("seedSandboxHome", () => {
  test("seeds every profile with distinct documents, idempotently", async () => {
    for (const profile of SANDBOX_PROFILES) {
      const root = await mkdtemp(join(tmpdir(), `sandbox-${profile}-`));
      seedSandboxHome(root, profile);
      seedSandboxHome(root, profile);
      const soul = await Bun.file(join(root, "SOUL.md")).text();
      const memory = await Bun.file(join(root, "memories/MEMORY.md")).text();
      expect(soul.length).toBeGreaterThan(10);
      expect(memory.length).toBeGreaterThan(10);
      expect(
        await Bun.file(join(root, "skills/web-research/SKILL.md")).text(),
      ).toContain("web-research");
      expect(
        await Bun.file(join(root, "skill-bundles/research.yaml")).text(),
      ).toContain("research");
      expect(
        await Bun.file(
          join(root, "cron/output/morning-briefing/2026-08-29.md"),
        ).text(),
      ).toContain("briefing");
    }
    const atlas = seedSandboxHome(
      await mkdtemp(join(tmpdir(), "sandbox-a-")),
      "atlas",
    );
    const nova = seedSandboxHome(
      await mkdtemp(join(tmpdir(), "sandbox-n-")),
      "nova",
    );
    expect(await Bun.file(join(atlas, "SOUL.md")).text()).not.toBe(
      await Bun.file(join(nova, "SOUL.md")).text(),
    );
  });
});

describe("sandboxCli", () => {
  test("profile table parses through the registry", async () => {
    const registry = new ProfileRegistry({
      cli: sandboxCli(),
      homeFor: (n) => `/sandbox/${n}`,
    });
    const profiles = await registry.list();
    expect(profiles.map((p) => p.name)).toEqual(["default", "atlas", "nova"]);
    expect(profiles[0]?.isDefault).toBe(true);
  });

  test("answers core commands, with and without profile flags", async () => {
    const cli = sandboxCli();
    expect((await cli.run(["status"])).stdout).toContain("Sandbox");
    expect((await cli.run(["-p", "atlas", "status"])).stdout).toContain("Sandbox");
    expect((await cli.run(["config", "show"])).stdout).toContain("gpt-oss");
    expect((await cli.run(["config", "get", "model"])).stdout).toContain("groq");
    expect((await cli.run(["config", "set", "a.b", "c"])).ok).toBe(true);
    expect((await cli.run(["kanban", "list"])).stdout).toContain("#1");
    expect((await cli.run(["insights", "--days", "7"])).stdout).toContain("turns");
    const unknown = await cli.run(["uninstall"]);
    expect(unknown.ok).toBe(false);
  });
});
