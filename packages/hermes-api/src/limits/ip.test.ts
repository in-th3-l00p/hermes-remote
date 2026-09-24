import { describe, expect, test } from "bun:test";
import { clientIp, ipInCidr, isValidCidr, normalizeIp } from "./ip.ts";

describe("ip helpers", () => {
  test("normalizes mapped IPv4, case and zone ids", () => {
    expect(normalizeIp("::FFFF:127.0.0.1")).toBe("127.0.0.1");
    expect(normalizeIp("FE80::1%en0")).toBe("fe80::1");
    expect(normalizeIp(" 10.0.0.1 ")).toBe("10.0.0.1");
  });

  test("matches IPv4, mapped IPv4 and IPv6 CIDRs", () => {
    expect(ipInCidr("::ffff:127.0.0.1", "127.0.0.0/8")).toBe(true);
    expect(ipInCidr("10.1.2.3", "10.0.0.0/8")).toBe(true);
    expect(ipInCidr("11.1.2.3", "10.0.0.0/8")).toBe(false);
    expect(ipInCidr("1.2.3.4", "0.0.0.0/0")).toBe(true);
    expect(ipInCidr("1.2.3.4", "1.2.3.4")).toBe(true);
    expect(ipInCidr("2001:db8::1", "2001:db8::/32")).toBe(true);
    expect(ipInCidr("2001:db9::1", "2001:db8::/32")).toBe(false);
    expect(ipInCidr("::1", "::1/128")).toBe(true);
    expect(ipInCidr("64:ff9b::1.2.3.4", "64:ff9b::/96")).toBe(true);
    expect(ipInCidr("fd00:1:2:3:4:5:6:7", "fd00::/8")).toBe(true);
    expect(ipInCidr("10.0.0.1", "2001:db8::/32")).toBe(false);
    expect(ipInCidr("not-an-ip", "10.0.0.0/8")).toBe(false);
    expect(ipInCidr("10.0.0.1", "10.0.0.0/33")).toBe(false);
  });

  test("validates CIDRs", () => {
    for (const ok of ["10.0.0.0/8", "10.0.0.1", "::/0", "2001:db8::/32", "0.0.0.0/0"]) {
      expect(isValidCidr(ok)).toBe(true);
    }
    for (const bad of [
      "10.0.0.0/33",
      "2001:db8::/129",
      "10.0.0/8",
      "abc",
      "10.0.0.0/x",
      "10.0.0.0/-1",
    ]) {
      expect(isValidCidr(bad)).toBe(false);
    }
  });

  test("uses the socket peer unless it is a trusted proxy", () => {
    expect(clientIp("1.2.3.4", "9.9.9.9", [])).toBe("9.9.9.9");
    expect(clientIp("1.2.3.4", "::ffff:9.9.9.9", ["10.0.0.0/8"])).toBe("9.9.9.9");
    expect(clientIp(null, "10.0.0.2", ["10.0.0.0/8"])).toBe("10.0.0.2");
    expect(clientIp("1.2.3.4", undefined, ["10.0.0.0/8"])).toBeUndefined();
  });

  test("walks X-Forwarded-For right to left past trusted hops", () => {
    const trust = ["10.0.0.0/8", "127.0.0.1"];
    expect(clientIp("1.2.3.4", "127.0.0.1", trust)).toBe("1.2.3.4");
    // A spoofed left-most entry is ignored: the proxy appended the real one.
    expect(clientIp("6.6.6.6, 1.2.3.4, 10.0.0.9", "127.0.0.1", trust)).toBe("1.2.3.4");
    expect(clientIp("junk, 1.2.3.4", "127.0.0.1", trust)).toBe("1.2.3.4");
    expect(clientIp("10.0.0.5, 10.0.0.6", "127.0.0.1", trust)).toBe("10.0.0.5");
    expect(clientIp("junk", "127.0.0.1", trust)).toBe("127.0.0.1");
  });
});
