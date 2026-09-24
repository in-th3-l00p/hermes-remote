import { describe, expect, test } from "bun:test";
import { versionProblems } from "./check-versions.ts";

describe("versionProblems", () => {
  const server = { name: "server", version: "4.1.0" };

  test("accepts a caret range on the current version", () => {
    expect(
      versionProblems([
        server,
        { name: "cli", version: "4.1.0", dependencies: { server: "^4.1.0" } },
      ]),
    ).toEqual([]);
  });

  test("flags a range left behind by a bump", () => {
    expect(
      versionProblems([
        server,
        { name: "cli", version: "4.1.0", dependencies: { server: "^4.0.0" } },
      ]),
    ).toEqual(["cli depends on server@^4.0.0, expected ^4.1.0"]);
  });

  test("ignores third-party dependencies and manifests without any", () => {
    expect(
      versionProblems([server, { name: "cli", version: "1.0.0", dependencies: { hono: "^4" } }]),
    ).toEqual([]);
  });
});
