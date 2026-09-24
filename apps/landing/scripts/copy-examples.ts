// Copies the reference chat app's build into the site at /examples/chat/app/.
import { cpSync, existsSync } from "node:fs";
import { join } from "node:path";

const source = join(import.meta.dir, "..", "..", "chat", "dist");
if (!existsSync(source)) {
  console.error(`missing build of the chat app: ${source} (run build:examples first)`);
  process.exit(1);
}
cpSync(source, join(import.meta.dir, "..", "dist", "examples", "chat", "app"), { recursive: true });
console.log("copied the chat app into dist/examples/chat/app");
