import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const TOKEN_ISSUER = "hermes-remote";

export interface UserTokenClaims {
  iss: typeof TOKEN_ISSUER;
  sub: string;
  scp: string[];
  gen: number;
  iat: number;
  exp: number;
}

const B64URL = /^[A-Za-z0-9_-]+$/;

const enc = (value: unknown): string => Buffer.from(JSON.stringify(value)).toString("base64url");

/** A fresh 256-bit signing secret, base64url encoded. */
export function newSigningSecret(): string {
  return randomBytes(32).toString("base64url");
}

/** Mints and verifies hermes-remote's own HS256 user tokens. */
export class UserTokenIssuer {
  constructor(private readonly secret: string) {
    if (secret.length < 32) {
      throw new Error("user token signing secret must be at least 32 characters");
    }
  }

  private sign(data: string): string {
    return createHmac("sha256", this.secret).update(data).digest("base64url");
  }

  mint(input: {
    userId: string;
    scopes: string[];
    generation: number;
    ttlSeconds: number;
    now: Date;
  }): {
    token: string;
    expiresAt: string;
  } {
    const iat = Math.floor(input.now.getTime() / 1000);
    const claims: UserTokenClaims = {
      iss: TOKEN_ISSUER,
      sub: input.userId,
      scp: input.scopes,
      gen: input.generation,
      iat,
      exp: iat + input.ttlSeconds,
    };
    const head = `${enc({ alg: "HS256", typ: "JWT" })}.${enc(claims)}`;
    return {
      token: `${head}.${this.sign(head)}`,
      expiresAt: new Date(claims.exp * 1000).toISOString(),
    };
  }

  /** True when the token claims to be ours (cheap check, no verification). */
  static isOwnToken(token: string): boolean {
    const payload = token.split(".")[1];
    if (payload === undefined || !B64URL.test(payload)) {
      return false;
    }
    try {
      return (
        (JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { iss?: unknown })
          .iss === TOKEN_ISSUER
      );
    } catch {
      return false;
    }
  }

  verify(token: string, now: Date): UserTokenClaims | null {
    const parts = token.split(".");
    if (parts.length !== 3 || !parts.every((p) => B64URL.test(p))) {
      return null;
    }
    const [header, payload, signature] = parts as [string, string, string];
    const expected = Buffer.from(this.sign(`${header}.${payload}`), "base64url");
    const actual = Buffer.from(signature, "base64url");
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
      return null;
    }
    const claims = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as UserTokenClaims;
    if (
      claims.iss !== TOKEN_ISSUER ||
      typeof claims.sub !== "string" ||
      !Array.isArray(claims.scp) ||
      typeof claims.gen !== "number" ||
      typeof claims.exp !== "number" ||
      claims.exp * 1000 <= now.getTime()
    ) {
      return null;
    }
    return claims;
  }
}
