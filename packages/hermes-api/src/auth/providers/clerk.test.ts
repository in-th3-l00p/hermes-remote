import { describe, expect, test } from "bun:test";
import { ClerkAuthProvider } from "./clerk.ts";
import type { ModuleLoader } from "./types.ts";

function fakeSdk(
  result: Record<string, unknown> | (() => Promise<Record<string, unknown>>),
  calls: { tokens: string[]; options: unknown[] },
): ModuleLoader {
  return async (specifier) => {
    expect(specifier).toBe("@clerk/backend");
    return {
      verifyToken: async (token: string, options: unknown) => {
        calls.tokens.push(token);
        calls.options.push(options);
        return typeof result === "function" ? result() : result;
      },
    };
  };
}

describe("ClerkAuthProvider", () => {
  test("passes token and verification options through the sdk", async () => {
    const calls = { tokens: [] as string[], options: [] as unknown[] };
    const auth = new ClerkAuthProvider({
      secretKey: "sk_test_1",
      audience: "my-api",
      authorizedParties: ["https://app.example.com"],
      loadModule: fakeSdk({ sub: "user_1", email: "a@b.c" }, calls),
    });
    expect(await auth.verify("tok-1")).toEqual({
      sub: "user_1",
      email: "a@b.c",
    });
    expect(calls.tokens).toEqual(["tok-1"]);
    expect(calls.options).toEqual([
      {
        secretKey: "sk_test_1",
        audience: "my-api",
        authorizedParties: ["https://app.example.com"],
      },
    ]);
  });

  test("supports networkless verification via jwtKey", async () => {
    const calls = { tokens: [] as string[], options: [] as unknown[] };
    const auth = new ClerkAuthProvider({
      jwtKey: "pem-key",
      loadModule: fakeSdk({ sub: "user_2" }, calls),
    });
    expect(await auth.verify("tok")).toEqual({ sub: "user_2" });
    expect(calls.options).toEqual([{ jwtKey: "pem-key" }]);
  });

  test("omits email when absent or empty", async () => {
    const calls = { tokens: [] as string[], options: [] as unknown[] };
    const auth = new ClerkAuthProvider({
      secretKey: "sk",
      loadModule: fakeSdk({ sub: "user_3", email: "" }, calls),
    });
    expect(await auth.verify("tok")).toEqual({ sub: "user_3" });
  });

  test("returns null when verification throws or sub is missing", async () => {
    const calls = { tokens: [] as string[], options: [] as unknown[] };
    const rejecting = new ClerkAuthProvider({
      secretKey: "sk",
      loadModule: fakeSdk(async () => {
        throw new Error("invalid token");
      }, calls),
    });
    expect(await rejecting.verify("tok")).toBeNull();
    const subless = new ClerkAuthProvider({
      secretKey: "sk",
      loadModule: fakeSdk({ email: "a@b.c" }, calls),
    });
    expect(await subless.verify("tok")).toBeNull();
  });

  test("requires a secretKey or jwtKey", () => {
    expect(() => new ClerkAuthProvider({})).toThrow(
      "clerk auth provider requires secretKey or jwtKey",
    );
  });

  test("names the missing peer dependency", async () => {
    const auth = new ClerkAuthProvider({
      secretKey: "sk",
      loadModule: async () => {
        throw new Error("Cannot find module");
      },
    });
    expect(auth.verify("tok")).rejects.toThrow(
      'auth provider "clerk" requires the optional peer dependency @clerk/backend',
    );
  });

  test("loads the real sdk by default and fails closed on a fake token", async () => {
    const auth = new ClerkAuthProvider({ jwtKey: "not-a-real-pem" });
    expect(await auth.verify("not-a-jwt")).toBeNull();
  });

  test("is named clerk", () => {
    expect(new ClerkAuthProvider({ secretKey: "sk" }).name).toBe("clerk");
  });
});
