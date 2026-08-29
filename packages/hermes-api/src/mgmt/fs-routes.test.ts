import { describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FakeCliBridge } from "../bridge/index.ts";
import { createApp, ProfileRegistry, type KeyVerifier } from "../index.ts";
import type { ApiKeyRecord } from "../auth/index.ts";

function keyStore(scopes: string[]): KeyVerifier {
  const record: ApiKeyRecord = {
    id: "abc123",
    name: "ops",
    hash: "h",
    scopes,
    userGrantable: [],
    createdAt: "2026-08-23T00:00:00.000Z",
    expiresAt: null,
    revoked: false,
  };
  return { verifyToken: async (t) => (t === "hk_good" ? record : null) };
}

async function makeApp(scopes: string[]) {
  const home = await mkdtemp(join(tmpdir(), "hermes-home-"));
  const fake = new FakeCliBridge();
  const app = createApp({
    store: keyStore(scopes),
    management: {
      cli: fake,
      profiles: new ProfileRegistry({ cli: fake, homeFor: (n) => `${home}-${n}` }),
      homeFor: () => home,
    },
  });
  return { app, home };
}

const req = (
  path: string,
  method = "GET",
  body?: unknown,
): Request =>
  new Request(`http://x${path}`, {
    method,
    headers: {
      authorization: "Bearer hk_good",
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

describe("memory routes", () => {
  test("read empty, write, enforce limits", async () => {
    const { app } = await makeApp(["memory:read", "memory:write"]);
    expect(await (await app.fetch(req("/v1/memory"))).json()).toEqual({
      content: "",
      chars: 0,
      limit: 2200,
    });
    expect(
      (await app.fetch(req("/v1/memory", "PUT", { content: "remember" }))).status,
    ).toBe(200);
    expect(await (await app.fetch(req("/v1/memory"))).json()).toEqual({
      content: "remember",
      chars: 8,
      limit: 2200,
    });
    expect(
      (
        await app.fetch(
          req("/v1/memory/user", "PUT", { content: "x".repeat(1376) }),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await app.fetch(req("/v1/memory/user", "PUT", { content: "a user" }))
      ).status,
    ).toBe(200);
    expect(
      ((await (await app.fetch(req("/v1/memory/user"))).json()) as {
        limit: number;
      }).limit,
    ).toBe(1375);
    expect((await app.fetch(req("/v1/memory", "PUT", {}))).status).toBe(400);
  });

  test("entries add, replace, remove", async () => {
    const { app } = await makeApp(["memory:read", "memory:write"]);
    const post = (body: unknown) => app.fetch(req("/v1/memory/entries", "POST", body));
    expect(
      await (await post({ action: "add", text: "likes bun" })).json(),
    ).toEqual({ content: "likes bun", chars: 9, limit: 2200 });
    await post({ action: "add", text: "ships fast" });
    const replaced = await post({
      action: "replace",
      from: "likes bun",
      text: "loves bun",
    });
    expect(((await replaced.json()) as { content: string }).content).toBe(
      "loves bun\nships fast",
    );
    expect(
      (await post({ action: "replace", from: "ghost", text: "x" })).status,
    ).toBe(404);
    const removed = await post({ action: "remove", text: "ships fast" });
    expect(((await removed.json()) as { content: string }).content).toBe(
      "loves bun",
    );
    expect((await post({ action: "remove", text: "ghost" })).status).toBe(404);
    expect((await post({ action: "explode", text: "x" })).status).toBe(400);
    expect(
      (await post({ action: "add", text: "y".repeat(2300) })).status,
    ).toBe(400);
  });

  test("memory requires an api key with the scope", async () => {
    const { app } = await makeApp(["status:read"]);
    expect((await app.fetch(req("/v1/memory"))).status).toBe(403);
  });
});

describe("soul routes", () => {
  test("read write round trip", async () => {
    const { app, home } = await makeApp(["soul:read", "soul:write"]);
    expect(await (await app.fetch(req("/v1/soul"))).json()).toEqual({
      content: "",
    });
    await app.fetch(req("/v1/soul", "PUT", { content: "# Indra" }));
    expect(await Bun.file(join(home, "SOUL.md")).text()).toBe("# Indra");
    expect(await (await app.fetch(req("/v1/soul"))).json()).toEqual({
      content: "# Indra",
    });
    expect((await app.fetch(req("/v1/soul", "PUT", {}))).status).toBe(400);
  });
});

describe("skill file routes", () => {
  test("crud over skill markdown and reference files", async () => {
    const { app, home } = await makeApp(["skills:read", "skills:write"]);
    expect((await app.fetch(req("/v1/skills/ghost"))).status).toBe(404);
    expect(
      (
        await app.fetch(
          req("/v1/skills", "POST", { name: "notes", content: "# notes" }),
        )
      ).status,
    ).toBe(201);
    expect(
      (
        await app.fetch(
          req("/v1/skills", "POST", { name: "notes", content: "dup" }),
        )
      ).status,
    ).toBe(409);
    expect(await (await app.fetch(req("/v1/skills/notes"))).json()).toEqual({
      name: "notes",
      content: "# notes",
    });
    await app.fetch(req("/v1/skills/notes", "PATCH", { content: "# v2" }));
    expect(await Bun.file(join(home, "skills/notes/SKILL.md")).text()).toBe(
      "# v2",
    );
    await app.fetch(
      req("/v1/skills/notes/files/references/tips.md", "PUT", {
        content: "tip",
      }),
    );
    expect(
      await (
        await app.fetch(req("/v1/skills/notes/files/references/tips.md"))
      ).json(),
    ).toEqual({ path: "references/tips.md", content: "tip" });
    expect(
      (await app.fetch(req("/v1/skills/notes/files/missing.md"))).status,
    ).toBe(404);
    expect(
      await (await app.fetch(req("/v1/skills/notes", "DELETE"))).json(),
    ).toEqual({ deleted: true });
    expect((await app.fetch(req("/v1/skills/notes"))).status).toBe(404);
    expect((await app.fetch(req("/v1/skills", "POST", {}))).status).toBe(400);
    expect(
      (await app.fetch(req("/v1/skills/notes", "PATCH", {}))).status,
    ).toBe(400);
    expect(
      (
        await app.fetch(req("/v1/skills/notes/files/x.md", "PUT", {}))
      ).status,
    ).toBe(400);
  });

  test("denied paths are rejected", async () => {
    const { app } = await makeApp(["skills:read"]);
    expect(
      (await app.fetch(req("/v1/skills/notes/files/..%2F..%2F.env"))).status,
    ).toBe(400);
  });
});

describe("bundles, cron output, subagents", () => {
  test("bundles crud on yaml files", async () => {
    const { app, home } = await makeApp(["bundles:read", "bundles:write"]);
    expect(await (await app.fetch(req("/v1/bundles"))).json()).toEqual({
      bundles: [],
    });
    await app.fetch(
      req("/v1/bundles/research", "PUT", { content: "skills: [a, b]" }),
    );
    expect(
      await Bun.file(join(home, "skill-bundles/research.yaml")).text(),
    ).toBe("skills: [a, b]");
    expect(await (await app.fetch(req("/v1/bundles"))).json()).toEqual({
      bundles: [{ name: "research", content: "skills: [a, b]" }],
    });
    expect(
      await (await app.fetch(req("/v1/bundles/research"))).json(),
    ).toEqual({ name: "research", content: "skills: [a, b]" });
    expect((await app.fetch(req("/v1/bundles/ghost"))).status).toBe(404);
    expect(
      await (await app.fetch(req("/v1/bundles/research", "DELETE"))).json(),
    ).toEqual({ deleted: true });
    expect((await app.fetch(req("/v1/bundles/ghost", "DELETE"))).status).toBe(404);
    expect(
      (await app.fetch(req("/v1/bundles/research", "PUT", {}))).status,
    ).toBe(400);
  });

  test("cron outputs and subagent transcripts list from the home", async () => {
    const { app, home } = await makeApp(["crons:read", "subagents:read"]);
    await mkdir(join(home, "cron/output/579a"), { recursive: true });
    await writeFile(join(home, "cron/output/579a/run1.md"), "cron says hi");
    expect(
      await (await app.fetch(req("/v1/jobs/579a/output"))).json(),
    ).toEqual({ outputs: ["run1.md"] });
    expect(
      await (await app.fetch(req("/v1/jobs/579a/output/run1.md"))).json(),
    ).toEqual({ name: "run1.md", content: "cron says hi" });
    expect(
      (await app.fetch(req("/v1/jobs/579a/output/ghost.md"))).status,
    ).toBe(404);
    await mkdir(join(home, "cache/delegation/live"), { recursive: true });
    await writeFile(join(home, "cache/delegation/live/child-1.jsonl"), "{}");
    expect(await (await app.fetch(req("/v1/subagents"))).json()).toEqual({
      transcripts: ["child-1.jsonl"],
    });
  });
});
