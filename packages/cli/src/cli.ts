#!/usr/bin/env bun
import { homedir } from "node:os";
import { join } from "node:path";
import { runCli, type CliContext } from "./run.ts";
import {
  ChatStore,
  createAuthProvider,
  DemoUpstream,
  HermesCliBridge,
  HermesUpstream,
  ProfileRegistry,
  RunStore,
  startServer,
} from "@intheloop-studio/hermes-remote";

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
  serve: (request) => {
    const authProvider = createAuthProvider(
      request.auth ?? { provider: "none" },
    );
    const upstream =
      request.upstream === null
        ? new DemoUpstream()
        : new HermesUpstream(request.upstream);
    const cli = new HermesCliBridge({ binary: request.hermesBinary });
    const hermesHome =
      process.env["HERMES_HOME"] ?? join(homedir(), ".hermes");
    const profileHome = (name: string): string =>
      request.profileHomes[name] ?? join(hermesHome, "profiles", name);
    return startServer({
      port: request.port,
      store: request.store,
      logPath: request.logPath,
      auditPath: request.auditPath,
      anonymous: request.anonymous,
      corsOrigins: request.corsOrigins,
      ...(request.rateLimit === null ? {} : { rateLimit: request.rateLimit }),
      ...(authProvider === null ? {} : { authProvider }),
      upstream: { upstream, runStore: new RunStore(join(homeDir, "chat.db")) },
      commandRelay: request.commandRelay,
      management: {
        cli,
        profiles: new ProfileRegistry({ cli, homeFor: profileHome }),
        homeFor: (profile) =>
          profile === null ? hermesHome : profileHome(profile),
      },
      chat: {
        store: new ChatStore(join(homeDir, "chat.db")),
        agent: upstream.chat,
        turns: new Map(),
      },
    });
  },
};

const result = await runCli(process.argv.slice(2), ctx);
console.log(result.output);
if (process.argv[2] !== "serve" || result.exitCode !== 0) {
  process.exit(result.exitCode);
}
