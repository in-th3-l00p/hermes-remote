import { describe, expect, test } from "bun:test";
import { DEFAULT_LIMITS, ipInCidr } from "./index.ts";

describe("ipInCidr", () => {
  test("matches prefixes", () => {
    expect(ipInCidr("10.1.2.3", "10.0.0.0/8")).toBe(true);
    expect(ipInCidr("11.0.0.1", "10.0.0.0/8")).toBe(false);
    expect(ipInCidr("192.168.1.12", "192.168.1.12")).toBe(true);
    expect(ipInCidr("192.168.1.13", "192.168.1.12/32")).toBe(false);
    expect(ipInCidr("8.8.8.8", "0.0.0.0/0")).toBe(true);
  });

  test("rejects malformed input", () => {
    expect(ipInCidr("not-an-ip", "10.0.0.0/8")).toBe(false);
    expect(ipInCidr("10.0.0.1", "10.0.0/8")).toBe(false);
    expect(ipInCidr("10.0.0.1", "10.0.0.0/33")).toBe(false);
    expect(ipInCidr("10.0.0.256", "10.0.0.0/8")).toBe(false);
    expect(ipInCidr("10.0.0.01", "10.0.0.0/8")).toBe(false);
    expect(ipInCidr("10.0.0.1", "10.0.0.0/x")).toBe(false);
  });

  test("default limits are sane", () => {
    expect(DEFAULT_LIMITS.maxAttachments).toBeGreaterThan(0);
  });
});
