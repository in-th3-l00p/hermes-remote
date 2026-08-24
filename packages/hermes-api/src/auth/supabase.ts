import { createHmac, timingSafeEqual } from "node:crypto";

export interface SupabaseUser {
  sub: string;
  email?: string;
  is_anonymous?: boolean;
}

function base64UrlDecode(text: string): string {
  return Buffer.from(text, "base64url").toString("utf8");
}

/** Verifies a Supabase HS256 access token against the project's JWT secret. */
export function verifySupabaseJwt(
  token: string,
  secret: string,
  now: Date = new Date(),
): SupabaseUser | null {
  const parts = token.split(".");
  if (parts.length !== 3) {
    return null;
  }
  const [headerPart, payloadPart, signaturePart] = parts as [
    string,
    string,
    string,
  ];
  let header: { alg?: string };
  let payload: { sub?: unknown; exp?: unknown; email?: unknown; is_anonymous?: unknown };
  try {
    header = JSON.parse(base64UrlDecode(headerPart)) as { alg?: string };
    payload = JSON.parse(base64UrlDecode(payloadPart)) as typeof payload;
  } catch {
    return null;
  }
  if (header.alg !== "HS256") {
    return null;
  }
  const expected = createHmac("sha256", secret)
    .update(`${headerPart}.${payloadPart}`)
    .digest();
  const actual = Buffer.from(signaturePart, "base64url");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return null;
  }
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
