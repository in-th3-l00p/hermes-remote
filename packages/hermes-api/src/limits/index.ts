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

export { clientIp, ipInCidr, isValidCidr, normalizeIp } from "./ip.ts";
