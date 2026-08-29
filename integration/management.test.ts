/**
 * Management integration: requires a live hermes-remote with management
 * wiring (CLI + profiles) and an API key holding status:read, config:read,
 * memory:read, and events:subscribe. Same env as chat.test.ts.
 */
import { describe, expect, test } from "bun:test";
import { HermesClient } from "@in-th3-l00p/hermes-remote-client";

const enabled = process.env["HERMES_INTEGRATION"] === "1";
const baseUrl = process.env["HERMES_REMOTE_URL"] ?? "http://localhost:8643";
const token = process.env["HERMES_REMOTE_TOKEN"];

describe.skipIf(!enabled)("management integration", () => {
  const client = new HermesClient({
    baseUrl,
    ...(token === undefined ? {} : { token }),
  });

  test("profiles enumerate", async () => {
    const profiles = await client.profiles.list();
    expect(profiles.length).toBeGreaterThan(0);
    expect(profiles.some((p) => p.isDefault)).toBe(true);
  }, 30_000);

  test("agent status comes back from the cli bridge", async () => {
    const status = await client.agent.status();
    expect(status.ok).toBe(true);
    expect(status.raw.length).toBeGreaterThan(0);
  }, 60_000);

  test("config reads are redacted cli output", async () => {
    const config = await client.config.show();
    expect(config.ok).toBe(true);
  }, 30_000);

  test("memory reads from the profile home", async () => {
    const memory = await client.memory.get();
    expect(memory.limit).toBe(2200);
    expect(typeof memory.content).toBe("string");
  }, 30_000);
});
