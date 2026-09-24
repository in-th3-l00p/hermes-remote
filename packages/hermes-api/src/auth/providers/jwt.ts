import { createHmac, timingSafeEqual } from "node:crypto";
import type { AuthProvider, VerifiedUser } from "./types.ts";

export interface JwtProviderOptions {
  jwksUrl?: string;
  hs256Secret?: string;
  issuer?: string;
  audience?: string;
  fetch?: typeof fetch;
  now?: () => Date;
}

interface JwtClaims {
  sub?: unknown;
  exp?: unknown;
  nbf?: unknown;
  iss?: unknown;
  aud?: unknown;
  email?: unknown;
  is_anonymous?: unknown;
}

interface ParsedToken {
  header: { alg?: string; kid?: string };
  claims: JwtClaims;
  signed: string;
  signature: string;
}

function base64UrlDecode(text: string): string {
  return Buffer.from(text, "base64url").toString("utf8");
}

const BASE64URL = /^[A-Za-z0-9_-]+$/;
/** Tolerated clock skew for `nbf`. */
const NBF_LEEWAY_MS = 30_000;
/** Minimum gap between JWKS refetches triggered by unknown key ids. */
const JWKS_REFETCH_MS = 30_000;
const JWKS_TIMEOUT_MS = 5_000;

function parseToken(token: string): ParsedToken | null {
  const parts = token.split(".");
  // Strict base64url: no padding or alternate alphabets, so each token has
  // exactly one encoding.
  if (parts.length !== 3 || !parts.every((p) => BASE64URL.test(p))) {
    return null;
  }
  const [headerPart, claimsPart, signature] = parts as [string, string, string];
  try {
    return {
      header: JSON.parse(base64UrlDecode(headerPart)) as ParsedToken["header"],
      claims: JSON.parse(base64UrlDecode(claimsPart)) as JwtClaims,
      signed: `${headerPart}.${claimsPart}`,
      signature,
    };
  } catch {
    return null;
  }
}

function audienceMatches(aud: unknown, expected: string): boolean {
  if (typeof aud === "string") {
    return aud === expected;
  }
  return Array.isArray(aud) && aud.includes(expected);
}

function toVerifiedUser(
  claims: JwtClaims,
  options: JwtProviderOptions,
  now: Date,
): VerifiedUser | null {
  if (typeof claims.exp !== "number" || claims.exp * 1000 <= now.getTime()) {
    return null;
  }
  if (
    claims.nbf !== undefined &&
    (typeof claims.nbf !== "number" || claims.nbf * 1000 > now.getTime() + NBF_LEEWAY_MS)
  ) {
    return null;
  }
  if (typeof claims.sub !== "string" || claims.sub === "") {
    return null;
  }
  if (options.issuer !== undefined && claims.iss !== options.issuer) {
    return null;
  }
  if (options.audience !== undefined && !audienceMatches(claims.aud, options.audience)) {
    return null;
  }
  return {
    sub: claims.sub,
    ...(typeof claims.email === "string" && claims.email !== "" ? { email: claims.email } : {}),
    ...(typeof claims.is_anonymous === "boolean" ? { isAnonymous: claims.is_anonymous } : {}),
  };
}

interface Jwk {
  kty: string;
  crv?: string;
  x?: string;
  y?: string;
  kid?: string;
}

/**
 * Zero-dependency verifier for HS256 shared-secret or ES256 JWKS tokens.
 * JWKS keys are cached; an unknown `kid` triggers a refetch at most every
 * 30 seconds, with a 5 second timeout, so forged key ids can't turn the
 * server into a fetch amplifier.
 */
export class JwtAuthProvider implements AuthProvider {
  readonly name = "jwt";
  private readonly options: JwtProviderOptions;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => Date;
  private keys = new Map<string, CryptoKey>();
  private lastFetch = Number.NEGATIVE_INFINITY;

  constructor(options: JwtProviderOptions) {
    if (options.jwksUrl === undefined && options.hs256Secret === undefined) {
      throw new Error("jwt auth provider requires jwksUrl or hs256Secret");
    }
    this.options = options;
    this.fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.now = options.now ?? (() => new Date());
  }

  async verify(token: string): Promise<VerifiedUser | null> {
    const parsed = parseToken(token);
    if (parsed === null) {
      return null;
    }
    const valid = await this.verifySignature(parsed);
    if (!valid) {
      return null;
    }
    return toVerifiedUser(parsed.claims, this.options, this.now());
  }

  private async verifySignature(parsed: ParsedToken): Promise<boolean> {
    if (parsed.header.alg === "HS256" && this.options.hs256Secret !== undefined) {
      const expected = createHmac("sha256", this.options.hs256Secret)
        .update(parsed.signed)
        .digest();
      const actual = Buffer.from(parsed.signature, "base64url");
      return expected.length === actual.length && timingSafeEqual(expected, actual);
    }
    if (
      parsed.header.alg === "ES256" &&
      parsed.header.kid !== undefined &&
      this.options.jwksUrl !== undefined
    ) {
      const key = await this.keyFor(parsed.header.kid);
      if (key === undefined) {
        return false;
      }
      return crypto.subtle.verify(
        { name: "ECDSA", hash: "SHA-256" },
        key,
        Buffer.from(parsed.signature, "base64url"),
        Buffer.from(parsed.signed),
      );
    }
    return false;
  }

  private async keyFor(kid: string): Promise<CryptoKey | undefined> {
    const at = this.now().getTime();
    if (!this.keys.has(kid) && at - this.lastFetch >= JWKS_REFETCH_MS) {
      this.lastFetch = at;
      await this.loadKeys().catch(() => undefined);
    }
    return this.keys.get(kid);
  }

  private async loadKeys(): Promise<void> {
    const res = await this.fetchImpl(this.options.jwksUrl as string, {
      signal: AbortSignal.timeout(JWKS_TIMEOUT_MS),
    });
    if (!res.ok) {
      return;
    }
    const body = (await res.json()) as { keys?: Jwk[] };
    for (const jwk of body.keys ?? []) {
      if (
        jwk.kty !== "EC" ||
        jwk.crv !== "P-256" ||
        jwk.kid === undefined ||
        jwk.x === undefined ||
        jwk.y === undefined
      ) {
        continue;
      }
      const key = await crypto.subtle.importKey(
        "jwk",
        { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y },
        { name: "ECDSA", namedCurve: "P-256" },
        false,
        ["verify"],
      );
      this.keys.set(jwk.kid, key);
    }
  }
}
