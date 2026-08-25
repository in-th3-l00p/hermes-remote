import { mkdir } from "node:fs/promises";
import { appendFileSync } from "node:fs";
import { dirname } from "node:path";
import { createApp, type AppOptions } from "./app.ts";

export interface StartServerOptions extends AppOptions {
  port: number;
  logPath: string;
  /** JSONL audit log destination; enables auditing when set. */
  auditPath?: string;
  now?: () => Date;
}

export interface RunningServer {
  port: number;
  stop(): void;
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
      appendFileSync(auditPath, `${JSON.stringify(entry)}\n`);
    };
  }
  const app = createApp(appOptions);
  const log = (line: string): void => {
    appendFileSync(options.logPath, `${now().toISOString()} ${line}\n`);
  };
  const server = Bun.serve({
    port: options.port,
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
