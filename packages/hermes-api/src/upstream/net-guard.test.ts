import { describe, expect, test } from "bun:test";
import { checkPublicUrl, isPublicAddress } from "./net-guard.ts";

describe("isPublicAddress", () => {
  test("rejects non-public ranges", () => {
    for (const ip of [
      "127.0.0.1",
      "10.1.2.3",
      "172.16.0.1",
      "172.31.255.255",
      "192.168.1.1",
      "169.254.169.254",
      "100.64.0.1",
      "0.0.0.0",
      "224.0.0.1",
      "255.255.255.255",
      "192.0.0.8",
      "198.18.0.1",
      "::1",
      "::",
      "fc00::1",
      "fd12::1",
      "fe80::1",
      "ff02::1",
      "::ffff:127.0.0.1",
      "not-an-ip",
    ]) {
      expect(isPublicAddress(ip)).toBe(false);
    }
  });

  test("accepts public addresses", () => {
    for (const ip of [
      "93.184.216.34",
      "8.8.8.8",
      "172.32.0.1",
      "2606:4700::1111",
      "::ffff:8.8.8.8",
    ]) {
      expect(isPublicAddress(ip)).toBe(true);
    }
  });
});

describe("checkPublicUrl", () => {
  const resolver = async (host: string) => {
    if (host === "public.test") return ["93.184.216.34"];
    if (host === "sneaky.test") return ["93.184.216.34", "10.0.0.5"];
    if (host === "empty.test") return [];
    throw new Error("NXDOMAIN");
  };

  test("returns the normalized URL for public hosts", async () => {
    const ok = await checkPublicUrl("https://public.test/a b", resolver);
    expect("url" in ok && ok.url.href).toBe("https://public.test/a%20b");
    expect("url" in (await checkPublicUrl("http://8.8.8.8/", resolver))).toBe(true);
  });

  test("refuses everything that reaches the host's own network", async () => {
    for (const text of [
      "not a url",
      "file:///etc/passwd",
      "ftp://public.test/",
      "http://user:pw@public.test/",
      "http://127.0.0.1:8642/v1/runs",
      "http://169.254.169.254/latest/meta-data",
      "http://[::1]/",
      "http://sneaky.test/",
      "http://empty.test/",
      "http://missing.test/",
    ]) {
      expect("reason" in (await checkPublicUrl(text, resolver))).toBe(true);
    }
  });

  test("uses real DNS by default", async () => {
    expect("reason" in (await checkPublicUrl("http://localhost/"))).toBe(true);
  });
});
