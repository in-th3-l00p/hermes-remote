import { describe, expect, test } from "bun:test";
import { createDemoFetch } from "./index.ts";
import { guard, principalFrom, KEY_SCOPES } from "./routes.ts";
import type { Delay } from "./types.ts";

const BASE = "https://hermes.local";
const KEY = "hk_wkstn.demo-suite";
const now = () => new Date("2026-08-31T12:00:00Z");
const instant: Delay = () => Promise.resolve();

function jwt(payload: unknown): string {
  return `header.${btoa(JSON.stringify(payload))}.signature`;
}

function demo(delay: Delay = instant): typeof fetch {
  return createDemoFetch({ delay, now });
}

function get(
  fetchImpl: typeof fetch,
  path: string,
  token?: string,
  headers: Record<string, string> = {},
): Promise<Response> {
  return fetchImpl(`${BASE}${path}`, {
    headers: {
      ...(token === undefined ? {} : { authorization: `Bearer ${token}` }),
      ...headers,
    },
  });
}

function send(
  fetchImpl: typeof fetch,
  method: string,
  path: string,
  body?: unknown,
  token?: string,
  headers: Record<string, string> = {},
): Promise<Response> {
  return fetchImpl(`${BASE}${path}`, {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    headers: {
      ...(token === undefined ? {} : { authorization: `Bearer ${token}` }),
      ...headers,
    },
  });
}

interface Frame {
  event: string;
  data: Record<string, unknown>;
}

function parseFrames(text: string): Frame[] {
  return text
    .split("\n\n")
    .filter((block) => block !== "")
    .map((block) => {
      const lines = block.split("\n");
      return {
        event: (lines[0] as string).slice("event: ".length),
        data: JSON.parse(lines.slice(1).join("\n").slice("data: ".length)) as Record<
          string,
          unknown
        >,
      };
    });
}

async function frames(res: Response): Promise<Frame[]> {
  expect(res.headers.get("content-type")).toBe("text/event-stream");
  return parseFrames(await res.text());
}

/** A delay whose resolution the test controls, one pause at a time. */
function makeGate(): { delay: Delay; open(): void } {
  const pending: (() => void)[] = [];
  return {
    delay: () => new Promise<void>((resolve) => pending.push(resolve)),
    open: () => pending.shift()?.(),
  };
}

async function readSome(res: Response, count: number): Promise<{
  frames: Frame[];
  reader: ReadableStreamDefaultReader<Uint8Array>;
}> {
  const reader = (res.body as ReadableStream<Uint8Array>).getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (parseFrames(buffer).length < count) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    buffer += decoder.decode(value, { stream: true });
  }
  return { frames: parseFrames(buffer), reader };
}

describe("principals", () => {
  test("whoami reflects anonymous, user, and api key callers", async () => {
    const fetchImpl = demo();
    expect(await (await get(fetchImpl, "/v1/auth/whoami")).json()).toEqual({
      type: "anonymous",
    });
    expect(
      await (
        await get(fetchImpl, "/v1/auth/whoami", jwt({ sub: "user-1", email: "dev@example.com" }))
      ).json(),
    ).toEqual({ type: "user", id: "user-1", email: "dev@example.com" });
    expect(
      await (await get(fetchImpl, "/v1/auth/whoami", jwt({ sub: "user-2" }))).json(),
    ).toEqual({ type: "user", id: "user-2" });
    expect(await (await get(fetchImpl, "/v1/auth/whoami", KEY)).json()).toEqual({
      type: "api_key",
      id: "wkstn",
      name: "workstation",
      scopes: KEY_SCOPES,
    });
  });

  test("malformed bearer tokens are rejected", async () => {
    const fetchImpl = demo();
    for (const token of [
      "nonsense",
      "a.b",
      "a.!!!.c",
      `header.${btoa("42")}.signature`,
      jwt({ email: "no-sub@example.com" }),
    ]) {
      const res = await get(fetchImpl, "/v1/auth/whoami", token);
      expect(res.status).toBe(401);
      const body = (await res.json()) as { error: { code: string } };
      expect(body.error.code).toBe("unauthorized");
    }
  });

  test("an empty authorization header is anonymous", () => {
    expect(principalFrom("")).toEqual({ type: "anonymous" });
  });

  test("guard denies api keys missing a scope", async () => {
    const denied = guard(
      { type: "api_key", id: "k", name: "k", scopes: [] },
      "memory:read",
    ) as Response;
    expect(denied.status).toBe(403);
    const body = (await denied.json()) as { error: { code: string } };
    expect(body.error.code).toBe("missing_scope");
  });
});

describe("discovery", () => {
  test("status, health, capabilities, models, profiles", async () => {
    const fetchImpl = demo();
    expect(await (await get(fetchImpl, "/v1/status")).json()).toEqual({
      ok: true,
      version: "1.0.0",
    });
    const health = (await (await get(fetchImpl, "/v1/health")).json()) as {
      status: string;
      upstream: { model: string };
    };
    expect(health.status).toBe("ok");
    expect(health.upstream.model).toBe("hermes-4-405b");
    const caps = (await (await get(fetchImpl, "/v1/capabilities")).json()) as {
      object: string;
      features: Record<string, boolean>;
    };
    expect(caps.object).toBe("hermes-remote.capabilities");
    expect(caps.features["chat"]).toBe(true);
    const models = (await (await get(fetchImpl, "/v1/models")).json()) as {
      data: { id: string }[];
    };
    expect(models.data.map((m) => m.id)).toContain("hermes-4-405b");
    const profiles = (await (await get(fetchImpl, "/v1/profiles", KEY)).json()) as {
      profiles: { name: string; isDefault: boolean }[];
    };
    expect(profiles.profiles.map((p) => p.name)).toEqual(["default", "work", "research"]);
  });

  test("agent status needs an api key", async () => {
    const fetchImpl = demo();
    expect((await get(fetchImpl, "/v1/agent/status")).status).toBe(403);
    expect(
      (await get(fetchImpl, "/v1/agent/status", jwt({ sub: "user_1" }))).status,
    ).toBe(403);
  });

  test("agent status honours the profile header", async () => {
    const fetchImpl = demo();
    const home = (await (await get(fetchImpl, "/v1/agent/status", KEY)).json()) as {
      ok: boolean;
      raw: string;
    };
    expect(home.ok).toBe(true);
    expect(home.raw).toContain("profile: default");
    const work = (await (
      await get(fetchImpl, "/v1/agent/status", KEY, { "x-hermes-profile": "work" })
    ).json()) as { raw: string };
    expect(work.raw).toContain("profile: work");
    const unknown = await get(fetchImpl, "/v1/agent/status", KEY, {
      "x-hermes-profile": "atlantis",
    });
    expect(unknown.status).toBe(404);
  });

  test("jobs need an api key", async () => {
    const fetchImpl = demo();
    expect((await get(fetchImpl, "/v1/jobs")).status).toBe(403);
    const body = (await (await get(fetchImpl, "/v1/jobs", KEY)).json()) as {
      jobs: { name: string; schedule: string }[];
    };
    expect(body.jobs.map((job) => job.name)).toContain("morning-briefing");
  });

  test("unknown routes 404", async () => {
    const res = await get(demo(), "/v1/nope");
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("not_found");
  });
});

describe("sessions and chat", () => {
  test("lists seeded conversations newest first", async () => {
    const fetchImpl = demo();
    const body = (await (await get(fetchImpl, "/v1/sessions")).json()) as {
      sessions: { id: string; title: string | null }[];
    };
    expect(body.sessions.length).toBeGreaterThanOrEqual(4);
    expect(body.sessions[0]?.title).toContain("deploy");
  });

  test("reads a seeded session's messages", async () => {
    const fetchImpl = demo();
    const body = (await (
      await get(fetchImpl, "/v1/sessions/9f21c8a4d301/messages")
    ).json()) as { messages: { role: string }[]; total: number };
    expect(body.total).toBe(4);
    expect(body.messages[0]?.role).toBe("user");
  });

  test("creating a session then streaming a turn", async () => {
    const fetchImpl = demo();
    const session = (await (
      await send(fetchImpl, "POST", "/v1/sessions", {}, jwt({ sub: "user-9" }))
    ).json()) as { id: string; userId: string | null };
    expect(session.userId).toBe("user-9");
    const res = await send(fetchImpl, "POST", `/v1/sessions/${session.id}/messages`, {
      content: "write a haiku about SSE",
      attachments: [],
    });
    const events = await frames(res);
    expect(events[0]?.event).toBe("user");
    expect(events[1]?.event).toBe("assistant");
    const deltas = events.filter((e) => e.event === "delta");
    expect(deltas.length).toBeGreaterThan(3);
    const done = events.at(-1);
    expect(done?.event).toBe("done");
    expect(done?.data["status"]).toBe("done");
    expect(deltas.map((d) => d.data["text"]).join("")).toBe(
      done?.data["content"] as string,
    );
    const list = (await (
      await get(fetchImpl, `/v1/sessions/${session.id}/messages`)
    ).json()) as { total: number };
    expect(list.total).toBe(2);
  });

  test("message validation and unknown sessions", async () => {
    const fetchImpl = demo();
    expect(
      (await send(fetchImpl, "POST", "/v1/sessions/9f21c8a4d301/messages", { content: "  " }))
        .status,
    ).toBe(400);
    const invalid = await fetchImpl(`${BASE}/v1/sessions/9f21c8a4d301/messages`, {
      method: "POST",
      body: "not json",
    });
    expect(invalid.status).toBe(400);
    expect(
      (await send(fetchImpl, "POST", "/v1/sessions/ffffffffffff/messages", { content: "hi" }))
        .status,
    ).toBe(404);
    expect((await get(fetchImpl, "/v1/sessions/ffffffffffff/messages")).status).toBe(404);
    expect((await get(fetchImpl, "/v1/sessions/9f21c8a4d301")).status).toBe(404);
  });

  test("stop aborts an in-flight turn and keeps the partial reply", async () => {
    const gate = makeGate();
    const fetchImpl = demo(gate.delay);
    const res = await send(fetchImpl, "POST", "/v1/sessions/9f21c8a4d301/messages", {
      content: "deploy the release",
    });
    const { frames: opening, reader } = await readSome(res, 2);
    expect(opening.map((f) => f.event)).toEqual(["user", "assistant"]);
    gate.open();
    const stop = (await (
      await send(fetchImpl, "POST", "/v1/sessions/9f21c8a4d301/stop", {})
    ).json()) as { stopped: boolean };
    expect(stop.stopped).toBe(true);
    gate.open();
    const decoder = new TextDecoder();
    let buffer = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      gate.open();
    }
    const tail = parseFrames(buffer);
    expect(tail.at(-1)?.event).toBe("done");
    expect(tail.at(-1)?.data["status"]).toBe("done");
  });

  test("stop without an in-flight turn reports stopped false", async () => {
    const fetchImpl = demo();
    const stop = (await (
      await send(fetchImpl, "POST", "/v1/sessions/9f21c8a4d301/stop", {})
    ).json()) as { stopped: boolean };
    expect(stop.stopped).toBe(false);
    expect(
      (await send(fetchImpl, "POST", "/v1/sessions/ffffffffffff/stop", {})).status,
    ).toBe(404);
  });

  test("a second concurrent turn conflicts, and cancel releases it", async () => {
    const gate = makeGate();
    const fetchImpl = demo(gate.delay);
    const res = await send(fetchImpl, "POST", "/v1/sessions/b4e07d2f5c19/messages", {
      content: "first",
    });
    const { reader } = await readSome(res, 2);
    const conflict = await send(fetchImpl, "POST", "/v1/sessions/b4e07d2f5c19/messages", {
      content: "second",
    });
    expect(conflict.status).toBe(409);
    await reader.cancel();
    gate.open();
    await Promise.resolve();
    const retry = await send(fetchImpl, "POST", "/v1/sessions/b4e07d2f5c19/messages", {
      content: "write a haiku about retries",
    });
    expect(retry.status).toBe(200);
    const retryReader = (retry.body as ReadableStream<Uint8Array>).getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    for (;;) {
      gate.open();
      const { done, value } = await retryReader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });
    }
    expect(parseFrames(buffer).at(-1)?.event).toBe("done");
  });

  test("editing regenerates from the edited message", async () => {
    const fetchImpl = demo();
    const res = await send(fetchImpl, "PATCH", "/v1/sessions/9f21c8a4d301/messages/9f21c8a4d3010a", {
      content: "check the logs instead",
    });
    const events = await frames(res);
    expect(events[0]?.event).toBe("user");
    expect(events[0]?.data["content"]).toBe("check the logs instead");
    expect(events[0]?.data["editedAt"]).not.toBeNull();
    const list = (await (
      await get(fetchImpl, "/v1/sessions/9f21c8a4d301/messages")
    ).json()) as { messages: { role: string }[] };
    expect(list.messages.length).toBe(2);
  });

  test("edit validation, assistant messages, and unknown targets", async () => {
    const fetchImpl = demo();
    expect(
      (
        await send(fetchImpl, "PATCH", "/v1/sessions/9f21c8a4d301/messages/9f21c8a4d3010a", {
          content: " ",
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await send(fetchImpl, "PATCH", "/v1/sessions/9f21c8a4d301/messages/9f21c8a4d3010b", {
          content: "x",
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await send(fetchImpl, "PATCH", "/v1/sessions/ffffffffffff/messages/9f21c8a4d3010a", {
          content: "x",
        })
      ).status,
    ).toBe(404);
  });

  test("reactions toggle on and off", async () => {
    const fetchImpl = demo();
    const path = "/v1/sessions/9f21c8a4d301/messages/9f21c8a4d3010b/reactions";
    const first = (await (await send(fetchImpl, "POST", path, { emoji: "🔥" })).json()) as {
      reactions: Record<string, number>;
    };
    expect(first.reactions).toEqual({ "🔥": 1 });
    const second = (await (await send(fetchImpl, "POST", path, { emoji: "🔥" })).json()) as {
      reactions: Record<string, number>;
    };
    expect(second.reactions).toEqual({});
    expect((await send(fetchImpl, "POST", path, { emoji: "" })).status).toBe(400);
    expect(
      (
        await send(fetchImpl, "POST", "/v1/sessions/9f21c8a4d301/messages/ffff/reactions", {
          emoji: "🔥",
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await send(fetchImpl, "POST", "/v1/sessions/ffffffffffff/messages/ffff/reactions", {
          emoji: "🔥",
        })
      ).status,
    ).toBe(404);
  });

  test("deleting sessions", async () => {
    const fetchImpl = demo();
    expect((await send(fetchImpl, "DELETE", "/v1/sessions/77aa39e1f0b2")).status).toBe(200);
    expect((await get(fetchImpl, "/v1/sessions/77aa39e1f0b2/messages")).status).toBe(404);
    expect((await send(fetchImpl, "DELETE", "/v1/sessions/77aa39e1f0b2")).status).toBe(404);
  });
});

describe("runs", () => {
  test("lists seeded runs newest first", async () => {
    const fetchImpl = demo();
    const body = (await (await get(fetchImpl, "/v1/runs")).json()) as {
      runs: { id: string; createdAt: string }[];
    };
    expect(body.runs[0]?.id).toBe("run_7f3a91");
    expect(body.runs.length).toBeGreaterThanOrEqual(4);
  });

  test("creates, inspects, and streams a run", async () => {
    const fetchImpl = demo();
    const created = (await (
      await send(fetchImpl, "POST", "/v1/runs", { input: "audit dependencies" })
    ).json()) as { id: string; status: string; output: string };
    expect(created.status).toBe("completed");
    expect(created.output).toContain("Audit complete");
    const fetched = (await (await get(fetchImpl, `/v1/runs/${created.id}`)).json()) as {
      input: string;
    };
    expect(fetched.input).toBe("audit dependencies");
    const events = await frames(await get(fetchImpl, `/v1/runs/${created.id}/events`));
    expect(events[0]?.event).toBe("run.started");
    expect(events.at(-1)?.event).toBe("run.completed");
    const deltas = events.filter((e) => e.event === "message.delta");
    expect(deltas.map((d) => d.data["delta"]).join("")).toBe(created.output);
  });

  test("tolerates missing and malformed run input", async () => {
    const fetchImpl = demo();
    const empty = (await (await send(fetchImpl, "POST", "/v1/runs", {})).json()) as {
      output: string;
    };
    expect(empty.output.length).toBeGreaterThan(0);
    const invalid = await fetchImpl(`${BASE}/v1/runs`, { method: "POST", body: "not json" });
    expect(invalid.status).toBe(201);
  });

  test("failed and stopped seeds stream their terminal events", async () => {
    const fetchImpl = demo();
    const failed = await frames(await get(fetchImpl, "/v1/runs/run_98d2e6/events"));
    expect(failed.at(-1)?.event).toBe("run.failed");
    const stopped = await frames(await get(fetchImpl, "/v1/runs/run_4b1c77/events"));
    expect(stopped.at(-1)?.event).toBe("run.stopped");
    expect(stopped.length).toBe(2);
  });

  test("stopping a run flips its status", async () => {
    const fetchImpl = demo();
    const stopped = (await (
      await send(fetchImpl, "POST", "/v1/runs/run_7f3a91/stop", {})
    ).json()) as { status: string };
    expect(stopped.status).toBe("stopped");
  });

  test("cancelling a run event stream stops the drip", async () => {
    const gate = makeGate();
    const fetchImpl = demo(gate.delay);
    const res = await get(fetchImpl, "/v1/runs/run_c25b04/events");
    const { frames: opening, reader } = await readSome(res, 1);
    expect(opening[0]?.event).toBe("run.started");
    await reader.cancel();
    gate.open();
    await Promise.resolve();
  });

  test("aborting the request signal closes a run event stream", async () => {
    const gate = makeGate();
    const fetchImpl = demo(gate.delay);
    const controller = new AbortController();
    const res = await fetchImpl(`${BASE}/v1/runs/run_c25b04/events`, {
      signal: controller.signal,
    });
    const { frames: opening, reader } = await readSome(res, 1);
    expect(opening[0]?.event).toBe("run.started");
    controller.abort();
    expect((await reader.read()).done).toBe(true);
  });

  test("unknown runs and unmatched run routes 404", async () => {
    const fetchImpl = demo();
    expect((await get(fetchImpl, "/v1/runs/run_none")).status).toBe(404);
    expect((await send(fetchImpl, "POST", "/v1/runs/run_7f3a91/events", {})).status).toBe(404);
    expect((await get(fetchImpl, "/v1/runs/run_7f3a91/steer")).status).toBe(404);
  });
});

describe("memory, soul, config", () => {
  test("management surfaces demand the api key", async () => {
    const fetchImpl = demo();
    for (const path of ["/v1/memory", "/v1/soul", "/v1/config"]) {
      const res = await get(fetchImpl, path);
      expect(res.status).toBe(403);
      const body = (await res.json()) as { error: { code: string } };
      expect(body.error.code).toBe("api_key_required");
    }
    expect((await send(demo(), "PUT", "/v1/memory", { content: "x" })).status).toBe(403);
    expect((await send(demo(), "PUT", "/v1/soul", { content: "x" })).status).toBe(403);
    expect(
      (await send(demo(), "POST", "/v1/memory/entries", { action: "add", text: "x" })).status,
    ).toBe(403);
    expect((await send(demo(), "PUT", "/v1/config/model.name", { value: "x" })).status).toBe(403);
    expect((await send(demo(), "DELETE", "/v1/config/model.name")).status).toBe(403);
    expect((await get(demo(), "/v1/config/model.name")).status).toBe(403);
  });

  test("reads and writes both memory files", async () => {
    const fetchImpl = demo();
    const memory = (await (await get(fetchImpl, "/v1/memory", KEY)).json()) as {
      content: string;
      limit: number;
    };
    expect(memory.limit).toBe(2200);
    expect(memory.content).toContain("Friday");
    const user = (await (await get(fetchImpl, "/v1/memory/user", KEY)).json()) as {
      limit: number;
    };
    expect(user.limit).toBe(1375);
    const written = (await (
      await send(fetchImpl, "PUT", "/v1/memory", { content: "fresh notes" }, KEY)
    ).json()) as { content: string; chars: number; limit: number };
    expect(written).toEqual({ content: "fresh notes", chars: 11, limit: 2200 });
    const userWritten = (await (
      await send(fetchImpl, "PUT", "/v1/memory/user", { content: "profile" }, KEY)
    ).json()) as { limit: number };
    expect(userWritten.limit).toBe(1375);
  });

  test("memory write validation and overflow", async () => {
    const fetchImpl = demo();
    expect((await send(fetchImpl, "PUT", "/v1/memory", { content: 5 }, KEY)).status).toBe(400);
    const overflow = await send(
      fetchImpl,
      "PUT",
      "/v1/memory",
      { content: "x".repeat(2201) },
      KEY,
    );
    expect(overflow.status).toBe(400);
    const body = (await overflow.json()) as { error: { code: string } };
    expect(body.error.code).toBe("memory_overflow");
  });

  test("memory entries add, replace, remove", async () => {
    const fetchImpl = demo();
    await send(fetchImpl, "PUT", "/v1/memory", { content: "" }, KEY);
    const added = (await (
      await send(fetchImpl, "POST", "/v1/memory/entries", { action: "add", text: "line one" }, KEY)
    ).json()) as { content: string };
    expect(added.content).toBe("line one");
    const replaced = (await (
      await send(
        fetchImpl,
        "POST",
        "/v1/memory/entries",
        { action: "replace", from: "line one", text: "line two" },
        KEY,
      )
    ).json()) as { content: string };
    expect(replaced.content).toBe("line two");
    const removed = (await (
      await send(fetchImpl, "POST", "/v1/memory/entries", { action: "remove", text: "line two" }, KEY)
    ).json()) as { content: string };
    expect(removed.content).toBe("");
  });

  test("memory entry edge cases", async () => {
    const fetchImpl = demo();
    expect(
      (await send(fetchImpl, "POST", "/v1/memory/entries", { action: "add" }, KEY)).status,
    ).toBe(400);
    expect(
      (
        await send(
          fetchImpl,
          "POST",
          "/v1/memory/entries",
          { action: "replace", from: "missing", text: "x" },
          KEY,
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await send(
          fetchImpl,
          "POST",
          "/v1/memory/entries",
          { action: "replace", text: "x" },
          KEY,
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await send(fetchImpl, "POST", "/v1/memory/entries", { action: "remove", text: "missing" }, KEY)
      ).status,
    ).toBe(404);
    const overflow = await send(
      fetchImpl,
      "POST",
      "/v1/memory/entries",
      { action: "add", text: "x".repeat(2300) },
      KEY,
    );
    expect(overflow.status).toBe(400);
    expect((await get(fetchImpl, "/v1/memory/journey", KEY)).status).toBe(404);
  });

  test("profile header retargets memory and soul", async () => {
    const fetchImpl = demo();
    const work = { "x-hermes-profile": "work" };
    const memory = (await (await get(fetchImpl, "/v1/memory", KEY, work)).json()) as {
      content: string;
    };
    expect(memory.content).toContain("Coverage threshold");
    const soul = (await (await get(fetchImpl, "/v1/soul", KEY, work)).json()) as {
      content: string;
    };
    expect(soul.content).toContain("Foreman");
    const bad = { "x-hermes-profile": "atlantis" };
    expect((await get(fetchImpl, "/v1/memory", KEY, bad)).status).toBe(404);
    expect((await get(fetchImpl, "/v1/soul", KEY, bad)).status).toBe(404);
    expect((await get(fetchImpl, "/v1/config", KEY, bad)).status).toBe(404);
  });

  test("soul reads, writes, and validates", async () => {
    const fetchImpl = demo();
    const soul = (await (await get(fetchImpl, "/v1/soul", KEY)).json()) as { content: string };
    expect(soul.content).toContain("Indra");
    const written = (await (
      await send(fetchImpl, "PUT", "/v1/soul", { content: "# New identity\n" }, KEY)
    ).json()) as { content: string };
    expect(written.content).toBe("# New identity\n");
    expect((await send(fetchImpl, "PUT", "/v1/soul", { content: 7 }, KEY)).status).toBe(400);
    expect((await get(fetchImpl, "/v1/soul/skins", KEY)).status).toBe(404);
    expect((await send(fetchImpl, "DELETE", "/v1/soul", undefined, KEY)).status).toBe(404);
  });

  test("config show, get, set, unset", async () => {
    const fetchImpl = demo();
    const shown = (await (await get(fetchImpl, "/v1/config", KEY)).json()) as { raw: string };
    expect(shown.raw).toContain("model:");
    expect(shown.raw).toContain("  name: hermes-4-405b");
    const got = (await (await get(fetchImpl, "/v1/config/model.name", KEY)).json()) as {
      raw: string;
    };
    expect(got.raw).toBe("hermes-4-405b");
    await send(fetchImpl, "PUT", "/v1/config/model.name", { value: "hermes-4-70b" }, KEY);
    const updated = (await (await get(fetchImpl, "/v1/config/model.name", KEY)).json()) as {
      raw: string;
    };
    expect(updated.raw).toBe("hermes-4-70b");
    await send(fetchImpl, "DELETE", "/v1/config/model.name", undefined, KEY);
    expect((await get(fetchImpl, "/v1/config/model.name", KEY)).status).toBe(502);
    expect(
      (await send(fetchImpl, "PUT", "/v1/config/model.name", { value: "" }, KEY)).status,
    ).toBe(400);
    expect((await send(fetchImpl, "PATCH", "/v1/config/model.name", {}, KEY)).status).toBe(404);
    expect((await get(fetchImpl, "/v1/config/bad/key", KEY)).status).toBe(404);
  });
});

describe("event firehose", () => {
  test("streams the backlog then live events until aborted", async () => {
    const fetchImpl = demo();
    const controller = new AbortController();
    const res = await fetchImpl(`${BASE}/v1/events`, {
      headers: { authorization: `Bearer ${KEY}` },
      signal: controller.signal,
    });
    const { frames: backlog, reader } = await readSome(res, 6);
    expect(backlog.map((f) => f.event)).toContain("cron.completed");
    expect(backlog[0]?.data["at"]).toBeString();
    await send(fetchImpl, "POST", "/v1/sessions", {});
    const decoder = new TextDecoder();
    let buffer = "";
    while (!buffer.includes("session.started")) {
      const { value } = await reader.read();
      buffer += decoder.decode(value, { stream: true });
    }
    controller.abort();
    for (;;) {
      const { done } = await reader.read().catch(() => ({ done: true }));
      if (done === true) {
        break;
      }
    }
  });

  test("aborting during the backlog ends the stream", async () => {
    const gate = makeGate();
    const fetchImpl = demo(gate.delay);
    const controller = new AbortController();
    const res = await fetchImpl(`${BASE}/v1/events`, { signal: controller.signal });
    const reader = (res.body as ReadableStream<Uint8Array>).getReader();
    controller.abort();
    gate.open();
    const { done } = await reader.read().catch(() => ({ done: true }));
    expect(done).toBe(true);
  });

  test("cancelling the stream unsubscribes", async () => {
    const fetchImpl = demo();
    const res = await get(fetchImpl, "/v1/events", KEY);
    const { frames: backlog, reader } = await readSome(res, 6);
    expect(backlog.length).toBe(6);
    await reader.cancel();
  });
});
