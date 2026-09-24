import { mkdir } from "node:fs/promises";
import { appendFileSync } from "node:fs";
import { dirname } from "node:path";
import { DEFAULT_LIMITS } from "../limits/index.ts";
import { createApp, type AppOptions } from "./app.ts";

export interface StartServerOptions extends AppOptions {
  port: number;
  /** Interface to listen on. Defaults to loopback; "0.0.0.0" exposes it. */
  hostname?: string;
  /**
   * Seconds a connection may stay silent (default 60, max 255). Streams send
   * keepalive comments well inside this window.
   */
  idleTimeoutSeconds?: number;
  logPath: string;
  /** JSONL audit log destination; enables auditing when set. */
  auditPath?: string;
  now?: () => Date;
}

export interface RunningServer {
  port: number;
  stop(): void;
}

// A failed log append must never fail the request it describes.
function appendSafely(path: string, line: string): void {
  try {
    appendFileSync(path, line, { mode: 0o600 });
  } catch (cause) {
    console.error(`hermes-api: failed to append to ${path}`, cause);
  }
}

export async function startServer(options: StartServerOptions): Promise<RunningServer> {
  const now = options.now ?? (() => new Date());
  await mkdir(dirname(options.logPath), { recursive: true });
  const appOptions: AppOptions = { ...options };
  if (options.auditPath !== undefined) {
    const auditPath = options.auditPath;
    appOptions.audit = (entry) => {
      appendSafely(auditPath, `${JSON.stringify(entry)}\n`);
    };
  }
  const app = createApp(appOptions);
  const log = (line: string): void => {
    appendSafely(options.logPath, `${now().toISOString()} ${line}\n`);
  };
  const hostname = options.hostname ?? "127.0.0.1";
  const server = Bun.serve({
    port: options.port,
    hostname,
    idleTimeout: options.idleTimeoutSeconds ?? 60,
    // Closes the chunked-transfer bypass of the content-length check.
    maxRequestBodySize: options.limits?.maxBodyBytes ?? DEFAULT_LIMITS.maxBodyBytes,
    async fetch(request, bunServer) {
      const ip = bunServer.requestIP(request)?.address;
      const response = await app.fetch(request, ip);
      log(`${request.method} ${new URL(request.url).pathname} ${response.status}`);
      return response;
    },
  });
  const port = server.port ?? options.port;
  log(`server started on ${hostname}:${port}`);
  return {
    port,
    stop() {
      log("server stopped");
      server.stop(true);
    },
  };
}
