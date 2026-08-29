import { describe, expect, test } from "bun:test";
import { createHmac } from "node:crypto";
import { JwtAuthProvider } from "./jwt.ts";

const SECRET = "super-secret";
const NOW = new Date("2026-08-24T00:00:00Z");
const JWKS_URL = "https://auth.example.com/.well-known/jwks.json";

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

function hs256Provider(
  extra: Partial<ConstructorParameters<typeof JwtAuthProvider>[0]> = {},
): JwtAuthProvider {
  return new JwtAuthProvider({ hs256Secret: SECRET, now: () => NOW, ...extra });
}

describe("JwtAuthProvider hs256", () => {
  test("accepts a valid token", async () => {
    expect(await hs256Provider().verify(sign(valid))).toEqual({
      sub: "user-1",
      email: "a@b.c",
      isAnonymous: true,
    });
  });

  test("omits optional claims when absent or empty", async () => {
    const provider = hs256Provider();
    expect(await provider.verify(sign({ sub: "u", exp: valid.exp }))).toEqual({
      sub: "u",
    });
    expect(
      await provider.verify(sign({ sub: "u", email: "", exp: valid.exp })),
    ).toEqual({ sub: "u" });
  });

  test("rejects malformed tokens", async () => {
    const provider = hs256Provider();
    expect(await provider.verify("nope")).toBeNull();
    expect(await provider.verify("a.b.c")).toBeNull();
    const [h, p] = sign(valid).split(".");
    expect(await provider.verify(`${h}.${p}.!!!!`)).toBeNull();
  });

  test("rejects wrong secret, wrong alg, expiry, and bad sub", async () => {
    const provider = hs256Provider();
    expect(await provider.verify(sign(valid, "other"))).toBeNull();
    expect(await provider.verify(sign(valid, SECRET, "none"))).toBeNull();
    expect(
      await provider.verify(sign({ ...valid, exp: NOW.getTime() / 1000 - 1 })),
    ).toBeNull();
    expect(await provider.verify(sign({ ...valid, exp: "soon" }))).toBeNull();
    expect(await provider.verify(sign({ ...valid, sub: "" }))).toBeNull();
    expect(await provider.verify(sign({ exp: valid.exp }))).toBeNull();
  });

  test("enforces issuer when configured", async () => {
    const provider = hs256Provider({ issuer: "https://issuer.example" });
    expect(
      await provider.verify(
        sign({ ...valid, iss: "https://issuer.example" }),
      ),
    ).not.toBeNull();
    expect(
      await provider.verify(sign({ ...valid, iss: "https://evil.example" })),
    ).toBeNull();
    expect(await provider.verify(sign(valid))).toBeNull();
  });

  test("enforces audience against string and array claims", async () => {
    const provider = hs256Provider({ audience: "my-api" });
    expect(
      await provider.verify(sign({ ...valid, aud: "my-api" })),
    ).not.toBeNull();
    expect(
      await provider.verify(sign({ ...valid, aud: ["other", "my-api"] })),
    ).not.toBeNull();
    expect(await provider.verify(sign({ ...valid, aud: "other" }))).toBeNull();
    expect(await provider.verify(sign({ ...valid, aud: 7 }))).toBeNull();
    expect(await provider.verify(sign(valid))).toBeNull();
  });

  test("uses the real clock by default", async () => {
    const provider = new JwtAuthProvider({ hs256Secret: SECRET });
    expect(
      (await provider.verify(sign({ sub: "u", exp: Date.now() / 1000 + 60 })))
        ?.sub,
    ).toBe("u");
  });
});

describe("JwtAuthProvider jwks", () => {
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
      expect(String(url)).toBe(JWKS_URL);
      return Response.json({ keys }, { status });
    }) as unknown as typeof fetch;
  }

  function jwksProvider(
    fetchImpl: typeof fetch,
    extra: Partial<ConstructorParameters<typeof JwtAuthProvider>[0]> = {},
  ): JwtAuthProvider {
    return new JwtAuthProvider({
      jwksUrl: JWKS_URL,
      fetch: fetchImpl,
      now: () => NOW,
      ...extra,
    });
  }

  const payload = {
    sub: "es-user",
    email: "e@s.io",
    exp: NOW.getTime() / 1000 + 3600,
  };

  test("verifies ES256 tokens and caches the JWKS", async () => {
    const { jwk, signToken } = await makeKeys();
    const counter = { fetches: 0 };
    const provider = jwksProvider(
      jwksFetch(
        [
          { ...jwk, kid: "k1", alg: "ES256" },
          { kty: "RSA", kid: "skip-me" },
          { ...jwk, kid: undefined },
        ],
        counter,
      ),
    );
    const token = await signToken(payload);
    expect(await provider.verify(token)).toEqual({
      sub: "es-user",
      email: "e@s.io",
    });
    expect(await provider.verify(token)).not.toBeNull();
    expect(counter.fetches).toBe(1);
  });

  test("rejects unknown kid, wrong alg, missing kid, malformed", async () => {
    const { jwk, signToken } = await makeKeys();
    const counter = { fetches: 0 };
    const provider = jwksProvider(jwksFetch([{ ...jwk, kid: "k1" }], counter));
    expect(
      await provider.verify(
        await signToken(payload, { alg: "ES256", kid: "other" }),
      ),
    ).toBeNull();
    expect(
      await provider.verify(
        await signToken(payload, { alg: "HS256", kid: "k1" }),
      ),
    ).toBeNull();
    expect(
      await provider.verify(await signToken(payload, { alg: "ES256" })),
    ).toBeNull();
    expect(await provider.verify("garbage")).toBeNull();
  });

  test("rejects tampered and expired tokens", async () => {
    const { jwk, signToken } = await makeKeys();
    const counter = { fetches: 0 };
    const provider = jwksProvider(jwksFetch([{ ...jwk, kid: "k1" }], counter));
    const token = await signToken(payload);
    const [h] = token.split(".") as [string];
    const forged = `${h}.${Buffer.from(
      JSON.stringify({ ...payload, sub: "evil" }),
    ).toString("base64url")}.${token.split(".")[2]}`;
    expect(await provider.verify(forged)).toBeNull();
    expect(
      await provider.verify(
        await signToken({ ...payload, exp: NOW.getTime() / 1000 - 1 }),
      ),
    ).toBeNull();
  });

  test("handles JWKS endpoint failures", async () => {
    const { signToken } = await makeKeys();
    const counter = { fetches: 0 };
    const failing = jwksProvider(jwksFetch([], counter, 500));
    expect(await failing.verify(await signToken(payload))).toBeNull();
    const throwing = jwksProvider((async () => {
      throw new Error("network");
    }) as unknown as typeof fetch);
    expect(await throwing.verify(await signToken(payload))).toBeNull();
  });

  test("uses the real fetch and clock by default", async () => {
    const provider = new JwtAuthProvider({ jwksUrl: JWKS_URL });
    expect(await provider.verify("garbage")).toBeNull();
  });

  test("uses the real clock with an injected fetch", async () => {
    const { jwk, signToken } = await makeKeys();
    const counter = { fetches: 0 };
    const provider = new JwtAuthProvider({
      jwksUrl: JWKS_URL,
      fetch: jwksFetch([{ ...jwk, kid: "k1" }], counter),
    });
    const token = await signToken({ sub: "live", exp: Date.now() / 1000 + 60 });
    expect((await provider.verify(token))?.sub).toBe("live");
  });
});

describe("JwtAuthProvider configuration", () => {
  test("requires a verification mechanism", () => {
    expect(() => new JwtAuthProvider({})).toThrow(
      "jwt auth provider requires jwksUrl or hs256Secret",
    );
  });

  test("is named jwt", () => {
    expect(new JwtAuthProvider({ hs256Secret: SECRET }).name).toBe("jwt");
  });

  test("dispatches on alg when both mechanisms are configured", async () => {
    const provider = new JwtAuthProvider({
      hs256Secret: SECRET,
      jwksUrl: JWKS_URL,
      fetch: (async () => Response.json({ keys: [] })) as unknown as typeof fetch,
      now: () => NOW,
    });
    expect((await provider.verify(sign(valid)))?.sub).toBe("user-1");
    expect(
      await provider.verify(sign(valid, SECRET, "ES256")),
    ).toBeNull();
  });
});
