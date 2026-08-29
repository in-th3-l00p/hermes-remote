#!/usr/bin/env bun
/**
 * Parses every ts/tsx code fence in the docs with Bun's transpiler so syntax
 * errors in documentation fail CI. Fragments are allowed; parse errors are not.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const SCAN_DIRS = [
  join(import.meta.dir, "..", "apps", "landing", "docs"),
  join(import.meta.dir, "..", "apps", "landing", "examples", "articles"),
];

function* markdownFiles(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    if (entry.startsWith(".")) {
      continue;
    }
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      yield* markdownFiles(path);
    } else if (path.endsWith(".md")) {
      yield path;
    }
  }
}

let checked = 0;
let failed = 0;
for (const file of SCAN_DIRS.flatMap((dir) => [...markdownFiles(dir)])) {
  const text = readFileSync(file, "utf8");
  const fences = [...text.matchAll(/```(ts|tsx)\n([\s\S]*?)```/g)];
  for (const [, lang, code] of fences) {
    checked += 1;
    try {
      new Bun.Transpiler({ loader: lang as "ts" | "tsx" }).transformSync(
        code as string,
      );
    } catch (error) {
      failed += 1;
      console.error(`✗ ${file}:`);
      console.error(String(error));
    }
  }
}
console.log(`${checked} snippets parsed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
