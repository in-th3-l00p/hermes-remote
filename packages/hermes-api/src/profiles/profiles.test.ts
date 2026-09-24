import { existsSync, readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";
import { FakeCliBridge } from "../bridge/index.ts";
import { createApp, type KeyVerifier } from "../index.ts";
import type { ApiKeyRecord } from "../auth/index.ts";
import { ProfileRegistry, profileArgs } from "./registry.ts";

const PROFILE_TABLE = ` Profile          Model                        Gateway      Alias        Distribution
 ───────────────    ───────────────────────────    ───────────    ───────────    ────────────────────
  default         anthropic/claude-fable-5     stopped      —            —
  creative        deepseek/deepseek-v4-flash   running      creative     —
 ◆indra           deepseek/deepseek-v4-flash   running      indra        —
`;

function registryWith(fake: FakeCliBridge, cacheMs = 15_000): ProfileRegistry {
  return new ProfileRegistry({
    cli: fake,
    homeFor: (name) => `/homes/${name}`,
    cacheMs,
  });
}

function keyStore(
  scopes: string[],
  profile?: string,
): KeyVerifier {
  const record: ApiKeyRecord = {
    id: "abc123",
    name: "ops",
    hash: "h",
    scopes,
    userGrantable: [],
    createdAt: "2026-08-23T00:00:00.000Z",
    expiresAt: null,
    revoked: false,
    ...(profile === undefined ? {} : { profile }),
  };
  return { verifyToken: async (t) => (t === "hk_good" ? record : null) };
}

function managedApp(options: {
  fake: FakeCliBridge;
  store?: KeyVerifier;
  anonymous?: boolean;
}) {
  const registry = registryWith(options.fake);
  return createApp({
    anonymous: options.anonymous ?? options.store === undefined,
    ...(options.store === undefined ? {} : { store: options.store }),
    management: {
      cli: options.fake,
      profiles: registry,
      homeFor: (name) => (name === null ? "/homes/default" : `/homes/${name}`),
    },
  });
}

const get = (path: string, token?: string, profile?: string) =>
  new Request(`http://x${path}`, {
    headers: {
      ...(token === undefined ? {} : { authorization: `Bearer ${token}` }),
      ...(profile === undefined ? {} : { "x-hermes-profile": profile }),
    },
  });

describe("ProfileRegistry", () => {
  test("parses the profile table and caches it", async () => {
    const fake = new FakeCliBridge({ "profile list": { stdout: PROFILE_TABLE } });
    const registry = registryWith(fake);
    const profiles = await registry.list();
    expect(profiles).toEqual([
      { name: "default", isDefault: false, model: "anthropic/claude-fable-5", gateway: "stopped", alias: null, distribution: null },
      { name: "creative", isDefault: false, model: "deepseek/deepseek-v4-flash", gateway: "running", alias: "creative", distribution: null },
      { name: "indra", isDefault: true, model: "deepseek/deepseek-v4-flash", gateway: "running", alias: "indra", distribution: null },
    ]);
    expect(await registry.exists("indra")).toBe(true);
    expect(await registry.exists("nope")).toBe(false);
    expect(fake.calls).toHaveLength(1);
    expect(registry.homeFor("indra")).toBe("/homes/indra");
  });

  test("cache expires and cli failures yield empty lists", async () => {
    let at = 0;
    const fake = new FakeCliBridge({ "profile list": { stdout: PROFILE_TABLE } });
    const registry = new ProfileRegistry({
      cli: fake,
      homeFor: (name) => name,
      cacheMs: 100,
      now: () => at,
    });
    await registry.list();
    at = 50;
    await registry.list();
    expect(fake.calls).toHaveLength(1);
    at = 200;
    await registry.list();
    expect(fake.calls).toHaveLength(2);
    const failing = new ProfileRegistry({
      cli: new FakeCliBridge(),
      homeFor: (name) => name,
    });
    expect(await failing.list()).toEqual([]);
  });

  test("profileArgs prepends the profile flag", () => {
    expect(profileArgs(null)).toEqual([]);
    expect(profileArgs(undefined)).toEqual([]);
    expect(profileArgs("indra")).toEqual(["-p", "indra"]);
  });
});

describe("profile middleware", () => {
  test("unknown profiles 404, valid ones flow to the cli", async () => {
    const fake = new FakeCliBridge({
      "profile list": { stdout: PROFILE_TABLE },
      "-p indra profile show indra": { stdout: "shown" },
    });
    const app = managedApp({ fake, store: keyStore(["status:read"]) });
    expect(
      (await app.fetch(get("/v1/profiles/indra", "hk_good", "ghost"))).status,
    ).toBe(404);
    const res = await app.fetch(get("/v1/profiles/indra", "hk_good", "indra"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, raw: "shown" });
  });

  test("profile-restricted keys are pinned to their profile", async () => {
    const fake = new FakeCliBridge({
      "profile list": { stdout: PROFILE_TABLE },
      "-p creative profile show creative": { stdout: "c" },
    });
    const app = managedApp({
      fake,
      store: keyStore(["status:read"], "creative"),
    });
    expect(
      (await app.fetch(get("/v1/profiles/creative", "hk_good", "indra"))).status,
    ).toBe(403);
    const implicit = await app.fetch(get("/v1/profiles/creative", "hk_good"));
    expect(implicit.status).toBe(200);
    expect(fake.calls.at(-1)).toEqual([
      "-p",
      "creative",
      "profile",
      "show",
      "creative",
    ]);
  });
});

describe("profile routes", () => {
  test("list uses the registry, show uses the cli", async () => {
    const fake = new FakeCliBridge({
      "profile list": { stdout: PROFILE_TABLE },
      "profile show default": { stdout: "details" },
    });
    const app = managedApp({ fake, store: keyStore(["status:read"]) });
    const list = await app.fetch(get("/v1/profiles", "hk_good"));
    expect(list.status).toBe(200);
    const body = (await list.json()) as { profiles: { name: string }[] };
    expect(body.profiles.map((p) => p.name)).toEqual([
      "default",
      "creative",
      "indra",
    ]);
    expect(
      await (await app.fetch(get("/v1/profiles/default", "hk_good"))).json(),
    ).toEqual({ ok: true, raw: "details" });
  });

  test("user and anonymous principals cannot list profiles or select one", async () => {
    const fake = new FakeCliBridge({ "profile list": { stdout: PROFILE_TABLE } });
    const app = managedApp({ fake });
    expect((await app.fetch(get("/v1/profiles"))).status).toBe(403);
    const pinned = await app.fetch(get("/v1/sessions", undefined, "indra"));
    expect(pinned.status).toBe(403);
    expect(
      ((await pinned.json()) as { error: { code: string } }).error.code,
    ).toBe("profile_forbidden");
  });

  test("mutations require an api key with profiles:manage", async () => {
    const fake = new FakeCliBridge({
      "profile list": { stdout: PROFILE_TABLE },
      "profile create fresh": { stdout: "created" },
      "profile delete creative": { stdout: "deleted" },
      "profile rename creative art": { stdout: "renamed" },
      "profile describe creative studio bot": { stdout: "described" },
      "profile export creative": { stdout: "ARCHIVEBYTES" },
      "profile install fresh https://x.git": { stdout: "installed" },
      "profile update creative": { stdout: "updated" },
    });
    const anonymousApp = managedApp({ fake });
    expect(
      (
        await anonymousApp.fetch(
          new Request("http://x/v1/profiles", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ name: "fresh" }),
          }),
        )
      ).status,
    ).toBe(403);

    const app = managedApp({ fake, store: keyStore(["profiles:manage"]) });
    const post = (path: string, body?: unknown, method = "POST") =>
      app.fetch(
        new Request(`http://x${path}`, {
          method,
          headers: {
            authorization: "Bearer hk_good",
            "content-type": "application/json",
          },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        }),
      );
    expect((await post("/v1/profiles", { name: "fresh" })).status).toBe(200);
    expect((await post("/v1/profiles/creative", undefined, "DELETE")).status).toBe(200);
    expect(
      (await post("/v1/profiles/creative", { rename: "art" }, "PATCH")).status,
    ).toBe(200);
    expect(
      (
        await post(
          "/v1/profiles/creative",
          { description: "studio bot" },
          "PATCH",
        )
      ).status,
    ).toBe(200);
    const exported = await post("/v1/profiles/creative/export");
    expect(exported.headers.get("content-type")).toBe(
      "application/octet-stream",
    );
    expect(await exported.text()).toBe("ARCHIVEBYTES");
    expect(
      (await post("/v1/profiles/fresh/install", { source: "https://x.git" })).status,
    ).toBe(200);
    expect((await post("/v1/profiles/creative/update")).status).toBe(200);
    expect((await post("/v1/profiles", { name: "-bad" })).status).toBe(400);
    expect((await post("/v1/profiles", {})).status).toBe(400);
  });

  test("reads require the status:read scope", async () => {
    const fake = new FakeCliBridge({ "profile list": { stdout: PROFILE_TABLE } });
    const app = managedApp({ fake, store: keyStore(["profiles:manage"]) });
    expect((await app.fetch(get("/v1/profiles", "hk_good"))).status).toBe(403);
  });

  test("mutations without an api key are denied per route", async () => {
    const fake = new FakeCliBridge({ "profile list": { stdout: PROFILE_TABLE } });
    const app = managedApp({ fake });
    const anon = (path: string, method = "POST") =>
      app.fetch(new Request(`http://x${path}`, { method }));
    expect((await anon("/v1/profiles/creative", "PATCH")).status).toBe(403);
    expect((await anon("/v1/profiles/creative/export")).status).toBe(403);
    expect((await anon("/v1/profiles/creative/install")).status).toBe(403);
    expect((await anon("/v1/profiles/creative/import")).status).toBe(403);
  });

  test("patch without rename or description is rejected", async () => {
    const fake = new FakeCliBridge({ "profile list": { stdout: PROFILE_TABLE } });
    const app = managedApp({ fake, store: keyStore(["profiles:manage"]) });
    const patch = (body: string) =>
      app.fetch(
        new Request("http://x/v1/profiles/creative", {
          method: "PATCH",
          headers: {
            authorization: "Bearer hk_good",
            "content-type": "application/json",
          },
          body,
        }),
      );
    expect((await patch("{}")).status).toBe(400);
    expect((await patch("not json")).status).toBe(400);
  });

  test("export failures map to the cli error response", async () => {
    const fake = new FakeCliBridge({
      "profile list": { stdout: PROFILE_TABLE },
      "profile export creative": { exitCode: 1, stderr: "no archive" },
    });
    const app = managedApp({ fake, store: keyStore(["profiles:manage"]) });
    const res = await app.fetch(
      new Request("http://x/v1/profiles/creative/export", {
        method: "POST",
        headers: { authorization: "Bearer hk_good" },
      }),
    );
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({
      error: { code: "cli_error", message: "no archive", exitCode: 1 },
    });
  });

  test("install and import validate their bodies and run the cli", async () => {
    const fake = new FakeCliBridge({
      "profile list": { stdout: PROFILE_TABLE },
      "profile import /backups/creative.tar": { stdout: "imported" },
    });
    const app = managedApp({ fake, store: keyStore(["profiles:manage"]) });
    const post = (path: string, body?: unknown) =>
      app.fetch(
        new Request(`http://x${path}`, {
          method: "POST",
          headers: {
            authorization: "Bearer hk_good",
            "content-type": "application/json",
          },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        }),
      );
    const raw = (path: string, body: string) =>
      app.fetch(
        new Request(`http://x${path}`, {
          method: "POST",
          headers: {
            authorization: "Bearer hk_good",
            "content-type": "application/json",
          },
          body,
        }),
      );
    expect((await raw("/v1/profiles", "not json")).status).toBe(400);
    expect(
      (await raw("/v1/profiles/creative/install", "not json")).status,
    ).toBe(400);
    expect(
      (await raw("/v1/profiles/creative/import", "not json")).status,
    ).toBe(400);
    expect((await post("/v1/profiles/creative/install", {})).status).toBe(400);
    expect(
      (await post("/v1/profiles/creative/install", { source: "-bad" })).status,
    ).toBe(400);
    expect(
      (await post("/v1/profiles/creative/import", { path: "/etc/passwd" })).status,
    ).toBe(400);
    const upload = (path: string, bytes: Uint8Array) =>
      app.fetch(
        new Request(`http://x${path}`, {
          method: "POST",
          headers: {
            authorization: "Bearer hk_good",
            "content-type": "application/octet-stream",
          },
          body: bytes,
        }),
      );
    expect(
      (await upload("/v1/profiles/creative/import", new Uint8Array())).status,
    ).toBe(400);
    const seen: { bytes: Uint8Array | null } = { bytes: null };
    fake.on("profile import", () => {
      seen.bytes = new Uint8Array(readFileSync(fake.calls.at(-1)?.[2] ?? ""));
      return { stdout: "imported" };
    });
    const archive = new Uint8Array([0x1f, 0x8b, 0x08, 0xff, 0x00]);
    const imported = await upload("/v1/profiles/creative/import", archive);
    expect(imported.status).toBe(200);
    expect(await imported.json()).toEqual({ ok: true, raw: "imported" });
    expect(seen.bytes).toEqual(archive);
    const tempPath = fake.calls.at(-1)?.[2] ?? "";
    expect(fake.calls.at(-1)?.slice(0, 2)).toEqual(["profile", "import"]);
    expect(existsSync(tempPath)).toBe(false);
  });

  test("profile names can never become CLI flags", async () => {
    const fake = new FakeCliBridge({ "profile list": { stdout: PROFILE_TABLE } });
    const app = managedApp({
      fake,
      store: keyStore(["status:read", "profiles:manage"]),
    });
    for (const name of ["--help", "-p", "--force"]) {
      const res = await app.fetch(get(`/v1/profiles/${name}`, "hk_good"));
      expect(res.status).toBe(404);
    }
    expect(fake.calls.filter((argv) => argv.includes("show"))).toEqual([]);
  });

  test("cli failures map to 502", async () => {
    const fake = new FakeCliBridge({
      "profile list": { stdout: PROFILE_TABLE },
      "profile show default": { exitCode: 1, stderr: "broken" },
    });
    const app = managedApp({ fake, store: keyStore(["status:read"]) });
    const res = await app.fetch(get("/v1/profiles/default", "hk_good"));
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({
      error: { code: "cli_error", message: "broken", exitCode: 1 },
    });
  });
});
