import { describe, expect, test } from "bun:test";
import { createHmac } from "node:crypto";
import { verifySupabaseJwt } from "./supabase.ts";

const SECRET = "super-secret";
const NOW = new Date("2026-08-24T00:00:00Z");

function sign(
  payload: Record<string, unknown>,
  secret = SECRET,
  alg = "HS256",
): string {
  const enc = (o: unknown) =>
    Buffer.from(JSON.stringify(o)).toString("base64url");
  const head = enc({ alg, typ: "JWT" });
  const body = enc(payload);
  const sig = createHmac("sha256", secret)
    .update(`${head}.${body}`)
    .digest("base64url");
  return `${head}.${body}.${sig}`;
}

const valid = {
  sub: "user-1",
  email: "a@b.c",
  is_anonymous: true,
  exp: NOW.getTime() / 1000 + 3600,
};

describe("verifySupabaseJwt", () => {
  test("accepts a valid token", () => {
    expect(verifySupabaseJwt(sign(valid), SECRET, NOW)).toEqual({
      sub: "user-1",
      email: "a@b.c",
      is_anonymous: true,
    });
  });

  test("omits optional claims when absent", () => {
    const token = sign({ sub: "u", exp: valid.exp });
    expect(verifySupabaseJwt(token, SECRET, NOW)).toEqual({ sub: "u" });
  });

  test("rejects malformed tokens", () => {
    expect(verifySupabaseJwt("nope", SECRET, NOW)).toBeNull();
    expect(verifySupabaseJwt("a.b.c", SECRET, NOW)).toBeNull();
    const [h, p] = sign(valid).split(".");
    expect(verifySupabaseJwt(`${h}.${p}.!!!!`, SECRET, NOW)).toBeNull();
  });

  test("rejects wrong secret, wrong alg, expiry, and bad sub", () => {
    expect(verifySupabaseJwt(sign(valid, "other"), SECRET, NOW)).toBeNull();
    expect(verifySupabaseJwt(sign(valid, SECRET, "none"), SECRET, NOW)).toBeNull();
    expect(
      verifySupabaseJwt(
        sign({ ...valid, exp: NOW.getTime() / 1000 - 1 }),
        SECRET,
        NOW,
      ),
    ).toBeNull();
    expect(
      verifySupabaseJwt(sign({ ...valid, exp: "soon" }), SECRET, NOW),
    ).toBeNull();
    expect(
      verifySupabaseJwt(sign({ ...valid, sub: "" }), SECRET, NOW),
    ).toBeNull();
    expect(
      verifySupabaseJwt(sign({ exp: valid.exp }), SECRET, NOW),
    ).toBeNull();
  });

  test("uses the real clock by default", () => {
    expect(
      verifySupabaseJwt(
        sign({ sub: "u", exp: Date.now() / 1000 + 60 }),
        SECRET,
      )?.sub,
    ).toBe("u");
  });
});
