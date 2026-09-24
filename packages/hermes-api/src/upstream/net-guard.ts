import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export type HostResolver = (hostname: string) => Promise<string[]>;

const defaultResolver: HostResolver = async (hostname) =>
  (await lookup(hostname, { all: true })).map((a) => a.address);

const BLOCKED_V4: [number, number][] = [
  [0x00000000, 8], // "this" network
  [0x0a000000, 8], // private
  [0x64400000, 10], // carrier-grade NAT
  [0x7f000000, 8], // loopback
  [0xa9fe0000, 16], // link-local, cloud metadata
  [0xac100000, 12], // private
  [0xc0000000, 24], // IETF protocol assignments
  [0xc0a80000, 16], // private
  [0xc6120000, 15], // benchmarking
  [0xe0000000, 4], // multicast
  [0xf0000000, 4], // reserved, broadcast
];

function v4ToInt(ip: string): number {
  return ip.split(".").reduce((n, part) => n * 256 + Number(part), 0);
}

/** False for loopback, private, link-local, metadata and other non-public ranges. */
export function isPublicAddress(ip: string): boolean {
  const family = isIP(ip);
  if (family === 4) {
    const n = v4ToInt(ip);
    return !BLOCKED_V4.some(([base, bits]) => {
      const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
      return ((n & mask) >>> 0) === base;
    });
  }
  if (family === 6) {
    const lower = ip.toLowerCase();
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(lower);
    if (mapped !== null) {
      return isPublicAddress(mapped[1] as string);
    }
    return !(
      lower === "::" ||
      lower === "::1" ||
      /^f[cd]/.test(lower) || // unique local fc00::/7
      /^fe[89ab]/.test(lower) || // link-local fe80::/10
      /^ff/.test(lower) // multicast
    );
  }
  return false;
}

/**
 * Parses a URL the agent will be asked to fetch and refuses anything that
 * points at the host's own network: non-http(s) schemes, credentials in the
 * URL, and hosts that are or resolve to non-public addresses. Returns the
 * normalized URL, or a reason for refusal.
 */
export async function checkPublicUrl(
  text: string,
  resolve: HostResolver = defaultResolver,
): Promise<{ url: URL } | { reason: string }> {
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return { reason: "not a valid URL" };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { reason: "only http and https URLs are allowed" };
  }
  if (url.username !== "" || url.password !== "") {
    return { reason: "URLs with credentials are not allowed" };
  }
  const host = url.hostname.replace(/^\[|\]$/g, "");
  let addresses: string[];
  try {
    addresses = isIP(host) === 0 ? await resolve(host) : [host];
  } catch {
    return { reason: "host could not be resolved" };
  }
  if (addresses.length === 0 || !addresses.every(isPublicAddress)) {
    return { reason: "host is not a public address" };
  }
  return { url };
}
