import { join } from "node:path";
import { flag, flagAll, parseArgs, parseDuration } from "./args.ts";
import { isDangerousScope, isKnownScope, isUserGrantableScope } from "../scopes.ts";
import { KeyStore, type ApiKeyRecord } from "../store/keys.ts";

export interface CliResult {
  exitCode: number;
  output: string;
}

export interface ServeRequest {
  port: number;
  store: KeyStore;
  logPath: string;
  auditPath: string;
  anonymous: boolean;
  corsOrigins: string[];
  supabaseJwtSecret: string | undefined;
  supabaseUrl: string | undefined;
  rateLimit: { limit: number; windowSeconds: number } | null;
  upstream: { baseUrl: string; apiKey: string; model?: string } | null;
}

export interface CliContext {
  homeDir: string;
  platform: string;
  now(): Date;
  env: Record<string, string | undefined>;
  serve(request: ServeRequest): Promise<{ port: number }>;
}

interface ConfigFile {
  port?: number;
  cors?: string[];
  anonymous?: boolean;
  upstreamUrl?: string;
  upstreamKey?: string;
  upstreamModel?: string;
  supabaseUrl?: string;
  supabaseJwtSecret?: string;
  rateLimit?: { limit: number; windowSeconds: number };
}

const USAGE = `hermes-remote <command>

Commands:
  init [--port ...] [--cors ...] [--upstream ...]   write ~/.hermes-remote/config.json
  serve [--port 8643] [--anonymous]                 run the API server
       [--cors <origin,...>] [--upstream <url>] [--upstream-key <key>]
       [--model <m>] [--supabase-url <url>] [--supabase-jwt-secret <s>]
       [--rate-limit <n>] [--rate-window <seconds>]
  keys create --name <name> --scope <s>             create an API key
       [--scope <s> ...] [--user-grantable <s,s>] [--expires 90d]
       [--cidr <a.b.c.d/n,...>] [--dangerous]
  keys list | show <id> | revoke <id> | rotate <id>
  keys grant <id> --scope <s> | ungrant <id> --scope <s>
  service install | uninstall | status              run serve on boot
  logs [--tail 50]                                  show server logs
`;

function ok(output: string): CliResult {
  return { exitCode: 0, output };
}

function fail(output: string): CliResult {
  return { exitCode: 1, output };
}

function describeKey(record: ApiKeyRecord): string {
  const state = record.revoked ? "revoked" : "active";
  const scopes = record.scopes.join(",") || "(none)";
  return `${record.id}  ${record.name}  ${state}  scopes=${scopes}`;
}

async function loadConfig(homeDir: string): Promise<ConfigFile> {
  const file = Bun.file(join(homeDir, "config.json"));
  if (!(await file.exists())) {
    return {};
  }
  try {
    return (await file.json()) as ConfigFile;
  } catch {
    return {};
  }
}

async function keysCommand(
  args: string[],
  store: KeyStore,
  now: Date,
): Promise<CliResult> {
  const parsed = parseArgs(args);
  const action = parsed.positionals[0];

  if (action === "create") {
    const name = flag(parsed, "name");
    if (name === undefined) {
      return fail("keys create requires --name");
    }
    const scopes = flagAll(parsed, "scope");
    if (scopes.length === 0) {
      return fail("keys create requires at least one --scope");
    }
    const userGrantable = flagAll(parsed, "user-grantable");
    for (const scope of [...scopes, ...userGrantable]) {
      if (!isKnownScope(scope)) {
        return fail(`unknown scope: ${scope}`);
      }
    }
    const dangerous = scopes.filter(isDangerousScope);
    if (dangerous.length > 0 && flag(parsed, "dangerous") !== "true") {
      return fail(
        `dangerous scopes (${dangerous.join(", ")}) require --dangerous`,
      );
    }
    const invalidGrantable = userGrantable.filter(
      (s) => !isUserGrantableScope(s),
    );
    if (invalidGrantable.length > 0) {
      return fail(
        `--user-grantable accepts tier-1 scopes only: ${invalidGrantable.join(", ")}`,
      );
    }
    const expires = flag(parsed, "expires");
    let expiresAt: Date | undefined;
    if (expires !== undefined) {
      const ms = parseDuration(expires);
      if (ms === null) {
        return fail(`invalid --expires value: ${expires} (use e.g. 30m, 12h, 90d)`);
      }
      expiresAt = new Date(now.getTime() + ms);
    }
    const cidrs = flagAll(parsed, "cidr");
    const { record, token } = await store.create({
      name,
      scopes,
      userGrantable,
      cidrs,
      now,
      ...(expiresAt === undefined ? {} : { expiresAt }),
    });
    return ok(
      `created key ${record.id} (${record.name})\n\n  ${token}\n\nstore this token now — it cannot be shown again`,
    );
  }

  if (action === "list") {
    const keys = await store.list();
    if (keys.length === 0) {
      return ok("no API keys");
    }
    return ok(keys.map(describeKey).join("\n"));
  }

  const id = parsed.positionals[1];
  if (
    action === "show" ||
    action === "revoke" ||
    action === "rotate" ||
    action === "grant" ||
    action === "ungrant"
  ) {
    if (id === undefined) {
      return fail(`keys ${action} requires a key id`);
    }
    if (action === "show") {
      const record = await store.get(id);
      return record === null
        ? fail(`no such key: ${id}`)
        : ok(JSON.stringify({ ...record, hash: "(redacted)" }, null, 2));
    }
    if (action === "revoke") {
      const record = await store.revoke(id);
      return record === null
        ? fail(`no such key: ${id}`)
        : ok(`revoked key ${id}`);
    }
    if (action === "rotate") {
      const rotated = await store.rotate(id);
      return rotated === null
        ? fail(`no such key: ${id}`)
        : ok(
            `rotated key ${id}\n\n  ${rotated.token}\n\nstore this token now — the previous secret no longer works`,
          );
    }
    const scopes = flagAll(parsed, "scope");
    if (scopes.length === 0) {
      return fail(`keys ${action} requires at least one --scope`);
    }
    const unknown = scopes.filter((s) => !isKnownScope(s));
    if (unknown.length > 0) {
      return fail(`unknown scope: ${unknown.join(", ")}`);
    }
    if (action === "grant") {
      const dangerous = scopes.filter(isDangerousScope);
      if (dangerous.length > 0 && flag(parsed, "dangerous") !== "true") {
        return fail(
          `dangerous scopes (${dangerous.join(", ")}) require --dangerous`,
        );
      }
      const record = await store.grantScopes(id, scopes);
      return record === null
        ? fail(`no such key: ${id}`)
        : ok(describeKey(record));
    }
    const record = await store.ungrantScopes(id, scopes);
    return record === null
      ? fail(`no such key: ${id}`)
      : ok(describeKey(record));
  }

  return fail(`unknown keys action: ${action ?? "(none)"}\n\n${USAGE}`);
}

function serviceCommand(args: string[], ctx: CliContext): CliResult {
  const action = args[0];
  const darwin = ctx.platform === "darwin";
  const unitPath = darwin
    ? join(ctx.homeDir, "com.hermes-remote.server.plist")
    : join(ctx.homeDir, "hermes-remote.service");
  const loadHint = darwin
    ? `cp ${unitPath} ~/Library/LaunchAgents/ && launchctl load ~/Library/LaunchAgents/com.hermes-remote.server.plist`
    : `cp ${unitPath} ~/.config/systemd/user/ && systemctl --user enable --now hermes-remote`;

  if (action === "install") {
    const unit = darwin
      ? `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.hermes-remote.server</string>
  <key>ProgramArguments</key><array>
    <string>hermes-remote</string><string>serve</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardErrorPath</key><string>${join(ctx.homeDir, "logs", "service.log")}</string>
</dict></plist>
`
      : `[Unit]
Description=Hermes Remote API server

[Service]
ExecStart=hermes-remote serve
Restart=always

[Install]
WantedBy=default.target
`;
    Bun.write(unitPath, unit);
    return ok(`wrote ${unitPath}\n\nto activate:\n  ${loadHint}`);
  }
  if (action === "uninstall" && darwin) {
    return ok(
      "launchctl unload ~/Library/LaunchAgents/com.hermes-remote.server.plist && rm ~/Library/LaunchAgents/com.hermes-remote.server.plist",
    );
  }
  if (action === "uninstall") {
    return ok(
      "systemctl --user disable --now hermes-remote && rm ~/.config/systemd/user/hermes-remote.service",
    );
  }
  if (action === "status") {
    return ok(`unit file: ${unitPath}\nactivate with:\n  ${loadHint}`);
  }
  return fail(`unknown service action: ${action ?? "(none)"}\n\n${USAGE}`);
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
    return keysCommand(args.slice(1), store, ctx.now());
  }

  if (command === "service") {
    return serviceCommand(args.slice(1), ctx);
  }

  if (command === "init") {
    const parsed = parseArgs(args.slice(1));
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
    const path = join(ctx.homeDir, "config.json");
    await Bun.write(path, `${JSON.stringify(config, null, 2)}\n`);
    return ok(`wrote ${path}\n${JSON.stringify(config, null, 2)}`);
  }

  if (command === "serve") {
    const parsed = parseArgs(args.slice(1));
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
      store,
      logPath,
      auditPath,
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
        `logs: ${logPath}`,
    );
  }

  if (command === "logs") {
    const parsed = parseArgs(args.slice(1));
    const tail = Number(flag(parsed, "tail") ?? "50");
    if (!Number.isInteger(tail) || tail <= 0) {
      return fail(`invalid --tail: ${flag(parsed, "tail") as string}`);
    }
    const file = Bun.file(logPath);
    if (!(await file.exists())) {
      return ok("no logs yet");
    }
    const lines = (await file.text()).trimEnd().split("\n");
    return ok(lines.slice(-tail).join("\n"));
  }

  return fail(`unknown command: ${command}\n\n${USAGE}`);
}
