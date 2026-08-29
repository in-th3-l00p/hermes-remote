import { GlobalRegistrator } from "@happy-dom/global-registrator";
GlobalRegistrator.register();

import { afterAll, describe, expect, test } from "bun:test";

afterAll(async () => {
  await GlobalRegistrator.unregister();
});
import { act, renderHook, waitFor } from "@testing-library/react";
import { useAgentInfo, type AgentInfoClientLike } from "./index.ts";

describe("useAgentInfo", () => {
  test("loads health, capabilities, and models together", async () => {
    let calls = 0;
    const client: AgentInfoClientLike = {
      discovery: {
        health: async () => {
          calls += 1;
          return { status: "ok" };
        },
        capabilities: async () => ({ object: "caps" }),
        models: async () => ({ data: [] }),
      },
    };
    const { result } = renderHook(() => useAgentInfo({ client }));
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.health).toEqual({ status: "ok" });
    expect(result.current.capabilities).toEqual({ object: "caps" });
    expect(result.current.models).toEqual({ data: [] });
    expect(result.current.error).toBeNull();
    await act(async () => {
      await result.current.refresh();
    });
    expect(calls).toBe(2);
  });

  test("captures failures as an error string", async () => {
    const client: AgentInfoClientLike = {
      discovery: {
        health: async () => {
          throw new Error("down");
        },
        capabilities: async () => ({}),
        models: async () => ({}),
      },
    };
    const { result } = renderHook(() => useAgentInfo({ client }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe("down");
    expect(result.current.health).toBeNull();
  });

  test("stringifies non-error failures", async () => {
    const client: AgentInfoClientLike = {
      discovery: {
        health: async () => ({}),
        capabilities: async () => {
          throw "nope";
        },
        models: async () => ({}),
      },
    };
    const { result } = renderHook(() => useAgentInfo({ client }));
    await waitFor(() => expect(result.current.error).toBe("nope"));
  });
});
