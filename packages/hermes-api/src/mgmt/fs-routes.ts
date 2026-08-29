import type { Context, Hono } from "hono";
import { BridgeDenied, FsBridge } from "../bridge/index.ts";
import { error, json, requireScope, type ChatEnv } from "../chat/routes/shared.ts";
import { isUserGrantableScope } from "../scopes/index.ts";
import { currentProfile, requireKeyScope, type ManagementOptions } from "./shared.ts";

const MEMORY_LIMIT = 2200;
const USER_LIMIT = 1375;
const SKILL_NAME = ":name{[A-Za-z0-9_-]+}";

function guard(c: Context<ChatEnv>, scope: string): Response | null {
  const check = isUserGrantableScope(scope) ? requireScope : requireKeyScope;
  return check(c.get("principal"), scope);
}

function withBridge(
  options: ManagementOptions,
  handler: (c: Context<ChatEnv>, fs: FsBridge) => Promise<Response>,
) {
  return async (c: Context<ChatEnv>): Promise<Response> => {
    const fs = new FsBridge({ root: options.homeFor(currentProfile(c)) });
    try {
      return await handler(c, fs);
    } catch (cause) {
      if (cause instanceof BridgeDenied) {
        return error(400, "path_denied", cause.reason);
      }
      throw cause;
    }
  };
}

async function bodyContent(c: Context<ChatEnv>): Promise<string | null> {
  const body = (await c.req.json().catch(() => null)) as {
    content?: unknown;
  } | null;
  return typeof body?.content === "string" ? body.content : null;
}

function memoryBody(content: string, limit: number): unknown {
  return { content, chars: content.length, limit };
}

function registerMemoryFile(
  app: Hono<ChatEnv>,
  options: ManagementOptions,
  path: string,
  file: string,
  limit: number,
): void {
  app.get(
    path,
    withBridge(options, async (c, fs) => {
      const denied = guard(c, "memory:read");
      if (denied !== null) {
        return denied;
      }
      return json(200, memoryBody((await fs.read(file)) ?? "", limit));
    }),
  );
  app.put(
    path,
    withBridge(options, async (c, fs) => {
      const denied = guard(c, "memory:write");
      if (denied !== null) {
        return denied;
      }
      const content = await bodyContent(c);
      if (content === null) {
        return error(400, "invalid_request", "content (string) is required");
      }
      if (content.length > limit) {
        return error(400, "memory_overflow", `content exceeds ${limit} chars`);
      }
      await fs.write(file, content);
      return json(200, memoryBody(content, limit));
    }),
  );
}

export function registerFsRoutes(
  app: Hono<ChatEnv>,
  options: ManagementOptions,
): void {
  registerMemoryFile(app, options, "/v1/memory", "memories/MEMORY.md", MEMORY_LIMIT);
  registerMemoryFile(app, options, "/v1/memory/user", "memories/USER.md", USER_LIMIT);

  app.post(
    "/v1/memory/entries",
    withBridge(options, async (c, fs) => {
      const denied = guard(c, "memory:write");
      if (denied !== null) {
        return denied;
      }
      const body = (await c.req.json().catch(() => null)) as {
        action?: unknown;
        text?: unknown;
        from?: unknown;
      } | null;
      const action = body?.action;
      const text = typeof body?.text === "string" ? body.text : null;
      if (text === null || (action !== "add" && action !== "replace" && action !== "remove")) {
        return error(400, "invalid_request", "action (add|replace|remove) and text are required");
      }
      const current = (await fs.read("memories/MEMORY.md")) ?? "";
      const lines = current === "" ? [] : current.split("\n");
      if (action === "add") {
        lines.push(text);
      } else if (action === "replace") {
        const index = lines.indexOf(typeof body?.from === "string" ? body.from : "");
        if (index === -1) {
          return error(404, "entry_not_found", "No matching memory entry");
        }
        lines[index] = text;
      } else {
        const index = lines.indexOf(text);
        if (index === -1) {
          return error(404, "entry_not_found", "No matching memory entry");
        }
        lines.splice(index, 1);
      }
      const next = lines.join("\n");
      if (next.length > MEMORY_LIMIT) {
        return error(400, "memory_overflow", `content exceeds ${MEMORY_LIMIT} chars`);
      }
      await fs.write("memories/MEMORY.md", next);
      return json(200, memoryBody(next, MEMORY_LIMIT));
    }),
  );

  app.get(
    "/v1/soul",
    withBridge(options, async (c, fs) => {
      const denied = guard(c, "soul:read");
      if (denied !== null) {
        return denied;
      }
      return json(200, { content: (await fs.read("SOUL.md")) ?? "" });
    }),
  );
  app.put(
    "/v1/soul",
    withBridge(options, async (c, fs) => {
      const denied = guard(c, "soul:write");
      if (denied !== null) {
        return denied;
      }
      const content = await bodyContent(c);
      if (content === null) {
        return error(400, "invalid_request", "content (string) is required");
      }
      await fs.write("SOUL.md", content);
      return json(200, { content });
    }),
  );

  app.post(
    "/v1/skills",
    withBridge(options, async (c, fs) => {
      const denied = guard(c, "skills:write");
      if (denied !== null) {
        return denied;
      }
      const body = (await c.req.json().catch(() => null)) as {
        name?: unknown;
        content?: unknown;
      } | null;
      if (
        typeof body?.name !== "string" ||
        !/^[A-Za-z0-9_-]+$/.test(body.name) ||
        typeof body.content !== "string"
      ) {
        return error(400, "invalid_request", "name and content are required");
      }
      const path = `skills/${body.name}/SKILL.md`;
      if ((await fs.read(path)) !== null) {
        return error(409, "skill_exists", "Skill already exists");
      }
      await fs.write(path, body.content);
      return json(201, { name: body.name, content: body.content });
    }),
  );

  app.get(
    `/v1/skills/${SKILL_NAME}`,
    withBridge(options, async (c, fs) => {
      const denied = guard(c, "skills:read");
      if (denied !== null) {
        return denied;
      }
      const name = c.req.param("name");
      const content = await fs.read(`skills/${name}/SKILL.md`);
      if (content === null) {
        return error(404, "skill_not_found", "Unknown skill");
      }
      return json(200, { name, content });
    }),
  );

  app.patch(
    `/v1/skills/${SKILL_NAME}`,
    withBridge(options, async (c, fs) => {
      const denied = guard(c, "skills:write");
      if (denied !== null) {
        return denied;
      }
      const content = await bodyContent(c);
      if (content === null) {
        return error(400, "invalid_request", "content (string) is required");
      }
      const name = c.req.param("name");
      await fs.write(`skills/${name}/SKILL.md`, content);
      return json(200, { name, content });
    }),
  );

  app.delete(
    `/v1/skills/${SKILL_NAME}`,
    withBridge(options, async (c, fs) => {
      const denied = guard(c, "skills:write");
      if (denied !== null) {
        return denied;
      }
      const removed = await fs.remove(`skills/${c.req.param("name")}/SKILL.md`);
      if (!removed) {
        return error(404, "skill_not_found", "Unknown skill");
      }
      return json(200, { deleted: true });
    }),
  );

  const skillFilePath = (c: Context<ChatEnv>): string =>
    decodeURIComponent(
      new URL(c.req.url).pathname.split("/files/")[1] ?? "",
    );

  app.get(
    `/v1/skills/${SKILL_NAME}/files/*`,
    withBridge(options, async (c, fs) => {
      const denied = guard(c, "skills:read");
      if (denied !== null) {
        return denied;
      }
      const path = skillFilePath(c);
      const content = await fs.read(`skills/${c.req.param("name")}/${path}`);
      if (content === null) {
        return error(404, "file_not_found", "Unknown skill file");
      }
      return json(200, { path, content });
    }),
  );

  app.put(
    `/v1/skills/${SKILL_NAME}/files/*`,
    withBridge(options, async (c, fs) => {
      const denied = guard(c, "skills:write");
      if (denied !== null) {
        return denied;
      }
      const content = await bodyContent(c);
      if (content === null) {
        return error(400, "invalid_request", "content (string) is required");
      }
      const path = skillFilePath(c);
      await fs.write(`skills/${c.req.param("name")}/${path}`, content);
      return json(200, { path, content });
    }),
  );

  app.get(
    "/v1/bundles",
    withBridge(options, async (c, fs) => {
      const denied = guard(c, "bundles:read");
      if (denied !== null) {
        return denied;
      }
      const names = (await fs.list("skill-bundles")).filter((n) =>
        n.endsWith(".yaml"),
      );
      const bundles = [];
      for (const file of names.sort()) {
        bundles.push({
          name: file.replace(/\.yaml$/, ""),
          content: (await fs.read(`skill-bundles/${file}`)) ?? "",
        });
      }
      return json(200, { bundles });
    }),
  );

  app.get(
    `/v1/bundles/${SKILL_NAME}`,
    withBridge(options, async (c, fs) => {
      const denied = guard(c, "bundles:read");
      if (denied !== null) {
        return denied;
      }
      const name = c.req.param("name");
      const content = await fs.read(`skill-bundles/${name}.yaml`);
      if (content === null) {
        return error(404, "bundle_not_found", "Unknown bundle");
      }
      return json(200, { name, content });
    }),
  );

  app.put(
    `/v1/bundles/${SKILL_NAME}`,
    withBridge(options, async (c, fs) => {
      const denied = guard(c, "bundles:write");
      if (denied !== null) {
        return denied;
      }
      const content = await bodyContent(c);
      if (content === null) {
        return error(400, "invalid_request", "content (string) is required");
      }
      const name = c.req.param("name");
      await fs.write(`skill-bundles/${name}.yaml`, content);
      return json(200, { name, content });
    }),
  );

  app.delete(
    `/v1/bundles/${SKILL_NAME}`,
    withBridge(options, async (c, fs) => {
      const denied = guard(c, "bundles:write");
      if (denied !== null) {
        return denied;
      }
      const removed = await fs.remove(
        `skill-bundles/${c.req.param("name")}.yaml`,
      );
      if (!removed) {
        return error(404, "bundle_not_found", "Unknown bundle");
      }
      return json(200, { deleted: true });
    }),
  );

  app.get(
    "/v1/jobs/:id{[A-Za-z0-9_-]+}/output",
    withBridge(options, async (c, fs) => {
      const denied = guard(c, "crons:read");
      if (denied !== null) {
        return denied;
      }
      return json(200, {
        outputs: (await fs.list(`cron/output/${c.req.param("id")}`)).sort(),
      });
    }),
  );

  app.get(
    "/v1/jobs/:id{[A-Za-z0-9_-]+}/output/:file{[A-Za-z0-9_.-]+}",
    withBridge(options, async (c, fs) => {
      const denied = guard(c, "crons:read");
      if (denied !== null) {
        return denied;
      }
      const name = c.req.param("file");
      const content = await fs.read(
        `cron/output/${c.req.param("id")}/${name}`,
      );
      if (content === null) {
        return error(404, "output_not_found", "Unknown cron output");
      }
      return json(200, { name, content });
    }),
  );

  app.get(
    "/v1/subagents",
    withBridge(options, async (c, fs) => {
      const denied = guard(c, "subagents:read");
      if (denied !== null) {
        return denied;
      }
      return json(200, {
        transcripts: (await fs.list("cache/delegation/live")).sort(),
      });
    }),
  );
}
