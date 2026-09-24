import { GlobalRegistrator } from "@happy-dom/global-registrator";
GlobalRegistrator.register();

import { afterAll, describe, expect, test } from "bun:test";

afterAll(async () => {
  await GlobalRegistrator.unregister();
});
import { renderHook, waitFor } from "@testing-library/react";
import {
  useHermesAuth,
  useInsights,
  useJourney,
  useSession,
  useSkillHub,
  useSubagents,
} from "./index.ts";

const cli = (raw: string) => ({ ok: true, raw });

describe("query hooks", () => {
  test("useSession loads a session's messages, and nothing for a null id", async () => {
    const asked: string[] = [];
    const client = {
      listMessages: async (id: string) => {
        asked.push(id);
        return [{ id: "m1" }];
      },
    };
    const { result, rerender } = renderHook(
      ({ id }: { id: string | null }) => useSession({ client, sessionId: id }),
      { initialProps: { id: null as string | null } },
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toEqual([]);
    rerender({ id: "s1" });
    await waitFor(() => expect(result.current.data).toEqual([{ id: "m1" }]));
    expect(asked).toEqual(["s1"]);
  });

  test("useInsights passes its filters", async () => {
    const seen: unknown[] = [];
    const client = {
      agent: {
        insights: async (options: unknown) => {
          seen.push(options);
          return cli("usage");
        },
      },
    };
    const { result } = renderHook(() => useInsights({ client, days: 7, source: "chat" }));
    await waitFor(() => expect(result.current.data?.raw).toBe("usage"));
    const plain = renderHook(() => useInsights({ client }));
    await waitFor(() => expect(plain.result.current.loading).toBe(false));
    expect(seen).toEqual([{ days: 7, source: "chat" }, {}]);
  });

  test("useSkillHub searches only non-blank queries", async () => {
    const searched: unknown[] = [];
    const client = {
      skills: {
        hubSearch: async (q: string, source?: string) => {
          searched.push([q, source]);
          return cli(`found ${q}`);
        },
      },
    };
    const { result, rerender } = renderHook(
      ({ q }: { q: string }) => useSkillHub({ client, query: q, source: "official" }),
      { initialProps: { q: "   " } },
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toBeNull();
    rerender({ q: " weather " });
    await waitFor(() => expect(result.current.data?.raw).toBe("found weather"));
    expect(searched).toEqual([["weather", "official"]]);
  });

  test("whoami, journey and subagents", async () => {
    const client = {
      whoami: async () => ({ type: "user", id: "u1" }),
      memory: { journey: async () => cli("timeline") },
      subagents: { list: async () => ({ transcripts: ["c1.jsonl"] }) },
    };
    const auth = renderHook(() => useHermesAuth({ client }));
    const journey = renderHook(() => useJourney({ client }));
    const subagents = renderHook(() => useSubagents({ client }));
    await waitFor(() => expect(auth.result.current.data).toEqual({ type: "user", id: "u1" }));
    await waitFor(() => expect(journey.result.current.data?.raw).toBe("timeline"));
    await waitFor(() =>
      expect(subagents.result.current.data).toEqual({ transcripts: ["c1.jsonl"] }),
    );
  });
});
