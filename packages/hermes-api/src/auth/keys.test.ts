import { describe, expect, test } from "bun:test";
import { mkdtemp, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { KeyStore } from "./keys.ts";

async function tempStore(): Promise<KeyStore> {
  const dir = await mkdtemp(join(tmpdir(), "hermes-api-test-"));
  return new KeyStore(join(dir, "keys.json"));
}

describe("KeyStore", () => {
  test("starts empty", async () => {
    const store = await tempStore();
    expect(await store.list()).toEqual([]);
    expect(await store.get("nope")).toBeNull();
  });

  test("creates and verifies a key", async () => {
    const store = await tempStore();
    const { record, token } = await store.create({
      name: "ci",
      scopes: ["sessions:read", "chat:invoke", "chat:invoke"],
      userGrantable: ["chat:invoke"],
      now: new Date("2026-08-23T00:00:00Z"),
    });
    expect(token).toStartWith(`hk_${record.id}.`);
    expect(record.scopes).toEqual(["chat:invoke", "sessions:read"]);
    expect(record.userGrantable).toEqual(["chat:invoke"]);
    expect(record.createdAt).toBe("2026-08-23T00:00:00.000Z");
    expect(record.expiresAt).toBeNull();
    const verified = await store.verifyToken(token);
    expect(verified?.id).toBe(record.id);
  });

  test("defaults createdAt and userGrantable", async () => {
    const store = await tempStore();
    const { record } = await store.create({ name: "x", scopes: ["chat:invoke"] });
    expect(record.userGrantable).toEqual([]);
    expect(Date.parse(record.createdAt)).toBeGreaterThan(0);
  });

  test("rejects malformed, unknown, and wrong-secret tokens", async () => {
    const store = await tempStore();
    const { record, token } = await store.create({
      name: "x",
      scopes: ["chat:invoke"],
    });
    expect(await store.verifyToken("garbage")).toBeNull();
    expect(await store.verifyToken("hk_ffffff.abcdef")).toBeNull();
    expect(await store.verifyToken(`hk_${record.id}.deadbeef`)).toBeNull();
    expect(await store.verifyToken(token)).not.toBeNull();
  });

  test("rejects revoked keys", async () => {
    const store = await tempStore();
    const { record, token } = await store.create({
      name: "x",
      scopes: ["chat:invoke"],
    });
    expect(await store.revoke(record.id)).toMatchObject({ revoked: true });
    expect(await store.revoke("nope")).toBeNull();
    expect(await store.verifyToken(token)).toBeNull();
  });

  test("rejects expired keys", async () => {
    const store = await tempStore();
    const { token } = await store.create({
      name: "x",
      scopes: ["chat:invoke"],
      expiresAt: new Date("2026-01-01T00:00:00Z"),
    });
    expect(
      await store.verifyToken(token, new Date("2025-12-31T00:00:00Z")),
    ).not.toBeNull();
    expect(
      await store.verifyToken(token, new Date("2026-01-01T00:00:00Z")),
    ).toBeNull();
  });

  test("rotates the secret", async () => {
    const store = await tempStore();
    const { record, token } = await store.create({
      name: "x",
      scopes: ["chat:invoke"],
      cidrs: ["10.0.0.0/8"],
    });
    expect(record.cidrs).toEqual(["10.0.0.0/8"]);
    const rotated = await store.rotate(record.id);
    expect(rotated?.token).toStartWith(`hk_${record.id}.`);
    expect(await store.verifyToken(token)).toBeNull();
    expect(await store.verifyToken(rotated?.token as string)).not.toBeNull();
    expect(await store.rotate("nope")).toBeNull();
  });

  test("writes the keys file and its directory owner-only", async () => {
    const dir = await mkdtemp(join(tmpdir(), "hermes-api-test-"));
    const filePath = join(dir, "secrets", "keys.json");
    const store = new KeyStore(filePath);
    await store.create({ name: "x", scopes: ["chat:invoke"] });
    expect(((await stat(filePath)).mode & 0o777)).toBe(0o600);
    expect(((await stat(join(dir, "secrets"))).mode & 0o777)).toBe(0o700);
  });

  test("tightens permissions on a pre-existing keys file", async () => {
    const dir = await mkdtemp(join(tmpdir(), "hermes-api-test-"));
    const filePath = join(dir, "keys.json");
    await writeFile(filePath, '{"keys":[]}\n', { mode: 0o644 });
    const store = new KeyStore(filePath);
    await store.create({ name: "x", scopes: ["chat:invoke"] });
    expect(((await stat(filePath)).mode & 0o777)).toBe(0o600);
  });

  test("grants and ungrants scopes", async () => {
    const store = await tempStore();
    const { record } = await store.create({
      name: "x",
      scopes: ["chat:invoke"],
    });
    const granted = await store.grantScopes(record.id, [
      "sessions:read",
      "chat:invoke",
    ]);
    expect(granted?.scopes).toEqual(["chat:invoke", "sessions:read"]);
    const ungranted = await store.ungrantScopes(record.id, ["chat:invoke"]);
    expect(ungranted?.scopes).toEqual(["sessions:read"]);
    expect(await store.grantScopes("nope", ["chat:invoke"])).toBeNull();
  });
});
