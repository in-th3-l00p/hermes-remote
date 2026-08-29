import { describe, expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RunStore } from "./run-store.ts";

const NOW = new Date("2026-08-24T00:00:00Z");

describe("RunStore", () => {
  test("records, fetches, and lists newest first", () => {
    let tick = 0;
    const store = new RunStore(
      ":memory:",
      () => new Date(NOW.getTime() + tick++ * 1000),
    );
    expect(store.record("r1", "user:u1")).toEqual({
      id: "r1",
      principal: "user:u1",
      createdAt: "2026-08-24T00:00:00.000Z",
    });
    store.record("r2", "user:u2");
    store.record("r3", "user:u1");
    expect(store.get("r1")?.principal).toBe("user:u1");
    expect(store.get("missing")).toBeNull();
    expect(store.list("user:u1").map((r) => r.id)).toEqual(["r3", "r1"]);
    expect(store.list("user:u2").map((r) => r.id)).toEqual(["r2"]);
    expect(store.list(null).map((r) => r.id)).toEqual(["r3", "r2", "r1"]);
    expect(store.list("user:nobody")).toEqual([]);
  });

  test("defaults to memory and the real clock", () => {
    const store = new RunStore();
    const record = store.record("r", "key:k");
    expect(Date.parse(record.createdAt)).toBeGreaterThan(0);
  });

  test("persists across instances on the same file", async () => {
    const dir = await mkdtemp(join(tmpdir(), "hermes-run-store-"));
    const path = join(dir, "nested", "chat.db");
    const first = new RunStore(path, () => NOW);
    first.record("r1", "key:k");
    const second = new RunStore(path, () => NOW);
    expect(second.get("r1")?.principal).toBe("key:k");
  });
});
