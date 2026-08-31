/**
 * Management integration: profiles, CLI-backed routes, and profile-home file
 * routes. Local stack by default, live stack with HERMES_INTEGRATION=1; live
 * mode needs an API key holding status:read, config:read, memory:read, and
 * events:subscribe.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { HermesClient } from "@intheloop-studio/hermes-remote-client";
import { startStack, type TestStack } from "./harness.ts";

let stack: TestStack;
let client: HermesClient;

beforeAll(async () => {
  stack = await startStack();
  client = new HermesClient({
    baseUrl: stack.baseUrl,
    ...(stack.token === undefined ? {} : { token: stack.token }),
  });
});

afterAll(async () => {
  await stack.stop();
});

describe("management", () => {
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
