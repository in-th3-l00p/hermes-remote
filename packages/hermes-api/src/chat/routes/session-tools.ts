import type { Hono } from "hono";
import type { Principal } from "../../auth/index.ts";
import type { ChatSession } from "../store/index.ts";
import { canAccess, error, json, requireScope, type ChatEnv, type ChatOptions } from "./shared.ts";
import { ForkSession, SessionPatch } from "../../openapi/schemas.ts";
import { readBody } from "../../openapi/validate.ts";

const ID = ":id{[0-9a-f]+}";

function ownerOf(principal: Principal): { userId: string } | { keyId: string } | null {
  if (principal.type === "user") {
    return { userId: principal.userId };
  }
  return principal.type === "api_key" ? { keyId: principal.record.id } : null;
}

function toMarkdown(session: ChatSession): string {
  const lines = [`# ${session.title ?? "Untitled"}`, ""];
  for (const m of session.messages) {
    lines.push(`**${m.role === "user" ? "User" : "Assistant"}** · ${m.createdAt}`, "", m.content, "");
  }
  return `${lines.join("\n").trimEnd()}\n`;
}

/** Rename, archive, fork, search and export for chat sessions. */
export function registerSessionTools(app: Hono<ChatEnv>, options: ChatOptions): void {
  const { store } = options;

  app.get("/v1/sessions/search", (c) => {
    const principal = c.get("principal");
    const denied = requireScope(principal, "sessions:search");
    if (denied !== null) {
      return denied;
    }
    const query = (c.req.query("q") ?? "").trim();
    if (query === "" || query.length > 200) {
      return error(400, "invalid_request", "q (1 to 200 characters) is required");
    }
    const limit = Math.min(Math.max(Number(c.req.query("limit") ?? "20") || 20, 1), 100);
    const owner = ownerOf(principal);
    // Anonymous sessions are capability URLs: there is nothing to search over.
    return json(200, {
      sessions: owner === null ? [] : store.searchSessions(owner, query, limit),
    });
  });

  app.patch(`/v1/sessions/${ID}`, async (c) => {
    const principal = c.get("principal");
    const denied = requireScope(principal, "sessions:write");
    if (denied !== null) {
      return denied;
    }
    const session = store.getSession(c.req.param("id"));
    if (session === null || !canAccess(session, principal, "write")) {
      return error(404, "session_not_found", "Unknown session");
    }
    const body = await readBody(c, SessionPatch);
    if (body instanceof Response) {
      return body;
    }
    return json(
      200,
      store.updateSession(session.id, {
        ...(body.title === undefined ? {} : { title: body.title }),
        ...(body.archived === undefined ? {} : { archived: body.archived }),
      }),
    );
  });

  app.post(`/v1/sessions/${ID}/fork`, async (c) => {
    const principal = c.get("principal");
    const denied = requireScope(principal, "sessions:write");
    if (denied !== null) {
      return denied;
    }
    const session = store.getSession(c.req.param("id"));
    if (session === null || !canAccess(session, principal, "read")) {
      return error(404, "session_not_found", "Unknown session");
    }
    // An empty body forks the whole session.
    const body = await readBody(c, ForkSession.optional());
    if (body instanceof Response) {
      return body;
    }
    const owner = ownerOf(principal) ?? {};
    const fork = store.forkSession(session.id, owner, body?.messageId);
    if (fork === null) {
      return error(404, "message_not_found", "Unknown message");
    }
    return json(201, fork);
  });

  app.get(`/v1/sessions/${ID}/export`, (c) => {
    const principal = c.get("principal");
    const denied = requireScope(principal, "sessions:read");
    if (denied !== null) {
      return denied;
    }
    const session = store.getSession(c.req.param("id"));
    if (session === null || !canAccess(session, principal, "read")) {
      return error(404, "session_not_found", "Unknown session");
    }
    const filename = `session-${session.id}`;
    if (c.req.query("format") === "markdown") {
      return new Response(toMarkdown(session), {
        headers: {
          "content-type": "text/markdown; charset=utf-8",
          "content-disposition": `attachment; filename="${filename}.md"`,
        },
      });
    }
    return new Response(JSON.stringify(session, null, 2), {
      headers: {
        "content-type": "application/json",
        "content-disposition": `attachment; filename="${filename}.json"`,
      },
    });
  });
}
