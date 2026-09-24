import type { AuthProviderConfig, KeyStore } from "@intheloop-studio/hermes-remote";

export interface CliResult {
  exitCode: number;
  output: string;
}

export interface ServeRequest {
  port: number;
  host: string;
  store: KeyStore;
  logPath: string;
  auditPath: string;
  anonymous: boolean;
  corsOrigins: string[];
  trustProxy: string[];
  /** Signs user tokens minted by token exchange. */
  signingSecret: string;
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
  /** Network access for `doctor`; defaults to the global fetch. */
  fetch?: typeof fetch;
}

export const USAGE = `hermes-remote <command>

Commands:
  init [--port ...] [--cors ...] [--upstream ...]   write ~/.hermes-remote/config.json
  serve [--port 8643] [--host 127.0.0.1] [--anonymous]
                                                    run the API server
       [--cors <origin,...>] [--trust-proxy <cidr,...>]
       [--upstream <url>] [--upstream-key <key>]
       [--model <m>] [--supabase-url <url>] [--supabase-jwt-secret <s>]
       [--rate-limit <n>] [--rate-window <seconds>]
       config.json only: "auth" (user auth providers: supabase, clerk,
       jwt, custom), "hermesBinary", "profileHomes", "commandRelay";
       see the docs

  keys create --name <name> --scope <s>             create an API key
       [--scope <s> ...] [--user-grantable <s,s>] [--expires 90d]
       [--cidr <a.b.c.d/n,...>] [--profile <name>] [--dangerous]
  keys list | show <id> | revoke <id> | rotate <id>
  keys grant <id> --scope <s> | ungrant <id> --scope <s>
  users list | show <id> | disable <id> | enable <id>
  users delete <id> [--cascade]                     manage token-exchange users
  service install | uninstall | status              run serve on boot
  logs [--tail 50]                                  show server logs
  audit tail [--lines 50]                           show recent audit entries
  doctor                                            check the setup
`;

export function ok(output: string): CliResult {
  return { exitCode: 0, output };
}

export function fail(output: string): CliResult {
  return { exitCode: 1, output };
}
