// Keeps the published packages pointing at each other's current versions:
// the CLI must depend on the server library it ships with, and the React
// hooks on the client they were built against. Run in CI and before release.
import { readFileSync } from "node:fs";
import { join } from "node:path";

export interface Manifest {
  name: string;
  version: string;
  dependencies?: Record<string, string>;
}

/** Each dependency between the given manifests must be exactly `^<version>`. */
export function versionProblems(manifests: Manifest[]): string[] {
  const versions = new Map(manifests.map((m) => [m.name, m.version]));
  const problems: string[] = [];
  for (const m of manifests) {
    for (const [dep, range] of Object.entries(m.dependencies ?? {})) {
      const current = versions.get(dep);
      if (current !== undefined && range !== `^${current}`) {
        problems.push(`${m.name} depends on ${dep}@${range}, expected ^${current}`);
      }
    }
  }
  return problems;
}

/**
 * The changelog needs a heading for the current version, and every version
 * heading names its version: a bare "Unreleased" hides which release it is.
 */
export function changelogProblems(changelog: string, version: string): string[] {
  const headings = changelog.split("\n").filter((line) => line.startsWith("## "));
  const problems: string[] = [];
  if (!headings.some((h) => h.startsWith(`## ${version} `) || h === `## ${version}`)) {
    problems.push(`CHANGELOG.md has no heading for ${version}`);
  }
  for (const h of headings) {
    if (!/^## \d+\.\d+\.\d+/.test(h)) {
      problems.push(`CHANGELOG.md heading without a version: ${h}`);
    }
  }
  return problems;
}

export const PUBLISHED = ["hermes-api", "cli", "hermes-ts", "react-hermes"];

if (import.meta.main) {
  const root = join(import.meta.dir, "..");
  const manifests = PUBLISHED.map(
    (dir) =>
      JSON.parse(readFileSync(join(root, "packages", dir, "package.json"), "utf8")) as Manifest,
  );
  const problems = [
    ...versionProblems(manifests),
    ...changelogProblems(readFileSync(join(root, "CHANGELOG.md"), "utf8"), manifests[0]!.version),
  ];
  for (const p of problems) {
    console.error(p);
  }
  if (problems.length > 0) {
    process.exit(1);
  }
  console.log("package versions and changelog in sync");
}
