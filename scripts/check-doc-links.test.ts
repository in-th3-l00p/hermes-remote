import { describe, expect, test } from "bun:test";
import { anchorsOf, brokenLinks, linksOf, routeOf, slug } from "./check-doc-links.ts";

describe("slug", () => {
  test("matches VitePress anchors", () => {
    expect(slug("Client and server versions")).toBe("client-and-server-versions");
    expect(slug("502 `upstream_error`")).toBe("_502-upstream-error");
    expect(slug("Errors, codes & more")).toBe("errors-codes-more");
  });
});

describe("routeOf", () => {
  test("maps files to routes", () => {
    expect(routeOf("guide/compatibility.md")).toBe("/guide/compatibility");
    expect(routeOf("api/index.md")).toBe("/api/");
    expect(routeOf("index.md")).toBe("/");
  });
});

describe("linksOf and anchorsOf", () => {
  test("skip code blocks and external links", () => {
    const text =
      '[a](/guide/a) [b](https://x.dev/y)\n```md\n[c](/nope)\n# Not a heading\n```\nlink: "/side"\n## Real heading';
    expect(linksOf(text)).toEqual(["/guide/a", "/side"]);
    expect([...anchorsOf(text)]).toEqual(["real-heading"]);
  });
});

describe("brokenLinks", () => {
  const pages = new Map([
    ["/", "# Home"],
    ["/api/", "# API\n## Errors"],
    ["/guide/a", "# A"],
  ]);

  test("accepts pages, index routes, .html links and existing anchors", () => {
    const sources = new Map([
      ["x.md", "[1](/guide/a) [2](/api/#errors) [3](/api) [4](/guide/a.html) [5](/)"],
    ]);
    expect(brokenLinks(pages, sources)).toEqual([]);
  });

  test("reports missing pages and missing anchors", () => {
    const sources = new Map([["x.md", "[1](/guide/b) [2](/api/#nope)"]]);
    expect(brokenLinks(pages, sources)).toEqual([
      "x.md: no page for /guide/b",
      "x.md: no heading #nope on /api/",
    ]);
  });
});
