import { describe, expect, test } from "bun:test";
import { DEFAULT_LIMITS, RateLimiter, ipInCidr } from "./limits.ts";

describe("RateLimiter", () => {
  test("allows within the window, blocks over it, then resets", () => {
    let at = 0;
    const limiter = new RateLimiter({ limit: 2, windowSeconds: 60 }, () => at);
    expect(limiter.check("k")).toBeNull();
    expect(limiter.check("k")).toBeNull();
    const retry = limiter.check("k");
    expect(retry).toBe(60);
    at = 30_000;
    expect(limiter.check("k")).toBe(30);
    expect(limiter.check("other")).toBeNull();
    at = 61_000;
    expect(limiter.check("k")).toBeNull();
  });

  test("uses the real clock by default", () => {
    const limiter = new RateLimiter({ limit: 1, windowSeconds: 60 });
    expect(limiter.check("k")).toBeNull();
    expect(limiter.check("k")).toBeGreaterThan(0);
  });
});

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
