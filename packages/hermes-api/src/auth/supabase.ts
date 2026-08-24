import { createHmac, timingSafeEqual } from "node:crypto";

export interface SupabaseUser {
  sub: string;
  email?: string;
  is_anonymous?: boolean;
}

/** Anything that can turn an end-user bearer token into a user identity. */
export interface UserTokenVerifier {
  verify(token: string): Promise<SupabaseUser | null>;
}

interface JwtPayload {
  sub?: unknown;
  exp?: unknown;
  email?: unknown;
  is_anonymous?: unknown;
}

function base64UrlDecode(text: string): string {
  return Buffer.from(text, "base64url").toString("utf8");
}

function parseToken(
  token: string,
): { header: { alg?: string; kid?: string }; payload: JwtPayload; signed: string; signature: string } | null {
  const parts = token.split(".");
  if (parts.length !== 3) {
    return null;
  }
  const [headerPart, payloadPart, signature] = parts as [string, string, string];
  try {
    return {
      header: JSON.parse(base64UrlDecode(headerPart)) as { alg?: string; kid?: string },
      payload: JSON.parse(base64UrlDecode(payloadPart)) as JwtPayload,
      signed: `${headerPart}.${payloadPart}`,
      signature,
    };
  } catch {
    return null;
  }
}

function toUser(payload: JwtPayload, now: Date): SupabaseUser | null {
  if (typeof payload.exp !== "number" || payload.exp * 1000 <= now.getTime()) {
    return null;
  }
  if (typeof payload.sub !== "string" || payload.sub === "") {
    return null;
  }
  return {
    sub: payload.sub,
    ...(typeof payload.email === "string" ? { email: payload.email } : {}),
    ...(typeof payload.is_anonymous === "boolean"
      ? { is_anonymous: payload.is_anonymous }
      : {}),
  };
}

/** Verifies a Supabase HS256 access token against the project's JWT secret. */
export function verifySupabaseJwt(
  token: string,
  secret: string,
  now: Date = new Date(),
): SupabaseUser | null {
  const parsed = parseToken(token);
  if (parsed === null || parsed.header.alg !== "HS256") {
    return null;
  }
  const expected = createHmac("sha256", secret).update(parsed.signed).digest();
  const actual = Buffer.from(parsed.signature, "base64url");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return null;
  }
  return toUser(parsed.payload, now);
}

/** Wraps the HS256 secret check as a UserTokenVerifier. */
export function hs256Verifier(
  secret: string,
  now: () => Date = () => new Date(),
): UserTokenVerifier {
  return {
    verify: async (token) => verifySupabaseJwt(token, secret, now()),
  };
}

interface Jwk {
  kty: string;
  crv?: string;
  x?: string;
  y?: string;
  kid?: string;
  alg?: string;
}

/**
 * Verifies Supabase ES256 access tokens against the project's JWKS endpoint
 * (`<project-url>/auth/v1/.well-known/jwks.json`). Keys are cached; an unknown
 * `kid` triggers one refetch.
 */
export class SupabaseJwksVerifier implements UserTokenVerifier {
  private readonly jwksUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => Date;
  private keys = new Map<string, CryptoKey>();

  constructor(
    projectUrl: string,
    options: { fetch?: typeof fetch; now?: () => Date } = {},
  ) {
    this.jwksUrl = `${projectUrl.replace(/\/+$/, "")}/auth/v1/.well-known/jwks.json`;
    this.fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.now = options.now ?? (() => new Date());
  }

  private async loadKeys(): Promise<void> {
    const res = await this.fetchImpl(this.jwksUrl);
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

  async verify(token: string): Promise<SupabaseUser | null> {
    const parsed = parseToken(token);
    if (
      parsed === null ||
      parsed.header.alg !== "ES256" ||
      parsed.header.kid === undefined
    ) {
      return null;
    }
    if (!this.keys.has(parsed.header.kid)) {
      await this.loadKeys().catch(() => undefined);
    }
    const key = this.keys.get(parsed.header.kid);
    if (key === undefined) {
      return null;
    }
    const valid = await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      key,
      Buffer.from(parsed.signature, "base64url"),
      Buffer.from(parsed.signed),
    );
    if (!valid) {
      return null;
    }
    return toUser(parsed.payload, this.now());
  }
}
