#!/usr/bin/env bun
import { homedir } from "node:os";
import { join } from "node:path";
import { runCli, type CliContext } from "./cli/run.ts";
import { startServer } from "./server.ts";

const ctx: CliContext = {
  homeDir: process.env["HERMES_API_HOME"] ?? join(homedir(), ".hermes-api"),
  now: () => new Date(),
  serve: (request) =>
    startServer({
      port: request.port,
      store: request.store,
      logPath: request.logPath,
    }),
};

const result = await runCli(process.argv.slice(2), ctx);
console.log(result.output);
if (process.argv[2] !== "serve" || result.exitCode !== 0) {
  process.exit(result.exitCode);
}
