import { flag, flagAll, parseArgs } from "../args.ts";
import { configPath, type ConfigFile } from "../config.ts";
import { ok, type CliContext, type CliResult } from "../context.ts";

export async function initCommand(
  args: string[],
  ctx: CliContext,
): Promise<CliResult> {
  const parsed = parseArgs(args);
  const config: ConfigFile = {};
  const port = flag(parsed, "port");
  if (port !== undefined) {
    config.port = Number(port);
  }
  const cors = flagAll(parsed, "cors");
  if (cors.length > 0) {
    config.cors = cors;
  }
  if (flag(parsed, "anonymous") === "true") {
    config.anonymous = true;
  }
  for (const [flagName, key] of [
    ["upstream", "upstreamUrl"],
    ["upstream-key", "upstreamKey"],
    ["model", "upstreamModel"],
    ["supabase-url", "supabaseUrl"],
    ["supabase-jwt-secret", "supabaseJwtSecret"],
  ] as const) {
    const value = flag(parsed, flagName);
    if (value !== undefined) {
      config[key] = value;
    }
  }
  const rateLimit = flag(parsed, "rate-limit");
  if (rateLimit !== undefined) {
    config.rateLimit = {
      limit: Number(rateLimit),
      windowSeconds: Number(flag(parsed, "rate-window") ?? "60"),
    };
  }
  const path = configPath(ctx.homeDir);
  await Bun.write(path, `${JSON.stringify(config, null, 2)}\n`);
  return ok(`wrote ${path}\n${JSON.stringify(config, null, 2)}`);
}
