/**
 * Discovery integration: requires a live hermes-remote wired to a real Hermes
 * agent, same environment as chat.test.ts.
 */
import { describe, expect, test } from "bun:test";
import { HermesClient } from "@in-th3-l00p/hermes-remote-client";

const enabled = process.env["HERMES_INTEGRATION"] === "1";
const baseUrl = process.env["HERMES_REMOTE_URL"] ?? "http://localhost:8643";
const token = process.env["HERMES_REMOTE_TOKEN"];

describe.skipIf(!enabled)("discovery integration", () => {
  const client = new HermesClient({
    baseUrl,
    ...(token === undefined ? {} : { token }),
  });

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
