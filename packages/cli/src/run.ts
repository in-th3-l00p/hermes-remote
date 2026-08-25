import { join } from "node:path";
import { KeyStore } from "@in-th3-l00p/hermes-remote";
import { initCommand } from "./commands/init.ts";
import { keysCommand } from "./commands/keys.ts";
import { logsCommand } from "./commands/logs.ts";
import { serveCommand } from "./commands/serve.ts";
import { serviceCommand } from "./commands/service.ts";
import { USAGE, fail, type CliContext, type CliResult } from "./context.ts";

export type { CliContext, CliResult, ServeRequest } from "./context.ts";

export async function runCli(
  args: string[],
  ctx: CliContext,
): Promise<CliResult> {
  const command = args[0];
  const store = new KeyStore(join(ctx.homeDir, "keys.json"));
  const logPath = join(ctx.homeDir, "logs", "server.log");
  const auditPath = join(ctx.homeDir, "audit.log");

  if (command === undefined || command === "help" || command === "--help") {
    return { exitCode: command === undefined ? 1 : 0, output: USAGE };
  }
  if (command === "keys") {
    return keysCommand(args.slice(1), store, ctx.now());
  }
  if (command === "service") {
    return serviceCommand(args.slice(1), ctx);
  }
  if (command === "init") {
    return initCommand(args.slice(1), ctx);
  }
  if (command === "serve") {
    return serveCommand(args.slice(1), ctx, { store, logPath, auditPath });
  }
  if (command === "logs") {
    return logsCommand(args.slice(1), logPath);
  }
  return fail(`unknown command: ${command}\n\n${USAGE}`);
}
