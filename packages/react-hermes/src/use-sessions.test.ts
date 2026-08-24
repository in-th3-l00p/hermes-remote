import { GlobalRegistrator } from "@happy-dom/global-registrator";
GlobalRegistrator.register();

import { afterAll, describe, expect, test } from "bun:test";

afterAll(async () => {
  await GlobalRegistrator.unregister();
});
import { act, renderHook, waitFor } from "@testing-library/react";
import { useSessions, type SessionsClientLike } from "./index.ts";
import type { ChatSessionMeta } from "@in-th3-l00p/hermes-remote-client";

const meta = (id: string): ChatSessionMeta => ({
  id,
  userId: null,
  title: id,
  createdAt: "t",
  updatedAt: "t",
});

describe("useSessions", () => {
  test("loads, refreshes, and removes sessions", async () => {
    const deleted: string[] = [];
    let listCalls = 0;
    const client: SessionsClientLike = {
      listSessions: async (ids) => {
        listCalls += 1;
        expect(ids).toEqual(["a", "b"]);
        return [meta("a"), meta("b")];
      },
      deleteSession: async (id) => {
        deleted.push(id);
      },
    };
    const { result } = renderHook(() =>
      useSessions({ client, ids: ["a", "b"] }),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.sessions.map((s) => s.id)).toEqual(["a", "b"]);
    await act(async () => {
      await result.current.remove("a");
    });
    expect(deleted).toEqual(["a"]);
    expect(result.current.sessions.map((s) => s.id)).toEqual(["b"]);
    await act(async () => {
      await result.current.refresh();
    });
    expect(listCalls).toBe(2);
    expect(result.current.error).toBeNull();
  });

  test("surfaces list errors", async () => {
    const client: SessionsClientLike = {
      listSessions: async () => {
        throw new Error("list broke");
      },
      deleteSession: async () => undefined,
    };
    const { result } = renderHook(() => useSessions({ client }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe("list broke");
    const throwing: SessionsClientLike = {
      listSessions: async () => {
        throw "raw string";
      },
      deleteSession: async () => undefined,
    };
    const { result: second } = renderHook(() =>
      useSessions({ client: throwing }),
    );
    await waitFor(() => expect(second.current.error).toBe("raw string"));
  });
});
