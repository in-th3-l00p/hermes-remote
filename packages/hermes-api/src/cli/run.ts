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
  anonymous: boolean;
  corsOrigin: string | undefined;
  upstream: { baseUrl: string; apiKey: string; model?: string } | null;
}

export interface CliContext {
  homeDir: string;
  now(): Date;
  env: Record<string, string | undefined>;
  serve(request: ServeRequest): Promise<{ port: number }>;
}

const USAGE = `hermes-api <command>

Commands:
  serve [--port 8643] [--anonymous]       run the API server
       [--cors <origin>] [--upstream <url>] [--upstream-key <key>] [--model <m>]
  keys create --name <name> --scope <s>   create an API key
       [--scope <s> ...] [--user-grantable <s,s>] [--expires 90d] [--dangerous]
  keys list                               list API keys
  keys show <id>                          show one API key
  keys revoke <id>                        revoke an API key
  keys grant <id> --scope <s>             grant scopes to a key
  keys ungrant <id> --scope <s>           remove scopes from a key
  logs [--tail 50]                        show server logs
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
    const { record, token } = await store.create({
      name,
      scopes,
      userGrantable,
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

export async function runCli(
  args: string[],
  ctx: CliContext,
): Promise<CliResult> {
  const command = args[0];
  const store = new KeyStore(join(ctx.homeDir, "keys.json"));
  const logPath = join(ctx.homeDir, "logs", "server.log");

  if (command === undefined || command === "help" || command === "--help") {
    return { exitCode: command === undefined ? 1 : 0, output: USAGE };
  }

  if (command === "keys") {
    return keysCommand(args.slice(1), store, ctx.now());
  }

  if (command === "serve") {
    const parsed = parseArgs(args.slice(1));
    const port = Number(flag(parsed, "port") ?? "8643");
    if (!Number.isInteger(port) || port < 0 || port > 65535) {
      return fail(`invalid --port: ${flag(parsed, "port") as string}`);
    }
    const upstreamUrl =
      flag(parsed, "upstream") ?? ctx.env["HERMES_UPSTREAM_URL"];
    const upstreamKey =
      flag(parsed, "upstream-key") ?? ctx.env["HERMES_UPSTREAM_KEY"];
    let upstream: ServeRequest["upstream"] = null;
    if (upstreamUrl !== undefined) {
      if (upstreamKey === undefined) {
        return fail(
          "an upstream requires a key: pass --upstream-key or set HERMES_UPSTREAM_KEY",
        );
      }
      const model = flag(parsed, "model") ?? ctx.env["HERMES_UPSTREAM_MODEL"];
      upstream = {
        baseUrl: upstreamUrl,
        apiKey: upstreamKey,
        ...(model === undefined ? {} : { model }),
      };
    }
    const running = await ctx.serve({
      port,
      store,
      logPath,
      anonymous: flag(parsed, "anonymous") === "true",
      corsOrigin: flag(parsed, "cors"),
      upstream,
    });
    return ok(
      `hermes-api listening on port ${running.port}\n` +
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
