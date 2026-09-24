import { appendFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { KeyStore } from "@intheloop-studio/hermes-remote";
import { initCommand } from "./commands/init.ts";
import { keysCommand } from "./commands/keys.ts";
import { logsCommand } from "./commands/logs.ts";
import { serveCommand } from "./commands/serve.ts";
import { serviceCommand } from "./commands/service.ts";
import { USAGE, fail, type CliContext, type CliResult } from "./context.ts";

export type { CliContext, CliResult, ServeRequest } from "./context.ts";

const KEY_MUTATIONS = new Set(["create", "revoke", "rotate", "grant", "ungrant"]);

/** Key changes made on the host land in the same audit log as API traffic. */
async function recordKeyAction(
  auditPath: string,
  now: Date,
  action: string,
  id: string | undefined,
): Promise<void> {
  const entry = {
    at: now.toISOString(),
    method: "CLI",
    path: `keys ${action}${action === "create" || id === undefined ? "" : ` ${id}`}`,
    status: 0,
    principal: "host",
  };
  await mkdir(dirname(auditPath), { recursive: true });
  await appendFile(auditPath, `${JSON.stringify(entry)}\n`, { mode: 0o600 });
}

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
    const result = await keysCommand(args.slice(1), store, ctx.now());
    const action = args[1];
    if (result.exitCode === 0 && action !== undefined && KEY_MUTATIONS.has(action)) {
      await recordKeyAction(auditPath, ctx.now(), action, args[2]);
    }
    return result;
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
