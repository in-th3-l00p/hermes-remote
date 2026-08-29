#!/usr/bin/env bun
import { homedir } from "node:os";
import { join } from "node:path";
import { runCli, type CliContext } from "./run.ts";
import {
  ChatStore,
  DemoAgent,
  HermesAgent,
  JwtAuthProvider,
  startServer,
} from "@in-th3-l00p/hermes-remote";

const homeDir =
  process.env["HERMES_REMOTE_HOME"] ?? join(homedir(), ".hermes-remote");

const ctx: CliContext = {
  homeDir,
  platform: process.platform,
  execPath: process.execPath,
  entryPath: import.meta.path,
  now: () => new Date(),
  env: process.env,
  which: (name) => Bun.which(name),
  serve: (request) =>
    startServer({
      port: request.port,
      store: request.store,
      logPath: request.logPath,
      auditPath: request.auditPath,
      anonymous: request.anonymous,
      corsOrigins: request.corsOrigins,
      ...(request.rateLimit === null ? {} : { rateLimit: request.rateLimit }),
      ...(request.supabaseUrl !== undefined
        ? {
            authProvider: new JwtAuthProvider({
              jwksUrl: `${request.supabaseUrl.replace(/\/+$/, "")}/auth/v1/.well-known/jwks.json`,
            }),
          }
        : request.supabaseJwtSecret !== undefined
          ? {
              authProvider: new JwtAuthProvider({
                hs256Secret: request.supabaseJwtSecret,
              }),
            }
          : {}),
      chat: {
        store: new ChatStore(join(homeDir, "chat.db")),
        agent:
          request.upstream === null
            ? new DemoAgent()
            : new HermesAgent(request.upstream),
        turns: new Map(),
      },
    }),
};

const result = await runCli(process.argv.slice(2), ctx);
console.log(result.output);
if (process.argv[2] !== "serve" || result.exitCode !== 0) {
  process.exit(result.exitCode);
}
