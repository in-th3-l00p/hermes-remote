import { describe, expect, test } from "bun:test";
import { DemoUpstream } from "./demo.ts";
import { HermesUpstreamError } from "../chat/index.ts";

async function readAll(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      return text;
    }
    text += decoder.decode(value, { stream: true });
  }
}

describe("DemoUpstream discovery", () => {
  test("returns offline fixtures", async () => {
    const upstream = new DemoUpstream();
    expect(await upstream.discovery.health()).toMatchObject({
      status: "ok",
      platform: "demo",
    });
    expect(await upstream.discovery.capabilities()).toMatchObject({
      object: "demo.capabilities",
    });
    expect(await upstream.discovery.models()).toMatchObject({
      object: "list",
      data: [{ id: "demo", object: "model" }],
    });
    expect(await upstream.discovery.modelOptions()).toEqual({ options: [] });
    expect(await upstream.discovery.skills()).toEqual({
      object: "list",
      data: [],
    });
    expect(await upstream.discovery.toolsets()).toEqual({
      object: "list",
      data: [],
    });
  });

  test("chats through the demo agent", async () => {
    const upstream = new DemoUpstream();
    const chunks: string[] = [];
    for await (const chunk of upstream.chat.stream([
      { role: "user", content: "hi", attachments: [] },
    ])) {
      chunks.push(chunk);
    }
    expect(chunks.join("")).toContain("demo agent");
  });
});

describe("DemoUpstream runs", () => {
  test("creates, fetches, steers, approves, and stops runs", async () => {
    const upstream = new DemoUpstream();
    const created = (await upstream.runs.create({ input: "do a thing" })) as {
      id: string;
      status: string;
      input: unknown;
    };
    expect(created.id).toBe("run_1");
    expect(created.status).toBe("completed");
    expect(created.input).toBe("do a thing");
    expect(((await upstream.runs.create({ input: "x" })) as { id: string }).id).toBe(
      "run_2",
    );
    expect(await upstream.runs.get("run_1")).toMatchObject({ id: "run_1" });
    expect(await upstream.runs.steer("run_1", { text: "left" })).toMatchObject({
      id: "run_1",
      steered: true,
    });
    expect(await upstream.runs.approve("run_1", { approved: true })).toMatchObject({
      id: "run_1",
      approved: true,
    });
    expect(await upstream.runs.stop("run_1")).toMatchObject({
      id: "run_1",
      status: "stopped",
    });
  });

  test("streams a deterministic event sequence", async () => {
    const upstream = new DemoUpstream();
    await upstream.runs.create({ input: "x" });
    const text = await readAll(await upstream.runs.events("run_1"));
    expect(text).toContain("event: run.started");
    expect(text).toContain("event: run.output");
    expect(text).toContain("event: run.completed");
  });

  test("throws upstream 404 for unknown runs", async () => {
    const upstream = new DemoUpstream();
    for (const call of [
      () => upstream.runs.get("nope"),
      () => upstream.runs.events("nope"),
      () => upstream.runs.stop("nope"),
      () => upstream.runs.steer("nope", {}),
      () => upstream.runs.approve("nope", {}),
    ]) {
      const error = await call().then(
        () => null,
        (e: unknown) => e,
      );
      expect(error).toBeInstanceOf(HermesUpstreamError);
      expect((error as HermesUpstreamError).status).toBe(404);
    }
  });
});

describe("DemoUpstream jobs", () => {
  test("full crud and lifecycle", async () => {
    const upstream = new DemoUpstream();
    const created = (await upstream.jobs.create({ name: "sweep" })) as {
      id: string;
    };
    expect(created.id).toBe("job_1");
    expect(await upstream.jobs.list()).toEqual({
      jobs: [expect.objectContaining({ id: "job_1", name: "sweep", paused: false })],
    });
    expect(await upstream.jobs.get("job_1")).toMatchObject({ name: "sweep" });
    expect(
      await upstream.jobs.update("job_1", { name: "sweep2" }),
    ).toMatchObject({ name: "sweep2" });
    expect(await upstream.jobs.pause("job_1")).toMatchObject({ paused: true });
    expect(await upstream.jobs.resume("job_1")).toMatchObject({ paused: false });
    expect(await upstream.jobs.trigger("job_1")).toMatchObject({ runs: 1 });
    expect(await upstream.jobs.remove("job_1")).toEqual({ deleted: true });
    expect(await upstream.jobs.list()).toEqual({ jobs: [] });
  });

  test("throws upstream 404 for unknown jobs", async () => {
    const upstream = new DemoUpstream();
    for (const call of [
      () => upstream.jobs.get("nope"),
      () => upstream.jobs.update("nope", {}),
      () => upstream.jobs.remove("nope"),
      () => upstream.jobs.pause("nope"),
      () => upstream.jobs.resume("nope"),
      () => upstream.jobs.trigger("nope"),
    ]) {
      const error = await call().then(
        () => null,
        (e: unknown) => e,
      );
      expect(error).toBeInstanceOf(HermesUpstreamError);
      expect((error as HermesUpstreamError).status).toBe(404);
    }
  });
});
