import type { KeyStore } from "@in-th3-l00p/hermes-remote";
import { flag, flagAll, parseArgs } from "../args.ts";
import { loadConfig } from "../config.ts";
import {
  fail,
  ok,
  type CliContext,
  type CliResult,
  type ServeRequest,
} from "../context.ts";

export interface ServePaths {
  store: KeyStore;
  logPath: string;
  auditPath: string;
}

export async function serveCommand(
  args: string[],
  ctx: CliContext,
  paths: ServePaths,
): Promise<CliResult> {
  const parsed = parseArgs(args);
  const config = await loadConfig(ctx.homeDir);
  const portText = flag(parsed, "port") ?? String(config.port ?? 8643);
  const port = Number(portText);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    return fail(`invalid --port: ${portText}`);
  }
  const upstreamUrl =
    flag(parsed, "upstream") ??
    ctx.env["HERMES_UPSTREAM_URL"] ??
    config.upstreamUrl;
  const upstreamKey =
    flag(parsed, "upstream-key") ??
    ctx.env["HERMES_UPSTREAM_KEY"] ??
    config.upstreamKey;
  let upstream: ServeRequest["upstream"] = null;
  if (upstreamUrl !== undefined) {
    if (upstreamKey === undefined) {
      return fail(
        "an upstream requires a key: pass --upstream-key or set HERMES_UPSTREAM_KEY",
      );
    }
    const model =
      flag(parsed, "model") ??
      ctx.env["HERMES_UPSTREAM_MODEL"] ??
      config.upstreamModel;
    upstream = {
      baseUrl: upstreamUrl,
      apiKey: upstreamKey,
      ...(model === undefined ? {} : { model }),
    };
  }
  const corsFlags = flagAll(parsed, "cors");
  const rateLimitFlag = flag(parsed, "rate-limit");
  const running = await ctx.serve({
    port,
    store: paths.store,
    logPath: paths.logPath,
    auditPath: paths.auditPath,
    anonymous: flag(parsed, "anonymous") === "true" || config.anonymous === true,
    corsOrigins: corsFlags.length > 0 ? corsFlags : (config.cors ?? []),
    supabaseJwtSecret:
      flag(parsed, "supabase-jwt-secret") ??
      ctx.env["SUPABASE_JWT_SECRET"] ??
      config.supabaseJwtSecret,
    supabaseUrl:
      flag(parsed, "supabase-url") ??
      ctx.env["SUPABASE_URL"] ??
      config.supabaseUrl,
    rateLimit:
      rateLimitFlag !== undefined
        ? {
            limit: Number(rateLimitFlag),
            windowSeconds: Number(flag(parsed, "rate-window") ?? "60"),
          }
        : (config.rateLimit ?? null),
    upstream,
  });
  return ok(
    `hermes-remote listening on port ${running.port}\n` +
      `agent: ${upstream === null ? "demo (no upstream configured)" : upstream.baseUrl}\n` +
      `logs: ${paths.logPath}`,
  );
}
