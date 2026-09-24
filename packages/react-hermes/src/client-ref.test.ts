import { GlobalRegistrator } from "@happy-dom/global-registrator";
GlobalRegistrator.register();

import { afterAll, describe, expect, test } from "bun:test";

afterAll(async () => {
  await GlobalRegistrator.unregister();
});
import { act, renderHook, waitFor } from "@testing-library/react";
import { clientKey } from "./client-ref.ts";
import { useAction, useAgentInfo, useConfig, useRuns, useSessions } from "./index.ts";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("inline clients", () => {
  test("clientKey is the base URL when there is one", () => {
    const object = { runs: {} };
    expect(clientKey({ baseUrl: "http://a" })).toBe("http://a");
    expect(clientKey(object)).toBe(object);
    expect(clientKey(null)).toBeNull();
  });

  test("hooks given a new client object every render don't refetch in a loop", async () => {
    const calls = { runs: 0, sessions: 0, info: 0, config: 0 };
    const makeClient = () => ({
      baseUrl: "http://hermes.test",
      runs: {
        list: async () => {
          calls.runs += 1;
          return [];
        },
        create: async () => ({}),
      },
      listSessions: async () => {
        calls.sessions += 1;
        return [];
      },
      deleteSession: async () => {},
      discovery: {
        health: async () => {
          calls.info += 1;
          return { ok: true };
        },
        capabilities: async () => ({}),
        models: async () => [],
      },
      config: {
        show: async () => {
          calls.config += 1;
          return { ok: true, raw: "" };
        },
      },
    });
    const { result } = renderHook(() => {
      const client = makeClient();
      return {
        runs: useRuns({ client }),
        sessions: useSessions({ client }),
        info: useAgentInfo({ client: client as never }),
        config: useConfig({ client }),
      };
    });
    await waitFor(() => expect(result.current.runs.loading).toBe(false));
    await sleep(50);
    expect(calls).toEqual({ runs: 1, sessions: 1, info: 1, config: 1 });
  });

  test("calls go to the newest client and action", async () => {
    let token = "first";
    const seen: string[] = [];
    const { result, rerender } = renderHook(() => {
      const current = token;
      const client = {
        baseUrl: "http://hermes.test",
        runs: {
          list: async () => {
            seen.push(current);
            return [];
          },
          create: async () => ({}),
        },
      };
      return {
        runs: useRuns({ client }),
        action: useAction(async () => current),
      };
    });
    await waitFor(() => expect(result.current.runs.loading).toBe(false));
    token = "second";
    rerender();
    await act(async () => {
      await result.current.runs.refresh();
    });
    expect(seen).toEqual(["first", "second"]);
    let returned: string | null = null;
    await act(async () => {
      returned = await result.current.action.run();
    });
    expect(returned as string | null).toBe("second");
  });
});
