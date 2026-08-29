import { GlobalRegistrator } from "@happy-dom/global-registrator";
GlobalRegistrator.register();

import { afterAll, describe, expect, test } from "bun:test";

afterAll(async () => {
  await GlobalRegistrator.unregister();
});
import { act, renderHook, waitFor } from "@testing-library/react";
import {
  useAgentSessions,
  useAgentStatus,
  useBundles,
  useCheckpoints,
  useCommands,
  useConfig,
  useEvents,
  useGateway,
  useGoal,
  useHooksInfo,
  useJobsAdmin,
  useKanban,
  useMcp,
  useMemory,
  usePlugins,
  useProfiles,
  useProjects,
  useSkills,
  useSoul,
  useToolsets,
} from "./index.ts";

const cli = { ok: true, raw: "out" };

function stubClient() {
  const calls: string[] = [];
  const record = <T>(name: string, value: T): (() => Promise<T>) => {
    return async () => {
      calls.push(name);
      return value;
    };
  };
  return {
    calls,
    profiles: { list: record("profiles", [{ name: "indra" }]) },
    agent: { status: record("agent", cli) },
    config: { show: record("config", cli) },
    memory: { get: record("memory", { content: "m", chars: 1, limit: 2200 }) },
    soul: { get: record("soul", { content: "s" }) },
    skills: { list: record("skills", { data: [] }) },
    bundles: { list: record("bundles", [{ name: "b", content: "y" }]) },
    checkpoints: { list: record("checkpoints", cli) },
    hooks: { list: record("hooks", cli) },
    gateway: { status: record("gateway", cli) },
    kanban: { tasks: record("kanban", cli) },
    projects: { list: record("projects", cli) },
    toolsets: { list: record("toolsets", { data: [] }) },
    mcp: { list: record("mcp", cli) },
    plugins: { list: record("plugins", cli) },
    agentSessions: { list: record("agentSessions", { sessions: [] }) },
    commands: { list: record("commands", { relay: true, commands: [] }) },
    jobs: { list: record("jobs", [] as unknown[]) },
  };
}

describe("management hooks", () => {
  test("each named hook fetches its resource", async () => {
    const client = stubClient();
    const hooks: [string, () => { data: unknown; loading: boolean }][] = [
      ["profiles", () => useProfiles({ client })],
      ["agent", () => useAgentStatus({ client })],
      ["config", () => useConfig({ client })],
      ["memory", () => useMemory({ client })],
      ["soul", () => useSoul({ client })],
      ["skills", () => useSkills({ client })],
      ["bundles", () => useBundles({ client })],
      ["checkpoints", () => useCheckpoints({ client })],
      ["hooks", () => useHooksInfo({ client })],
      ["gateway", () => useGateway({ client })],
      ["kanban", () => useKanban({ client })],
      ["projects", () => useProjects({ client })],
      ["toolsets", () => useToolsets({ client })],
      ["mcp", () => useMcp({ client })],
      ["plugins", () => usePlugins({ client })],
      ["agentSessions", () => useAgentSessions({ client })],
      ["commands", () => useCommands({ client })],
      ["jobs", () => useJobsAdmin({ client })],
    ];
    for (const [name, hook] of hooks) {
      const { result } = renderHook(hook);
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.data).not.toBeNull();
      expect(client.calls).toContain(name);
    }
  });
});

describe("useGoal", () => {
  test("reads goal state and refreshes after mutations", async () => {
    const actions: string[] = [];
    let reads = 0;
    const client = {
      goals: {
        get: async (id: string) => {
          reads += 1;
          return { text: `goal for ${id} v${reads}` } as never;
        },
        set: async (_id: string, text: string) => {
          actions.push(`set:${text}`);
        },
        clear: async () => {
          actions.push("clear");
        },
        pause: async () => {
          actions.push("pause");
        },
        resume: async () => {
          actions.push("resume");
        },
        addGate: async (_id: string, command: string) => {
          actions.push(`gate:${command}`);
        },
        addSubgoal: async (_id: string, text: string) => {
          actions.push(`subgoal:${text}`);
        },
      },
    };
    const { result } = renderHook(() =>
      useGoal({ client, sessionId: "s1" }),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.goal?.text).toBe("goal for s1 v1");
    await act(async () => {
      await result.current.set("ship");
      await result.current.pause();
      await result.current.resume();
      await result.current.addGate("bun test");
      await result.current.addSubgoal("docs");
      await result.current.clear();
    });
    expect(actions).toEqual([
      "set:ship",
      "pause",
      "resume",
      "gate:bun test",
      "subgoal:docs",
      "clear",
    ]);
    expect(reads).toBeGreaterThan(6);
    const idle = renderHook(() => useGoal({ client, sessionId: null }));
    await waitFor(() => expect(idle.result.current.loading).toBe(false));
    expect(idle.result.current.goal).toBeNull();
    await act(async () => {
      await idle.result.current.set("noop");
    });
    expect(actions).toHaveLength(6);
  });
});

describe("useEvents", () => {
  test("collects events and aborts on unmount", async () => {
    let aborted = false;
    const client = {
      events: {
        subscribe: (signal?: AbortSignal) =>
          (async function* () {
            yield { event: "run.created", data: { id: "r1" } };
            await new Promise<never>((_, reject) => {
              signal?.addEventListener("abort", () => {
                aborted = true;
                reject(new Error("aborted"));
              });
            });
          })(),
      },
    };
    const { result, unmount } = renderHook(() => useEvents({ client }));
    await waitFor(() => expect(result.current.events).toHaveLength(1));
    expect(result.current.connected).toBe(true);
    unmount();
    await waitFor(() => expect(aborted).toBe(true));
    const disabled = renderHook(() =>
      useEvents({ client, enabled: false }),
    );
    expect(disabled.result.current.connected).toBe(false);
    expect(disabled.result.current.events).toEqual([]);
  });

  test("captures stream failures", async () => {
    const client = {
      events: {
        subscribe: () =>
          (async function* () {
            yield { event: "x", data: {} };
            throw new Error("stream broke");
          })(),
      },
    };
    const { result } = renderHook(() => useEvents({ client }));
    await waitFor(() => expect(result.current.error).toBe("stream broke"));
    expect(result.current.connected).toBe(false);
  });
});
