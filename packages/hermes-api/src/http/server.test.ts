import { describe, expect, spyOn, test } from "bun:test";
import { mkdir, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ChatStore,
  DemoAgent,
  MAX_IDLE_TIMEOUT_SECONDS,
  startServer,
  type AgentBackend,
} from "../index.ts";

async function tempLogPath(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "hermes-api-server-"));
  return join(dir, "logs", "server.log");
}

/**
 * An agent that says nothing for `delayMs` and then answers — the shape of a
 * real turn waiting on a model, which is precisely what Bun counts as idle.
 */
class SlowAgent implements AgentBackend {
  constructor(private readonly delayMs: number) {}

  async *stream(
    _messages: unknown[],
    signal?: AbortSignal,
  ): AsyncIterable<string> {
    await Bun.sleep(this.delayMs);
    if (signal?.aborted === true) {
      return;
    }
    yield "answered at last";
  }
}

/** Drives one streamed turn, returning whatever reached the client. */
async function readTurn(
  port: number,
  sessionId: string,
): Promise<{ body: string; completed: boolean }> {
  let body = "";
  try {
    const res = await fetch(
      `http://localhost:${port}/v1/sessions/${sessionId}/messages`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content: "hold this open" }),
      },
    );
    body = await res.text();
  } catch {
    // The socket was closed under us; `body` keeps whatever arrived first.
    return { body, completed: false };
  }
  return { body, completed: body.includes("event: done") };
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

  test("the default idle timeout is the highest value Bun accepts", () => {
    expect(MAX_IDLE_TIMEOUT_SECONDS).toBe(255);
    expect(() => {
      Bun.serve({
        port: 0,
        idleTimeout: MAX_IDLE_TIMEOUT_SECONDS + 1,
        fetch: () => new Response("ok"),
      }).stop(true);
    }).toThrow(/idleTimeout to be 255 or less/);
  });

  test(
    "a turn slower than the idle timeout still reaches the client",
    async () => {
      const store = new ChatStore();
      const session = store.createSession();
      const server = await startServer({
        port: 0,
        logPath: await tempLogPath(),
        anonymous: true,
        // Below the turn length on purpose: only the keepalive can save this.
        idleTimeout: 5,
        chat: { store, agent: new SlowAgent(8_000), keepaliveMs: 1_000 },
      });
      const { body, completed } = await readTurn(server.port, session.id);
      server.stop();
      expect(completed).toBe(true);
      expect(body).toContain(": keepalive");
      expect(body).toContain("answered at last");
    },
    30_000,
  );

  test(
    "without the keepalive the same turn is cut off mid-stream",
    async () => {
      const store = new ChatStore();
      const session = store.createSession();
      const server = await startServer({
        port: 0,
        logPath: await tempLogPath(),
        anonymous: true,
        idleTimeout: 5,
        // The turn is far longer than the timeout and the keepalive far longer
        // than the turn, so the cut lands with margin on both sides — the test
        // ends when Bun closes the socket, not when the agent would answer.
        chat: { store, agent: new SlowAgent(60_000), keepaliveMs: 600_000 },
      });
      const { body, completed } = await readTurn(server.port, session.id);
      server.stop();
      expect(completed).toBe(false);
      expect(body).not.toContain("answered at last");
    },
    30_000,
  );

  test("a fast turn emits no keepalive at all", async () => {
    const store = new ChatStore();
    const session = store.createSession();
    const server = await startServer({
      port: 0,
      logPath: await tempLogPath(),
      anonymous: true,
      chat: { store, agent: new DemoAgent() },
    });
    const { body, completed } = await readTurn(server.port, session.id);
    server.stop();
    expect(completed).toBe(true);
    // Byte-identical to 3.2.0 for every turn that finishes promptly.
    expect(body).not.toContain(": keepalive");
  });
});
