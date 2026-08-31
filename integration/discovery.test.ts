/**
 * Discovery integration: health, capabilities, and model listing through the
 * upstream facade. Local stack by default, live stack with HERMES_INTEGRATION=1.
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

describe("discovery", () => {
  test("health reports the upstream agent", async () => {
    const health = await client.discovery.health();
    expect(["ok", "degraded", "unreachable"]).toContain(health.status);
    expect(health.version.length).toBeGreaterThan(0);
  }, 30_000);

  test("capabilities wrap the upstream feature set", async () => {
    const capabilities = await client.discovery.capabilities();
    expect(capabilities.object).toBe("hermes-remote.capabilities");
    expect(capabilities.features["discovery"]).toBe(true);
  }, 30_000);

  test("models come back as a list", async () => {
    const models = await client.discovery.models<{
      object: string;
      data: unknown[];
    }>();
    expect(models.object).toBe("list");
    expect(models.data.length).toBeGreaterThan(0);
  }, 30_000);
});
