/**
 * Integration suite: requires a live hermes-remote server wired to a real
 * Hermes agent. Run with:
 *
 *   HERMES_INTEGRATION=1 HERMES_REMOTE_URL=http://localhost:8643 \
 *     HERMES_REMOTE_TOKEN=<supabase-or-api-key-token> bun test
 *
 * Skipped entirely (and excluded from coverage) unless HERMES_INTEGRATION=1.
 */
import { describe, expect, test } from "bun:test";
import { HermesClient } from "@in-th3-l00p/hermes-remote-client";

const enabled = process.env["HERMES_INTEGRATION"] === "1";
const baseUrl = process.env["HERMES_REMOTE_URL"] ?? "http://localhost:8643";
const token = process.env["HERMES_REMOTE_TOKEN"];

describe.skipIf(!enabled)("hermes-remote integration", () => {
  const client = new HermesClient({
    baseUrl,
    ...(token === undefined ? {} : { token }),
  });

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
    if (token === undefined) {
      return;
    }
    const anonymous = new HermesClient({ baseUrl });
    await expect(anonymous.createSession()).rejects.toThrow();
  });
});
