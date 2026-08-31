import { describe, expect, test } from "bun:test";
import {
  HOMES,
  PROFILES,
  renderConfig,
  seedEvents,
  seedRuns,
  seedSessions,
} from "./seed.ts";
import { MEMORY_LIMIT, USER_LIMIT } from "./state.ts";

const now = new Date("2026-08-31T12:00:00Z");

describe("seedSessions", () => {
  test("builds titled multi-turn conversations", () => {
    const sessions = seedSessions(now);
    expect(sessions.length).toBeGreaterThanOrEqual(4);
    for (const session of sessions) {
      expect(session.title).not.toBeNull();
      expect(session.messages.length).toBeGreaterThanOrEqual(2);
      expect(session.messages[0]?.role).toBe("user");
      expect(session.messages.at(-1)?.role).toBe("assistant");
      expect(/^[0-9a-f]+$/.test(session.id)).toBe(true);
      expect(Date.parse(session.createdAt)).toBeLessThanOrEqual(
        Date.parse(session.updatedAt),
      );
    }
  });

  test("message timestamps ascend within a session", () => {
    for (const session of seedSessions(now)) {
      const times = session.messages.map((m) => Date.parse(m.createdAt));
      expect([...times].sort((a, b) => a - b)).toEqual(times);
    }
  });
});

describe("seedRuns", () => {
  test("covers several lifecycle states", () => {
    const runs = seedRuns(now);
    const states = new Set(runs.map((run) => run.status));
    expect(states).toContain("completed");
    expect(states).toContain("failed");
    expect(states).toContain("stopped");
    for (const run of runs) {
      expect(run.output.length).toBeGreaterThan(20);
    }
  });
});

describe("seedEvents", () => {
  test("produces a chronological backlog", () => {
    const events = seedEvents(now);
    expect(events.length).toBeGreaterThanOrEqual(5);
    const times = events.map((event) => Date.parse(event.at));
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });
});

describe("profile homes", () => {
  test("stay inside the memory budgets", () => {
    for (const profile of PROFILES) {
      const home = HOMES[profile.name as keyof typeof HOMES];
      expect(home.memory.length).toBeLessThanOrEqual(MEMORY_LIMIT);
      expect(home.user.length).toBeLessThanOrEqual(USER_LIMIT);
      expect(home.soul).toContain("You are");
    }
  });
});

describe("renderConfig", () => {
  test("groups dotted keys under their heads", () => {
    expect(renderConfig({ "model.name": "hermes-4-405b", "model.provider": "nous" })).toBe(
      "model:\n  name: hermes-4-405b\n  provider: nous\n",
    );
  });

  test("keeps plain keys inline", () => {
    expect(renderConfig({ verbose: "true" })).toBe("verbose: true\n");
  });

  test("mixes plain and nested groups", () => {
    expect(renderConfig({ "a.b": "1", c: "2" })).toBe("a:\n  b: 1\nc: 2\n");
  });
});
