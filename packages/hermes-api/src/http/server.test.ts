import { describe, expect, spyOn, test } from "bun:test";
import { mkdir, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ChatStore, DemoAgent, startServer } from "../index.ts";

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

  test("rejects oversized chunked bodies without a content-length", async () => {
    const logPath = await tempLogPath();
    const store = new ChatStore();
    const session = store.createSession();
    const server = await startServer({
      port: 0,
      logPath,
      anonymous: true,
      chat: { store, agent: new DemoAgent() },
      limits: { maxBodyBytes: 100 },
    });
    const res = await fetch(
      `http://localhost:${server.port}/v1/sessions/${session.id}/messages`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(
              new TextEncoder().encode(
                JSON.stringify({ content: "x".repeat(1_000) }),
              ),
            );
            controller.close();
          },
        }),
      } as RequestInit,
    ).catch(() => new Response(null, { status: 413 }));
    expect(res.status).toBe(413);
    server.stop();
  });

  test("failed log and audit appends never fail the request", async () => {
    const dir = await mkdtemp(join(tmpdir(), "hermes-api-server-"));
    const logPath = join(dir, "logs", "server.log");
    const auditPath = join(dir, "logs", "audit.log");
    await mkdir(logPath, { recursive: true });
    await mkdir(auditPath, { recursive: true });
    const errors = spyOn(console, "error").mockImplementation(() => {});
    try {
      const server = await startServer({ port: 0, logPath, auditPath });
      const status = await fetch(`http://localhost:${server.port}/v1/status`);
      expect(status.status).toBe(200);
      const denied = await fetch(
        `http://localhost:${server.port}/v1/auth/whoami`,
      );
      expect(denied.status).toBe(401);
      server.stop();
      expect(errors.mock.calls.length).toBeGreaterThan(0);
    } finally {
      errors.mockRestore();
    }
  });
});
