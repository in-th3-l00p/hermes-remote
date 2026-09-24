import { readFileSync } from "node:fs";

/** The installed @intheloop-studio/hermes-remote version, from package.json. */
export const VERSION: string = (
  JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
    version: string;
  }
).version;
