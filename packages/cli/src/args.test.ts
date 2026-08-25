import { describe, expect, test } from "bun:test";
import { flag, flagAll, parseArgs, parseDuration } from "./args.ts";

describe("parseArgs", () => {
  test("collects positionals and flags in all forms", () => {
    const parsed = parseArgs([
      "create",
      "--name",
      "ci",
      "--scope=chat:invoke",
      "--scope",
      "sessions:read",
      "--dangerous",
    ]);
    expect(parsed.positionals).toEqual(["create"]);
    expect(flag(parsed, "name")).toBe("ci");
    expect(parsed.flags.get("scope")).toEqual(["chat:invoke", "sessions:read"]);
    expect(flag(parsed, "dangerous")).toBe("true");
  });

  test("boolean flag followed by another flag", () => {
    const parsed = parseArgs(["--dry-run", "--name", "x"]);
    expect(flag(parsed, "dry-run")).toBe("true");
    expect(flag(parsed, "name")).toBe("x");
  });

  test("flag returns last value and undefined when absent", () => {
    const parsed = parseArgs(["--port", "1", "--port", "2"]);
    expect(flag(parsed, "port")).toBe("2");
    expect(flag(parsed, "missing")).toBeUndefined();
  });

  test("flagAll splits comma-separated values", () => {
    const parsed = parseArgs(["--scope", "a,b", "--scope", "c"]);
    expect(flagAll(parsed, "scope")).toEqual(["a", "b", "c"]);
    expect(flagAll(parsed, "missing")).toEqual([]);
  });
});

describe("parseDuration", () => {
  test("parses minutes, hours, days", () => {
    expect(parseDuration("30m")).toBe(1_800_000);
    expect(parseDuration("12h")).toBe(43_200_000);
    expect(parseDuration("90d")).toBe(7_776_000_000);
  });

  test("rejects invalid values", () => {
    expect(parseDuration("90")).toBeNull();
    expect(parseDuration("d90")).toBeNull();
    expect(parseDuration("1w")).toBeNull();
  });
});
