import { cpSync, existsSync } from "node:fs";
import { join } from "node:path";

const EXAMPLES = [
  "chat",
  "auth",
  "configuration",
  "runs",
  "profiles",
  "command-center",
];

const root = join(import.meta.dir, "..", "..", "..");
let copied = 0;
for (const name of EXAMPLES) {
  const source = join(root, "apps", "examples", name, "dist");
  if (!existsSync(source)) {
    console.error(`missing build for example: ${name} (${source})`);
    process.exit(1);
  }
  const target = join(import.meta.dir, "..", "dist", "examples", name, "app");
  cpSync(source, target, { recursive: true });
  copied += 1;
}
console.log(`copied ${copied} example apps into dist/examples/*/app`);
