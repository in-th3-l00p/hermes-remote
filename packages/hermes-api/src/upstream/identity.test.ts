import { describe, expect, test } from "bun:test";
import { injectRunIdentity } from "./identity.ts";
import type { Principal } from "../auth/index.ts";

const principal: Principal = { type: "user", userId: "u-1" };

describe("injectRunIdentity", () => {
  test("prefixes string inputs with the identity preamble", () => {
    const result = injectRunIdentity({ input: "do the thing" }, principal);
    const input = result["input"] as string;
    expect(input).toContain("<user-context>");
    expect(input).toContain("u-1");
    expect(input.endsWith("do the thing")).toBe(true);
  });

  test("prepends a system entry to array inputs", () => {
    const result = injectRunIdentity(
      { input: [{ role: "user", content: "hi" }] },
      principal,
    );
    const input = result["input"] as { role: string; content: string }[];
    expect(input).toHaveLength(2);
    expect(input[0]?.role).toBe("system");
    expect(input[0]?.content).toContain("<user-context>");
    expect(input[1]).toEqual({ role: "user", content: "hi" });
  });

  test("leaves bodies with missing or non-text inputs untouched", () => {
    const missing = { model: "demo" };
    expect(injectRunIdentity(missing, principal)).toBe(missing);
    const numeric = { input: 42 };
    expect(injectRunIdentity(numeric, principal)).toBe(numeric);
  });
});
