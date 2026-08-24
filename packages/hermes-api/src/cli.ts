#!/usr/bin/env bun
import { homedir } from "node:os";
import { join } from "node:path";
import { runCli, type CliContext } from "./cli/run.ts";
import { startServer } from "./server.ts";
import { ChatStore } from "./chat/store.ts";
import { DemoAgent, HermesAgent } from "./chat/agent.ts";

const homeDir =
  process.env["HERMES_API_HOME"] ?? join(homedir(), ".hermes-api");

const ctx: CliContext = {
  homeDir,
  now: () => new Date(),
  env: process.env,
  serve: (request) =>
    startServer({
      port: request.port,
      store: request.store,
      logPath: request.logPath,
      anonymous: request.anonymous,
      ...(request.corsOrigin === undefined
        ? {}
        : { corsOrigin: request.corsOrigin }),
      ...(request.supabaseJwtSecret === undefined
        ? {}
        : { supabaseJwtSecret: request.supabaseJwtSecret }),
      chat: {
        store: new ChatStore(join(homeDir, "chat.db")),
        agent:
          request.upstream === null
            ? new DemoAgent()
            : new HermesAgent(request.upstream),
      },
    }),
};

const result = await runCli(process.argv.slice(2), ctx);
console.log(result.output);
if (process.argv[2] !== "serve" || result.exitCode !== 0) {
  process.exit(result.exitCode);
}
