import { describe, expect, test } from "bun:test";
import { HermesUpstreamError } from "@in-th3-l00p/hermes-remote";
import { GROQ_MODEL } from "./groq.ts";
import { SandboxUpstream } from "./upstream.ts";

function fakeGroq(): { fetch: typeof fetch; calls: { url: string; body: Record<string, unknown> }[] } {
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  const impl = (async (url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    calls.push({ url: String(url), body });
    return Response.json({
      choices: [{ message: { content: "one crisp answer" } }],
    });
  }) as unknown as typeof fetch;
  return { fetch: impl, calls };
}

describe("SandboxUpstream surface", () => {
  test("every discovery fixture resolves directly", async () => {
    const upstream = new SandboxUpstream({ groqKey: "gsk", fetch: fakeGroq().fetch });
    expect(((await upstream.discovery.health()) as { model: string }).model).toBe(GROQ_MODEL);
    expect(((await upstream.discovery.capabilities()) as { model: string }).model).toBe(GROQ_MODEL);
    const models = (await upstream.discovery.models()) as {
      data: { id: string }[];
    };
    expect(models.data[0]?.id).toBe(GROQ_MODEL);
    expect(await upstream.discovery.modelOptions()).toEqual({ options: [] });
    expect(
      ((await upstream.discovery.skills()) as { data: unknown[] }).data,
    ).toHaveLength(2);
    expect(
      ((await upstream.discovery.toolsets()) as { data: unknown[] }).data,
    ).toHaveLength(2);
  });

  test("runs round-trip: create, get, events, stop, steer, approve", async () => {
    const now = () => new Date("2026-08-31T00:00:00Z");
    const upstream = new SandboxUpstream({ now });
    const created = (await upstream.runs.create({ input: "hi" })) as {
      id: string;
      output: string;
      created_at: string;
    };
    expect(created.output).toContain("sandbox demo run");
    expect(created.created_at).toBe("2026-08-31T00:00:00.000Z");
    const fetched = (await upstream.runs.get(created.id)) as { id: string };
    expect(fetched.id).toBe(created.id);
    const stream = await upstream.runs.events(created.id);
    const text = await new Response(stream).text();
    expect(text).toContain("event: run.started");
    expect(text).toContain("event: run.completed");
    const stopped = (await upstream.runs.stop(created.id)) as { status: string };
    expect(stopped.status).toBe("stopped");
    expect(
      ((await upstream.runs.steer(created.id, { text: "x" })) as {
        steer: unknown;
      }).steer,
    ).toEqual({ text: "x" });
    expect(
      ((await upstream.runs.approve(created.id, { approve: true })) as {
        response: unknown;
      }).response,
    ).toEqual({ approve: true });
    expect(upstream.runs.get("ghost")).rejects.toBeInstanceOf(
      HermesUpstreamError,
    );
    const nonString = (await upstream.runs.create({ input: 7 })) as {
      output: string;
    };
    expect(nonString.output).toBe("sandbox demo run: ");
  });
});
