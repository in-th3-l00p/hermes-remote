import { isIP } from "node:net";

/** Lower-cased, zone-free form; IPv4-mapped IPv6 becomes plain IPv4. */
export function normalizeIp(ip: string): string {
  const lower = ip.trim().toLowerCase().replace(/%.*$/, "");
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(lower);
  return mapped === null ? lower : (mapped[1] as string);
}

function v4ToBigInt(ip: string): bigint {
  return ip.split(".").reduce((n, part) => (n << 8n) | BigInt(Number(part)), 0n);
}

function v6ToBigInt(ip: string): bigint {
  // Embedded IPv4 tail (e.g. 64:ff9b::1.2.3.4) becomes two hex groups.
  const v4Tail = /(\d+\.\d+\.\d+\.\d+)$/.exec(ip);
  let text = ip;
  if (v4Tail !== null) {
    const n = v4ToBigInt(v4Tail[1] as string);
    text = `${ip.slice(0, -(v4Tail[1] as string).length)}${(n >> 16n).toString(16)}:${(n & 0xffffn).toString(16)}`;
  }
  const [head, tail] = text.split("::") as [string, string | undefined];
  const headGroups = head === "" ? [] : head.split(":");
  const tailGroups = tail === undefined || tail === "" ? [] : tail.split(":");
  const missing = 8 - headGroups.length - tailGroups.length;
  const groups = [...headGroups, ...Array<string>(tail === undefined ? 0 : missing).fill("0"), ...tailGroups];
  return groups.reduce((n, g) => (n << 16n) | BigInt(parseInt(g, 16)), 0n);
}

function parse(ip: string): { bits: number; value: bigint } | null {
  const normalized = normalizeIp(ip);
  const family = isIP(normalized);
  if (family === 4) {
    return { bits: 32, value: v4ToBigInt(normalized) };
  }
  if (family === 6) {
    return { bits: 128, value: v6ToBigInt(normalized) };
  }
  return null;
}

/** True for "a.b.c.d/n" (n ≤ 32), "v6::/n" (n ≤ 128), or a bare address. */
export function isValidCidr(cidr: string): boolean {
  const [network, prefixText] = cidr.split("/") as [string, string | undefined];
  const parsed = parse(network);
  if (parsed === null) {
    return false;
  }
  if (prefixText === undefined) {
    return true;
  }
  const prefix = Number(prefixText);
  return /^\d+$/.test(prefixText) && prefix <= parsed.bits;
}

/** Matches an IPv4 or IPv6 address against a CIDR block of the same family. */
export function ipInCidr(ip: string, cidr: string): boolean {
  if (!isValidCidr(cidr)) {
    return false;
  }
  const [network, prefixText] = cidr.split("/") as [string, string | undefined];
  const addr = parse(ip);
  const net = parse(network) as { bits: number; value: bigint };
  if (addr === null || addr.bits !== net.bits) {
    return false;
  }
  const prefix = BigInt(prefixText === undefined ? net.bits : Number(prefixText));
  const shift = BigInt(net.bits) - prefix;
  return addr.value >> shift === net.value >> shift;
}

/**
 * The client address for a request. Without trusted proxies it is the
 * socket peer. When the peer is a trusted proxy, X-Forwarded-For is read
 * right to left and the first hop that is not itself a trusted proxy wins,
 * so a client can't spoof its address by prepending entries.
 */
export function clientIp(
  forwardedFor: string | null,
  socketIp: string | undefined,
  trustProxy: string[],
): string | undefined {
  if (socketIp === undefined) {
    return undefined;
  }
  const peer = normalizeIp(socketIp);
  const trusted = (ip: string) => trustProxy.some((cidr) => ipInCidr(ip, cidr));
  if (!trusted(peer) || forwardedFor === null) {
    return peer;
  }
  const hops = forwardedFor.split(",").map(normalizeIp).filter((h) => isIP(h) !== 0);
  for (let i = hops.length - 1; i >= 0; i -= 1) {
    const hop = hops[i] as string;
    if (!trusted(hop)) {
      return hop;
    }
  }
  return hops[0] ?? peer;
}
