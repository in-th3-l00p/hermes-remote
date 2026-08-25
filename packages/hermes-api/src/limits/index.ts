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

/** Fixed-window request counter per principal. */
export class RateLimiter {
  private readonly windows = new Map<string, { start: number; count: number }>();

  constructor(
    private readonly options: RateLimitOptions,
    private readonly now: () => number = () => Date.now(),
  ) {}

  /** Like check but never counts: returns the block without consuming a slot. */
  peek(key: string): number | null {
    const at = this.now();
    const windowMs = this.options.windowSeconds * 1000;
    const window = this.windows.get(key);
    if (
      window === undefined ||
      at - window.start >= windowMs ||
      window.count < this.options.limit
    ) {
      return null;
    }
    return Math.ceil((window.start + windowMs - at) / 1000);
  }

  /** Returns null when allowed, otherwise seconds until the window resets. */
  check(key: string): number | null {
    const at = this.now();
    const windowMs = this.options.windowSeconds * 1000;
    const window = this.windows.get(key);
    if (window === undefined || at - window.start >= windowMs) {
      this.windows.set(key, { start: at, count: 1 });
      return null;
    }
    if (window.count < this.options.limit) {
      window.count += 1;
      return null;
    }
    return Math.ceil((window.start + windowMs - at) / 1000);
  }
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
