/**
 * Chat integration: full HTTP round trips through a hermes-remote server.
 *
 * Runs against the in-process local stack by default; set HERMES_INTEGRATION=1
 * with HERMES_REMOTE_URL and HERMES_REMOTE_TOKEN to target a live server
 * wired to a real Hermes agent instead. See harness.ts.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { HermesClient } from "@intheloop-studio/hermes-remote-client";
import { startStack, type TestStack } from "./harness.ts";

let stack: TestStack;
let client: HermesClient;

beforeAll(async () => {
  stack = await startStack();
  client = new HermesClient({
    baseUrl: stack.baseUrl,
    ...(stack.token === undefined ? {} : { token: stack.token }),
  });
});

afterAll(async () => {
  await stack.stop();
});

describe("hermes-remote chat", () => {
  test("status responds", async () => {
    const status = await client.status();
    expect(status.ok).toBe(true);
  });

  test("full chat round trip with persistence", async () => {
    const session = await client.createSession();
    let reply = "";
    for await (const event of client.sendMessage(session.id, {
      content: "Reply with exactly the word: integration",
    })) {
      if (event.event === "done") {
        reply = event.data.content;
      }
    }
    expect(reply.toLowerCase()).toContain("integration");
    const messages = await client.listMessages(session.id);
    expect(messages).toHaveLength(2);
    const sessions = await client.listSessions([session.id]);
    expect(sessions.some((s) => s.id === session.id)).toBe(true);
    await client.deleteSession(session.id);
    await expect(client.listMessages(session.id)).rejects.toThrow();
  }, 120_000);

  test("stop cancels a running turn", async () => {
    const session = await client.createSession();
    const consumed = (async () => {
      const events = [];
      for await (const event of client.sendMessage(session.id, {
        content: "Count slowly from 1 to 200, one number per line.",
      })) {
        events.push(event.event);
        if (event.event === "delta" && events.length > 4) {
          await client.stopTurn(session.id);
        }
      }
      return events;
    })();
    const events = await consumed;
    expect(events.at(-1)).toBe("done");
    await client.deleteSession(session.id);
  }, 120_000);

  test("unauthenticated requests are rejected when auth is enforced", async () => {
    if (stack.token === undefined) {
      return;
    }
    const anonymous = new HermesClient({ baseUrl: stack.baseUrl });
    await expect(anonymous.createSession()).rejects.toThrow();
  }, 30_000);
});
