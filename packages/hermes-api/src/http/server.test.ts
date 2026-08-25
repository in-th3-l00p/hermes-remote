import { describe, expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startServer } from "../index.ts";

async function tempLogPath(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "hermes-api-server-"));
  return join(dir, "logs", "server.log");
}

describe("startServer", () => {
  test("serves the app and logs requests with injected clock", async () => {
    const logPath = await tempLogPath();
    const server = await startServer({
      port: 0,
      logPath,
      now: () => new Date("2026-08-23T00:00:00Z"),
    });
    const res = await fetch(`http://localhost:${server.port}/v1/status`);
    expect(res.status).toBe(200);
    server.stop();
    const log = await Bun.file(logPath).text();
    expect(log).toContain("2026-08-23T00:00:00.000Z server started on port");
    expect(log).toContain("GET /v1/status 200");
    expect(log).toContain("server stopped");
  });

  test("uses the real clock by default", async () => {
    const logPath = await tempLogPath();
    const server = await startServer({ port: 0, logPath });
    server.stop();
    const log = await Bun.file(logPath).text();
    expect(log).toMatch(/^\d{4}-\d{2}-\d{2}T.* server started/);
  });

  test("writes audit entries when auditPath is set", async () => {
    const logPath = await tempLogPath();
    const auditPath = logPath.replace("server.log", "audit.log");
    const server = await startServer({ port: 0, logPath, auditPath });
    await fetch(`http://localhost:${server.port}/v1/auth/whoami`);
    server.stop();
    const entries = (await Bun.file(auditPath).text())
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l) as { status: number; principal: string });
    expect(entries[0]?.status).toBe(401);
    expect(entries[0]?.principal).toBe("unauthenticated");
  });
});
