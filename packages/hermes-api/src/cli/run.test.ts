import { describe, expect, test } from "bun:test";
import { runCli } from "./run.ts";

describe("runCli", () => {
  test("no args prints usage and fails", () => {
    const result = runCli([]);
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("hermes-api <command>");
  });

  test("help prints usage and succeeds", () => {
    for (const flag of ["help", "--help"]) {
      const result = runCli([flag]);
      expect(result.exitCode).toBe(0);
      expect(result.output).toContain("Commands:");
    }
  });

  test("unknown command fails with message", () => {
    const result = runCli(["bogus"]);
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("unknown command: bogus");
  });
});
