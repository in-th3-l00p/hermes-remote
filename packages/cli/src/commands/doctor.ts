import { existsSync } from "node:fs";
import { join } from "node:path";
import { isDangerousScope, type KeyStore } from "@intheloop-studio/hermes-remote";
import { loadConfig } from "../config.ts";
import { fail, ok, type CliContext, type CliResult } from "../context.ts";

type Level = "ok" | "warn" | "error";
const MARK: Record<Level, string> = { ok: "✓", warn: "!", error: "✗" };

/**
 * `hermes-remote doctor`: checks the local setup and reports what is wrong
 * or risky. Exits non-zero only for errors; warnings are advice.
 */
export async function doctorCommand(ctx: CliContext, store: KeyStore): Promise<CliResult> {
  const lines: [Level, string][] = [];
  const add = (level: Level, text: string) => lines.push([level, text]);

  const loaded = await loadConfig(ctx.homeDir);
  if (!loaded.ok) {
    add("error", loaded.error);
  } else {
    add(
      "ok",
      existsSync(join(ctx.homeDir, "config.json"))
        ? "config.json is valid"
        : "no config.json (defaults apply)",
    );
  }
  const config = loaded.ok ? loaded.config : {};

  const keys = await store.list();
  const now = ctx.now().getTime();
  const live = keys.filter(
    (k) => !k.revoked && (k.expiresAt === null || Date.parse(k.expiresAt) > now),
  );
  add(live.length > 0 ? "ok" : "warn", `${live.length} usable API key(s)`);
  const expired = keys.filter(
    (k) => !k.revoked && k.expiresAt !== null && Date.parse(k.expiresAt) <= now,
  );
  if (expired.length > 0) {
    add(
      "warn",
      `${expired.length} expired key(s) not revoked: ${expired.map((k) => k.id).join(", ")}`,
    );
  }
  const risky = live.filter((k) => k.expiresAt === null && k.scopes.some(isDangerousScope));
  if (risky.length > 0) {
    add("warn", `key(s) with dangerous scopes and no expiry: ${risky.map((k) => k.id).join(", ")}`);
  }

  const binary = config.hermesBinary ?? "hermes";
  const resolved = binary.includes("/") ? (existsSync(binary) ? binary : null) : ctx.which(binary);
  add(
    resolved === null ? "warn" : "ok",
    resolved === null
      ? `hermes binary "${binary}" not found: management routes will answer 503`
      : `hermes binary: ${resolved}`,
  );

  const host = config.host ?? "127.0.0.1";
  if (!["127.0.0.1", "::1", "localhost"].includes(host)) {
    add("warn", `listening on ${host}: make sure a firewall or reverse proxy guards the port`);
  }
  if (config.anonymous === true) {
    add("warn", "anonymous mode is on: anyone who can reach the port can chat with the agent");
  }
  add(
    existsSync(join(ctx.homeDir, "signing.key")) ? "ok" : "warn",
    existsSync(join(ctx.homeDir, "signing.key"))
      ? "user token signing key present"
      : "no signing.key yet (created on first serve)",
  );

  if (config.upstreamUrl === undefined) {
    add("warn", "no upstream configured: the demo agent answers chat");
  } else {
    const reached = await (ctx.fetch ?? fetch)(`${config.upstreamUrl.replace(/\/+$/, "")}/health`, {
      signal: AbortSignal.timeout(3_000),
    })
      .then((res) => res.status)
      .catch(() => null);
    add(
      reached === null ? "error" : "ok",
      reached === null
        ? `upstream ${config.upstreamUrl} is unreachable`
        : `upstream ${config.upstreamUrl} answered ${reached}`,
    );
  }

  const report = lines.map(([level, text]) => `${MARK[level]} ${text}`).join("\n");
  return lines.some(([level]) => level === "error") ? fail(report) : ok(report);
}
