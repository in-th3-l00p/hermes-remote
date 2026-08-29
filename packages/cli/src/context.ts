import type { AuthProviderConfig, KeyStore } from "@in-th3-l00p/hermes-remote";

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
  auth: AuthProviderConfig | null;
  hermesBinary: string;
  profileHomes: Record<string, string>;
  commandRelay: boolean;
  rateLimit: { limit: number; windowSeconds: number } | null;
  upstream: { baseUrl: string; apiKey: string; model?: string } | null;
}

export interface CliContext {
  homeDir: string;
  platform: string;
  execPath: string;
  entryPath: string;
  now(): Date;
  env: Record<string, string | undefined>;
  which(name: string): string | null;
  serve(request: ServeRequest): Promise<{ port: number }>;
}

export const USAGE = `hermes-remote <command>

Commands:
  init [--port ...] [--cors ...] [--upstream ...]   write ~/.hermes-remote/config.json
  serve [--port 8643] [--anonymous]                 run the API server
       [--cors <origin,...>] [--upstream <url>] [--upstream-key <key>]
       [--model <m>] [--supabase-url <url>] [--supabase-jwt-secret <s>]
       [--rate-limit <n>] [--rate-window <seconds>]
       user auth providers (supabase, clerk, jwt, custom) are configured
       via the "auth" section of config.json; see the docs

  keys create --name <name> --scope <s>             create an API key
       [--scope <s> ...] [--user-grantable <s,s>] [--expires 90d]
       [--cidr <a.b.c.d/n,...>] [--dangerous]
  keys list | show <id> | revoke <id> | rotate <id>
  keys grant <id> --scope <s> | ungrant <id> --scope <s>
  service install | uninstall | status              run serve on boot
  logs [--tail 50]                                  show server logs
`;

export function ok(output: string): CliResult {
  return { exitCode: 0, output };
}

export function fail(output: string): CliResult {
  return { exitCode: 1, output };
}
