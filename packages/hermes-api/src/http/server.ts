import { mkdir } from "node:fs/promises";
import { appendFileSync } from "node:fs";
import { dirname } from "node:path";
import { DEFAULT_LIMITS } from "../limits/index.ts";
import { createApp, type AppOptions } from "./app.ts";

/**
 * The largest value Bun accepts: 256 is rejected with "Bun.serve expects
 * idleTimeout to be 255 or less". That ceiling is below the length of a slow
 * agent turn, which is why this is only a backstop for a peer that has really
 * gone away — the SSE keepalive is what actually holds a long turn open.
 */
export const MAX_IDLE_TIMEOUT_SECONDS = 255;

export interface StartServerOptions extends AppOptions {
  port: number;
  logPath: string;
  /** JSONL audit log destination; enables auditing when set. */
  auditPath?: string;
  /** Seconds a connection may be idle before Bun closes it; max 255. */
  idleTimeout?: number;
  now?: () => Date;
}

export interface RunningServer {
  port: number;
  stop(): void;
}

// A failed log append must never fail the request it describes.
function appendSafely(path: string, line: string): void {
  try {
    appendFileSync(path, line);
  } catch (cause) {
    console.error(`hermes-api: failed to append to ${path}`, cause);
  }
}

export async function startServer(
  options: StartServerOptions,
): Promise<RunningServer> {
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
  const server = Bun.serve({
    port: options.port,
    // Closes the chunked-transfer bypass of the content-length check.
    maxRequestBodySize: options.limits?.maxBodyBytes ?? DEFAULT_LIMITS.maxBodyBytes,
    // Bun defaults this to 10 seconds, and an SSE response that has not yet
    // written a byte is idle by that definition — which is exactly an agent
    // turn waiting on a model.
    idleTimeout: options.idleTimeout ?? MAX_IDLE_TIMEOUT_SECONDS,
    async fetch(request, bunServer) {
      const ip = bunServer.requestIP(request)?.address;
      const response = await app.fetch(request, ip);
      log(`${request.method} ${new URL(request.url).pathname} ${response.status}`);
      return response;
    },
  });
  const port = server.port ?? options.port;
  log(`server started on port ${port}`);
  return {
    port,
    stop() {
      log("server stopped");
      server.stop(true);
    },
  };
}
