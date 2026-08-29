import { GlobalRegistrator } from "@happy-dom/global-registrator";
GlobalRegistrator.register();

import { afterAll, describe, expect, test } from "bun:test";

afterAll(async () => {
  await GlobalRegistrator.unregister();
});
import { act, renderHook, waitFor } from "@testing-library/react";
import { useAction, useResource } from "./index.ts";

describe("useResource", () => {
  test("loads, refreshes, and reloads on dep change", async () => {
    let calls = 0;
    const { result, rerender } = renderHook(
      ({ id }: { id: string }) =>
        useResource(async () => {
          calls += 1;
          return `${id}:${calls}`;
        }, [id]),
      { initialProps: { id: "a" } },
    );
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toBe("a:1");
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.data).toBe("a:2");
    rerender({ id: "b" });
    await waitFor(() => expect(result.current.data).toBe("b:3"));
    expect(result.current.error).toBeNull();
  });

  test("captures errors as strings", async () => {
    const { result } = renderHook(() =>
      useResource(async () => {
        throw new Error("denied");
      }, []),
    );
    await waitFor(() => expect(result.current.error).toBe("denied"));
    expect(result.current.data).toBeNull();
    const { result: thrown } = renderHook(() =>
      useResource(async () => {
        throw "raw";
      }, []),
    );
    await waitFor(() => expect(thrown.current.error).toBe("raw"));
  });
});

describe("useAction", () => {
  test("runs, tracks pending, captures results and errors", async () => {
    let resolve: ((v: string) => void) | null = null;
    const { result } = renderHook(() =>
      useAction(
        (name: string) =>
          new Promise<string>((r) => {
            resolve = () => r(`hi ${name}`);
          }),
      ),
    );
    expect(result.current.pending).toBe(false);
    let run: Promise<unknown> | null = null;
    act(() => {
      run = result.current.run("ada");
    });
    expect(result.current.pending).toBe(true);
    await act(async () => {
      resolve?.("x");
      await run;
    });
    expect(result.current.pending).toBe(false);
    expect(result.current.result).toBe("hi ada");
    expect(result.current.error).toBeNull();

    const { result: failing } = renderHook(() =>
      useAction(async () => {
        throw new Error("boom");
      }),
    );
    await act(async () => {
      await failing.current.run().catch(() => {});
    });
    expect(failing.current.error).toBe("boom");
    expect(failing.current.pending).toBe(false);
  });
});
