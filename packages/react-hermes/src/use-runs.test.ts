import { GlobalRegistrator } from "@happy-dom/global-registrator";
GlobalRegistrator.register();

import { afterAll, describe, expect, test } from "bun:test";

afterAll(async () => {
  await GlobalRegistrator.unregister();
});
import { act, renderHook, waitFor } from "@testing-library/react";
import {
  useRunEvents,
  useRuns,
  type RunEventsClientLike,
  type RunsClientLike,
} from "./index.ts";

describe("useRuns", () => {
  test("lists, creates, and refreshes runs", async () => {
    const created: unknown[] = [];
    let listCalls = 0;
    const client: RunsClientLike = {
      runs: {
        list: async () => {
          listCalls += 1;
          return [{ id: `r${listCalls}` }];
        },
        create: async (body) => {
          created.push(body);
          return { id: "new" };
        },
      },
    };
    const { result } = renderHook(() => useRuns({ client }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.runs).toEqual([{ id: "r1" }]);
    await act(async () => {
      expect(await result.current.create({ input: "go" })).toEqual({ id: "new" });
    });
    expect(created).toEqual([{ input: "go" }]);
    expect(result.current.runs).toEqual([{ id: "r2" }]);
    expect(result.current.error).toBeNull();
  });

  test("captures list failures", async () => {
    const client: RunsClientLike = {
      runs: {
        list: async () => {
          throw new Error("denied");
        },
        create: async () => ({}),
      },
    };
    const { result } = renderHook(() => useRuns({ client }));
    await waitFor(() => expect(result.current.error).toBe("denied"));
    expect(result.current.loading).toBe(false);
  });
});

describe("useRunEvents", () => {
  test("collects events until the stream completes", async () => {
    const client: RunEventsClientLike = {
      runs: {
        events: (id) =>
          (async function* () {
            yield { event: "run.started", data: { id } };
            yield { event: "run.completed", data: { id } };
          })(),
      },
    };
    const { result } = renderHook(() =>
      useRunEvents({ client, runId: "r1" }),
    );
    await waitFor(() => expect(result.current.done).toBe(true));
    expect(result.current.events).toEqual([
      { event: "run.started", data: { id: "r1" } },
      { event: "run.completed", data: { id: "r1" } },
    ]);
    expect(result.current.error).toBeNull();
  });

  test("stays idle without a run id and resets on change", async () => {
    const seen: string[] = [];
    const client: RunEventsClientLike = {
      runs: {
        events: (id) =>
          (async function* () {
            seen.push(id);
            yield { event: "run.started", data: { id } };
          })(),
      },
    };
    const { result, rerender } = renderHook(
      ({ runId }: { runId: string | null }) => useRunEvents({ client, runId }),
      { initialProps: { runId: null as string | null } },
    );
    expect(result.current.done).toBe(false);
    expect(result.current.events).toEqual([]);
    rerender({ runId: "r1" });
    await waitFor(() => expect(result.current.events).toHaveLength(1));
    rerender({ runId: "r2" });
    await waitFor(() =>
      expect(result.current.events).toEqual([
        { event: "run.started", data: { id: "r2" } },
      ]),
    );
    expect(seen).toEqual(["r1", "r2"]);
  });

  test("captures stream failures", async () => {
    const client: RunEventsClientLike = {
      runs: {
        events: () =>
          (async function* () {
            yield { event: "run.started", data: {} };
            throw new Error("stream broke");
          })(),
      },
    };
    const { result } = renderHook(() =>
      useRunEvents({ client, runId: "r1" }),
    );
    await waitFor(() => expect(result.current.error).toBe("stream broke"));
    expect(result.current.done).toBe(false);
  });

  test("aborts the subscription on unmount", async () => {
    let aborted = false;
    const client: RunEventsClientLike = {
      runs: {
        events: (_id, signal) =>
          (async function* () {
            yield { event: "run.started", data: {} };
            await new Promise<never>((_, reject) => {
              signal?.addEventListener("abort", () => {
                aborted = true;
                reject(new Error("aborted"));
              });
            });
          })(),
      },
    };
    const { result, unmount } = renderHook(() =>
      useRunEvents({ client, runId: "r1" }),
    );
    await waitFor(() => expect(result.current.events).toHaveLength(1));
    unmount();
    await waitFor(() => expect(aborted).toBe(true));
  });
});
