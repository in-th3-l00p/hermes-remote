import { describe, expect, test } from "bun:test";
import { chunked, pickReply, pickRunOutput } from "./replies.ts";

describe("pickReply", () => {
  test("keys on deploy language", () => {
    expect(pickReply("Can you deploy to staging?")).toContain("deploy");
  });

  test("keys on log questions", () => {
    expect(pickReply("check the logs for errors")).toContain("logs");
  });

  test("keys on bug hunts", () => {
    expect(pickReply("the build is broken again")).toContain("reproduce");
  });

  test("writes haiku on request", () => {
    expect(pickReply("write a haiku about SSE")).toContain("\n");
  });

  test("greets greetings", () => {
    expect(pickReply("hello there")).toContain("terminal");
  });

  test("answers test questions", () => {
    expect(pickReply("how is coverage looking?")).toContain("100%");
  });

  test("acknowledges memory requests", () => {
    expect(pickReply("remember that I prefer tabs")).toContain("MEMORY.md");
  });

  test("falls back deterministically", () => {
    const first = pickReply("quarterly planning");
    expect(pickReply("quarterly planning")).toBe(first);
    expect(first.length).toBeGreaterThan(20);
  });
});

describe("pickRunOutput", () => {
  test("haiku runs", () => {
    expect(pickRunOutput("write a haiku about deploys")).toContain("\n");
  });

  test("audit runs", () => {
    expect(pickRunOutput("audit dependencies for CVEs")).toContain("Audit complete");
  });

  test("index rebuild runs", () => {
    expect(pickRunOutput("rebuild the search index")).toContain("downtime");
  });

  test("generic runs echo the task", () => {
    expect(pickRunOutput("water the plants")).toContain("water the plants");
  });
});

describe("chunked", () => {
  test("splits into word chunks that reassemble", () => {
    const text = "one two  three\nfour";
    expect(chunked(text).join("")).toBe(text);
    expect(chunked(text).length).toBe(4);
  });

  test("empty text yields itself", () => {
    expect(chunked("")).toEqual([""]);
  });
});
