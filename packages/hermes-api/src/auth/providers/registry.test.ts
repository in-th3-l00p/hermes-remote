import { describe, expect, test } from "bun:test";
import { ClerkAuthProvider } from "./clerk.ts";
import { JwtAuthProvider } from "./jwt.ts";
import { createAuthProvider } from "./registry.ts";
import { SupabaseAuthProvider } from "./supabase.ts";

describe("createAuthProvider", () => {
  test("builds each provider variant", () => {
    expect(
      createAuthProvider({
        provider: "supabase",
        url: "https://proj.supabase.co",
        publishableKey: "pk",
      }),
    ).toBeInstanceOf(SupabaseAuthProvider);
    expect(
      createAuthProvider({ provider: "clerk", secretKey: "sk" }),
    ).toBeInstanceOf(ClerkAuthProvider);
    expect(
      createAuthProvider({ provider: "jwt", hs256Secret: "s" }),
    ).toBeInstanceOf(JwtAuthProvider);
    expect(createAuthProvider({ provider: "none" })).toBeNull();
  });

  test("threads the module loader through to sdk providers", async () => {
    const loaded: string[] = [];
    const loadModule = async (specifier: string) => {
      loaded.push(specifier);
      if (specifier === "@supabase/supabase-js") {
        return {
          createClient: () => ({
            auth: { getClaims: async () => ({ data: null, error: { m: 1 } }) },
          }),
        };
      }
      return { verifyToken: async () => ({ sub: "u" }) };
    };
    const supabase = createAuthProvider(
      { provider: "supabase", url: "https://x.supabase.co", publishableKey: "pk" },
      loadModule,
    );
    const clerk = createAuthProvider(
      { provider: "clerk", jwtKey: "pem" },
      loadModule,
    );
    expect(await supabase?.verify("tok")).toBeNull();
    expect(await clerk?.verify("tok")).toEqual({ sub: "u" });
    expect(loaded.sort()).toEqual(["@clerk/backend", "@supabase/supabase-js"]);
  });

  test("passes jwt options through", async () => {
    const provider = createAuthProvider({
      provider: "jwt",
      hs256Secret: "s",
      issuer: "https://issuer.example",
      audience: "aud",
    });
    expect(provider?.name).toBe("jwt");
    expect(await provider?.verify("garbage")).toBeNull();
  });
});
