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

export const PUBLISHED = ["hermes-api", "cli", "hermes-ts", "react-hermes"];

if (import.meta.main) {
  const root = join(import.meta.dir, "..");
  const manifests = PUBLISHED.map(
    (dir) =>
      JSON.parse(readFileSync(join(root, "packages", dir, "package.json"), "utf8")) as Manifest,
  );
  const problems = versionProblems(manifests);
  for (const p of problems) {
    console.error(p);
  }
  if (problems.length > 0) {
    process.exit(1);
  }
  console.log("package versions in sync");
}
