export interface Limits {
  /** Max request body size accepted, in bytes. */
  maxBodyBytes: number;
  /** Max characters in one message. */
  maxMessageChars: number;
  /** Max attachments per message. */
  maxAttachments: number;
  /** Max characters in one attachment data URL. */
  maxAttachmentChars: number;
}

export const DEFAULT_LIMITS: Limits = {
  maxBodyBytes: 10_000_000,
  maxMessageChars: 8_000,
  maxAttachments: 4,
  maxAttachmentChars: 2_000_000,
};

export interface RateLimitOptions {
  /** Requests allowed per window. */
  limit: number;
  windowSeconds: number;
}

/** Matches an IPv4 address against a CIDR block like "10.0.0.0/8". */
export function ipInCidr(ip: string, cidr: string): boolean {
  const toInt = (addr: string): number | null => {
    const parts = addr.split(".");
    if (parts.length !== 4) {
      return null;
    }
    let value = 0;
    for (const part of parts) {
      const n = Number(part);
      if (!Number.isInteger(n) || n < 0 || n > 255 || part !== String(n)) {
        return null;
      }
      value = value * 256 + n;
    }
    return value;
  };
  const [network, prefixText] = cidr.split("/") as [string, string | undefined];
  const prefix = prefixText === undefined ? 32 : Number(prefixText);
  const ipValue = toInt(ip);
  const networkValue = toInt(network);
  if (
    ipValue === null ||
    networkValue === null ||
    !Number.isInteger(prefix) ||
    prefix < 0 ||
    prefix > 32
  ) {
    return false;
  }
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return ((ipValue & mask) >>> 0) === ((networkValue & mask) >>> 0);
}
