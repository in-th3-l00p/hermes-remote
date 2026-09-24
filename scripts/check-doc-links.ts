// Fails when a docs page or the docs sidebar links to a page or heading
// that does not exist. Only site-absolute links (`/guide/...`) are checked;
// external URLs are left alone.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/** VitePress's heading anchor (the slugify from @mdit-vue/shared). */
export function slug(heading: string): string {
  return heading
    .normalize("NFKD")
    .replace(/[\u0300-\u036F]/g, "")
    .replace(/[\u0000-\u001f]/g, "")
    .replace(/[\s~`!@#$%^&*()\-_+=[\]{}|\\;:"'“”‘’<>,.?/]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/^(\d)/, "_$1")
    .toLowerCase();
}

/** The route a markdown file is served at: `guide/a.md` → `/guide/a`, `api/index.md` → `/api/`. */
export function routeOf(file: string): string {
  const path = `/${file.replace(/\.md$/, "")}`;
  return path.endsWith("/index") ? path.slice(0, -"index".length) : path;
}

export function anchorsOf(markdown: string): Set<string> {
  const withoutCode = markdown.replace(/```[\s\S]*?```/g, "");
  return new Set([...withoutCode.matchAll(/^#{1,6}\s+(.+)$/gm)].map(([, h]) => slug(h!)));
}

export function linksOf(text: string): string[] {
  const withoutCode = text.replace(/```[\s\S]*?```/g, "");
  const markdown = [...withoutCode.matchAll(/\]\((\/[^)\s]*)\)/g)].map(([, l]) => l!);
  const sidebar = [...withoutCode.matchAll(/link:\s*"(\/[^"]*)"/g)].map(([, l]) => l!);
  return [...markdown, ...sidebar];
}

/** `pages` maps each route to its markdown; `sources` maps a file name to text to scan. */
export function brokenLinks(pages: Map<string, string>, sources: Map<string, string>): string[] {
  const problems: string[] = [];
  for (const [source, text] of sources) {
    for (const link of linksOf(text)) {
      const [path = "", anchor] = link.split("#");
      const route = path.replace(/\.html$/, "");
      const page = pages.get(route) ?? pages.get(`${route}/`);
      if (page === undefined) {
        problems.push(`${source}: no page for ${link}`);
      } else if (anchor !== undefined && anchor !== "" && !anchorsOf(page).has(anchor)) {
        problems.push(`${source}: no heading #${anchor} on ${route}`);
      }
    }
  }
  return problems;
}

function* markdownFiles(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    if (entry.startsWith(".") || entry === "node_modules") {
      continue;
    }
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      yield* markdownFiles(path);
    } else if (path.endsWith(".md")) {
      yield path;
    }
  }
}

if (import.meta.main) {
  const docs = join(import.meta.dir, "..", "apps", "landing", "docs");
  const pages = new Map<string, string>();
  const sources = new Map<string, string>();
  for (const file of markdownFiles(docs)) {
    const text = readFileSync(file, "utf8");
    pages.set(routeOf(relative(docs, file)), text);
    sources.set(relative(docs, file), text);
  }
  sources.set(".vitepress/config.ts", readFileSync(join(docs, ".vitepress", "config.ts"), "utf8"));
  const problems = brokenLinks(pages, sources);
  for (const p of problems) {
    console.error(p);
  }
  console.log(`${pages.size} pages checked, ${problems.length} broken links`);
  process.exit(problems.length === 0 ? 0 : 1);
}
