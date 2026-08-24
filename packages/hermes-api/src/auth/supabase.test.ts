import { describe, expect, test } from "bun:test";
import { createHmac } from "node:crypto";
import {
  SupabaseJwksVerifier,
  hs256Verifier,
  verifySupabaseJwt,
} from "./supabase.ts";

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

  test("hs256Verifier wraps the secret check", async () => {
    const verifier = hs256Verifier(SECRET, () => NOW);
    expect((await verifier.verify(sign(valid)))?.sub).toBe("user-1");
    expect(await verifier.verify("nope")).toBeNull();
    const fresh = sign({ sub: "user-1", exp: Date.now() / 1000 + 60 });
    expect((await hs256Verifier(SECRET).verify(fresh))?.sub).toBe("user-1");
  });
});

describe("SupabaseJwksVerifier", () => {
  async function makeKeys() {
    const pair = await crypto.subtle.generateKey(
      { name: "ECDSA", namedCurve: "P-256" },
      true,
      ["sign", "verify"],
    );
    const jwk = (await crypto.subtle.exportKey("jwk", pair.publicKey)) as {
      kty: string;
      crv: string;
      x: string;
      y: string;
    };
    const signToken = async (
      payload: Record<string, unknown>,
      header: Record<string, unknown> = { alg: "ES256", kid: "k1", typ: "JWT" },
    ) => {
      const enc = (o: unknown) =>
        Buffer.from(JSON.stringify(o)).toString("base64url");
      const signed = `${enc(header)}.${enc(payload)}`;
      const sig = await crypto.subtle.sign(
        { name: "ECDSA", hash: "SHA-256" },
        pair.privateKey,
        Buffer.from(signed),
      );
      return `${signed}.${Buffer.from(sig).toString("base64url")}`;
    };
    return { jwk, signToken };
  }

  function jwksFetch(
    keys: unknown[],
    counter: { fetches: number },
    status = 200,
  ): typeof fetch {
    return (async (url: string | URL | Request) => {
      counter.fetches += 1;
      expect(String(url)).toBe(
        "https://proj.supabase.co/auth/v1/.well-known/jwks.json",
      );
      return Response.json({ keys }, { status });
    }) as unknown as typeof fetch;
  }

  const payload = {
    sub: "es-user",
    email: "e@s.io",
    exp: NOW.getTime() / 1000 + 3600,
  };

  test("verifies ES256 tokens and caches the JWKS", async () => {
    const { jwk, signToken } = await makeKeys();
    const counter = { fetches: 0 };
    const verifier = new SupabaseJwksVerifier("https://proj.supabase.co/", {
      fetch: jwksFetch(
        [
          { ...jwk, kid: "k1", alg: "ES256" },
          { kty: "RSA", kid: "skip-me" },
          { ...jwk, kid: undefined },
        ],
        counter,
      ),
      now: () => NOW,
    });
    const token = await signToken(payload);
    expect(await verifier.verify(token)).toEqual({
      sub: "es-user",
      email: "e@s.io",
    });
    expect(await verifier.verify(token)).not.toBeNull();
    expect(counter.fetches).toBe(1);
  });

  test("rejects unknown kid, wrong alg, missing kid, malformed", async () => {
    const { jwk, signToken } = await makeKeys();
    const counter = { fetches: 0 };
    const verifier = new SupabaseJwksVerifier("https://proj.supabase.co", {
      fetch: jwksFetch([{ ...jwk, kid: "k1" }], counter),
      now: () => NOW,
    });
    expect(
      await verifier.verify(
        await signToken(payload, { alg: "ES256", kid: "other" }),
      ),
    ).toBeNull();
    expect(
      await verifier.verify(await signToken(payload, { alg: "HS256", kid: "k1" })),
    ).toBeNull();
    expect(
      await verifier.verify(await signToken(payload, { alg: "ES256" })),
    ).toBeNull();
    expect(await verifier.verify("garbage")).toBeNull();
  });

  test("rejects tampered and expired tokens", async () => {
    const { jwk, signToken } = await makeKeys();
    const counter = { fetches: 0 };
    const verifier = new SupabaseJwksVerifier("https://proj.supabase.co", {
      fetch: jwksFetch([{ ...jwk, kid: "k1" }], counter),
      now: () => NOW,
    });
    const token = await signToken(payload);
    const [h, p] = token.split(".") as [string, string];
    const forged = `${h}.${Buffer.from(JSON.stringify({ ...payload, sub: "evil" })).toString("base64url")}.${token.split(".")[2]}`;
    expect(await verifier.verify(forged)).toBeNull();
    expect(
      await verifier.verify(
        await signToken({ ...payload, exp: NOW.getTime() / 1000 - 1 }),
      ),
    ).toBeNull();
    void h;
    void p;
  });

  test("handles JWKS endpoint failures", async () => {
    const { signToken } = await makeKeys();
    const counter = { fetches: 0 };
    const failing = new SupabaseJwksVerifier("https://proj.supabase.co", {
      fetch: jwksFetch([], counter, 500),
      now: () => NOW,
    });
    expect(await failing.verify(await signToken(payload))).toBeNull();
    const throwing = new SupabaseJwksVerifier("https://proj.supabase.co", {
      fetch: (async () => {
        throw new Error("network");
      }) as unknown as typeof fetch,
      now: () => NOW,
    });
    expect(await throwing.verify(await signToken(payload))).toBeNull();
    const defaults = new SupabaseJwksVerifier("https://proj.supabase.co");
    expect(await defaults.verify("garbage")).toBeNull();
  });

  test("uses the real clock by default", async () => {
    const { jwk, signToken } = await makeKeys();
    const counter = { fetches: 0 };
    const verifier = new SupabaseJwksVerifier("https://proj.supabase.co", {
      fetch: jwksFetch([{ ...jwk, kid: "k1" }], counter),
    });
    const token = await signToken({ sub: "live", exp: Date.now() / 1000 + 60 });
    expect((await verifier.verify(token))?.sub).toBe("live");
  });
});
