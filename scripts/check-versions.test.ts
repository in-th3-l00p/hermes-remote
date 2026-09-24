import { describe, expect, test } from "bun:test";
import { changelogProblems, versionProblems } from "./check-versions.ts";

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

describe("changelogProblems", () => {
  test("accepts a heading for the current version, dated or not", () => {
    expect(
      changelogProblems("# Changelog\n\n## 4.1.0 (unreleased)\n\n## 4.0.0\n", "4.1.0"),
    ).toEqual([]);
    expect(changelogProblems("## 4.1.0\n", "4.1.0")).toEqual([]);
  });

  test("flags a missing version and headings without one", () => {
    expect(changelogProblems("## Unreleased\n\n## 4.0.0\n", "4.1.0")).toEqual([
      "CHANGELOG.md has no heading for 4.1.0",
      "CHANGELOG.md heading without a version: ## Unreleased",
    ]);
  });

  test("does not take 4.1.0 for 4.1.01", () => {
    expect(changelogProblems("## 4.1.01\n", "4.1.0")).toEqual([
      "CHANGELOG.md has no heading for 4.1.0",
    ]);
  });
});
