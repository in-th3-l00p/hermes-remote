import { chmod, mkdir, writeFile } from "node:fs/promises";
import { flag, flagAll, parseArgs } from "../args.ts";
import { configPath, loadConfig, type ConfigFile } from "../config.ts";
import { fail, ok, type CliContext, type CliResult } from "../context.ts";

export async function initCommand(
  args: string[],
  ctx: CliContext,
): Promise<CliResult> {
  const parsed = parseArgs(args);
  const loaded = await loadConfig(ctx.homeDir);
  if (!loaded.ok) {
    return fail(loaded.error);
  }
  const config: ConfigFile = { ...loaded.config };
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
  // config.json holds secrets (upstreamKey, supabaseJwtSecret): owner-only perms.
  await mkdir(ctx.homeDir, { recursive: true, mode: 0o700 });
  await writeFile(path, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  await chmod(path, 0o600);
  return ok(`wrote ${path}\n${JSON.stringify(config, null, 2)}`);
}
