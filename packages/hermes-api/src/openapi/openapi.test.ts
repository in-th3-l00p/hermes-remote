import { describe, expect, test } from "bun:test";
import { buildOpenApi, canonicalOpenApi } from "./index.ts";

type Doc = { paths: Record<string, Record<string, { responses: object }>>; info: object };

describe("OpenAPI document", () => {
  test("documents every operation, with resolvable references", async () => {
    const doc = (await canonicalOpenApi()) as Doc;
    const operations = Object.values(doc.paths).flatMap((ops) => Object.values(ops));
    expect(operations.length).toBeGreaterThan(190);
    for (const op of operations) {
      expect(Object.keys(op.responses)).toContain("default");
    }
    const refs = new Set<string>();
    JSON.stringify(doc, (key, value: unknown) => {
      if (key === "$ref") {
        refs.add(value as string);
      }
      return value;
    });
    for (const ref of refs) {
      let node: unknown = doc;
      for (const part of ref.replace("#/", "").split("/")) {
        node = (node as Record<string, unknown> | undefined)?.[part];
      }
      expect(`${ref} ${node === undefined ? "dangling" : "ok"}`).toBe(`${ref} ok`);
    }
  });

  test("the committed snapshot is current", async () => {
    const doc = await canonicalOpenApi();
    const stable = { ...doc, info: { ...(doc["info"] as object), version: "0.0.0" } };
    const committed = await Bun.file(new URL("../../openapi.json", import.meta.url)).json();
    // Run `bun scripts/openapi.ts` after changing routes or schemas.
    expect(committed).toEqual(JSON.parse(JSON.stringify(stable)));
  });

  test("an undocumented route is an error, not a silent gap", () => {
    expect(() => buildOpenApi([{ method: "GET", path: "/v1/nope" }], "1")).toThrow(
      "undocumented routes: GET /v1/nope",
    );
  });
});
