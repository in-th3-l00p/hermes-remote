import { describe, expect, test } from "bun:test";
import { SupabaseAuthProvider } from "./supabase.ts";
import type { ModuleLoader } from "./types.ts";

interface ClaimsResult {
  data: { claims: Record<string, unknown> } | null;
  error: { message: string } | null;
}

function fakeSdk(
  result: ClaimsResult | (() => Promise<ClaimsResult>),
  calls: { url?: string; key?: string; options?: unknown; tokens: string[] },
): ModuleLoader {
  return async (specifier) => {
    expect(specifier).toBe("@supabase/supabase-js");
    return {
      createClient: (url: string, key: string, options: unknown) => {
        calls.url = url;
        calls.key = key;
        calls.options = options;
        return {
          auth: {
            getClaims: async (token: string) => {
              calls.tokens.push(token);
              return typeof result === "function" ? result() : result;
            },
          },
        };
      },
    };
  };
}

function provider(
  loadModule: ModuleLoader,
): SupabaseAuthProvider {
  return new SupabaseAuthProvider({
    url: "https://proj.supabase.co",
    publishableKey: "pk-1",
    loadModule,
  });
}

describe("SupabaseAuthProvider", () => {
  test("verifies claims through the sdk and reuses the client", async () => {
    const calls = { tokens: [] as string[] } as Parameters<typeof fakeSdk>[1];
    const auth = provider(
      fakeSdk(
        {
          data: {
            claims: { sub: "u-1", email: "a@b.c", is_anonymous: false },
          },
          error: null,
        },
        calls,
      ),
    );
    expect(await auth.verify("tok-1")).toEqual({
      sub: "u-1",
      email: "a@b.c",
      isAnonymous: false,
    });
    expect(await auth.verify("tok-2")).not.toBeNull();
    expect(calls.url).toBe("https://proj.supabase.co");
    expect(calls.key).toBe("pk-1");
    expect(calls.options).toEqual({
      auth: { persistSession: false, autoRefreshToken: false },
    });
    expect(calls.tokens).toEqual(["tok-1", "tok-2"]);
  });

  test("omits empty optional claims", async () => {
    const calls = { tokens: [] as string[] } as Parameters<typeof fakeSdk>[1];
    const auth = provider(
      fakeSdk({ data: { claims: { sub: "u-2", email: "" } }, error: null }, calls),
    );
    expect(await auth.verify("tok")).toEqual({ sub: "u-2" });
  });

  test("returns null on sdk error, missing claims, or bad sub", async () => {
    const calls = { tokens: [] as string[] } as Parameters<typeof fakeSdk>[1];
    expect(
      await provider(
        fakeSdk({ data: null, error: { message: "bad jwt" } }, calls),
      ).verify("tok"),
    ).toBeNull();
    expect(
      await provider(
        fakeSdk({ data: { claims: { sub: "" } }, error: null }, calls),
      ).verify("tok"),
    ).toBeNull();
    expect(
      await provider(
        fakeSdk({ data: { claims: {} }, error: null }, calls),
      ).verify("tok"),
    ).toBeNull();
  });

  test("returns null when getClaims throws", async () => {
    const calls = { tokens: [] as string[] } as Parameters<typeof fakeSdk>[1];
    const auth = provider(
      fakeSdk(async () => {
        throw new Error("network");
      }, calls),
    );
    expect(await auth.verify("tok")).toBeNull();
  });

  test("names the missing peer dependency", async () => {
    const auth = provider(async () => {
      throw new Error("Cannot find module");
    });
    expect(auth.verify("tok")).rejects.toThrow(
      'auth provider "supabase" requires the optional peer dependency @supabase/supabase-js',
    );
  });

  test("loads the real sdk by default and fails closed on a fake token", async () => {
    const auth = new SupabaseAuthProvider({
      url: "http://127.0.0.1:1",
      publishableKey: "pk",
    });
    expect(await auth.verify("not-a-jwt")).toBeNull();
  });

  test("is named supabase", () => {
    const auth = provider(async () => ({}));
    expect(auth.name).toBe("supabase");
  });
});
