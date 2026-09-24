import type { z } from "zod";
import * as s from "./schemas.ts";

/** Who may call a route: nobody-needed, any principal, end users too, or API keys only. */
export type Audience = "public" | "any" | "end-user" | "key";

export interface RouteDoc {
  tag: string;
  summary: string;
  audience: Audience;
  scope?: string;
  body?: z.ZodType | "archive";
  query?: Record<string, string>;
  response?: z.ZodType | "sse" | "archive" | "download" | "cli";
  status?: number;
}

const doc = (
  tag: string,
  audience: Audience,
  scope: string | undefined,
  summary: string,
  extra: Omit<RouteDoc, "tag" | "audience" | "scope" | "summary"> = {},
): RouteDoc => ({ tag, audience, ...(scope === undefined ? {} : { scope }), summary, ...extra });

const SID = ":id{[0-9a-f]+}";
const MID = ":mid{[0-9a-f]+}";
const USER = ":id{usr_[0-9a-f]{20}}";
const PROFILE = ":name{[A-Za-z0-9_][A-Za-z0-9_-]*}";
const SKILL = ":name{[A-Za-z0-9_-]+}";
const ASID = ":id{[A-Za-z0-9_-]+}";
const N = ":n{[0-9]+}";

/** Documentation for every route not generated from the management catalog. */
export const ROUTE_DOCS: Record<string, RouteDoc> = {
  "GET /v1/status": doc("System", "public", undefined, "Liveness and installed version", { response: s.Status }),
  "GET /v1/metrics": doc("System", "key", "status:read", "Prometheus metrics", { response: "download" }),
  "GET /v1/openapi.json": doc("System", "any", undefined, "This OpenAPI document"),
  "GET /v1/auth/whoami": doc("Auth", "any", undefined, "The principal the server resolved for this token", { response: s.WhoAmI }),
  "POST /v1/auth/token": doc("Auth", "key", "auth:users", "Exchange an external identity for a scoped user token", { body: s.TokenExchange, response: s.TokenExchangeResult, status: 201 }),
  "GET /v1/users": doc("Users", "key", "auth:users", "List token-exchange users", { query: { limit: "Page size (1-200)", offset: "Offset" } }),
  [`GET /v1/users/${USER}`]: doc("Users", "key", "auth:users", "One user", { response: s.User }),
  [`PATCH /v1/users/${USER}`]: doc("Users", "key", "auth:users", "Update profile, metadata or agent visibility", { body: s.UserChanges, response: s.User }),
  [`POST /v1/users/${USER}/disable`]: doc("Users", "key", "auth:users", "Disable a user and revoke its tokens", { response: s.User }),
  [`POST /v1/users/${USER}/enable`]: doc("Users", "key", "auth:users", "Re-enable a user", { response: s.User }),
  [`DELETE /v1/users/${USER}`]: doc("Users", "key", "auth:users", "Delete a user", { query: { cascade: "true to delete the user's chat sessions too" } }),
  [`POST /v1/users/${USER}/identities`]: doc("Users", "key", "auth:users", "Link another external identity", { body: s.Identity, response: s.User }),
  [`DELETE /v1/users/${USER}/identities/:provider`]: doc("Users", "key", "auth:users", "Unlink an identity", { response: s.User }),

  "POST /v1/sessions": doc("Chat", "end-user", "sessions:write", "Create a session owned by the caller", { response: s.ChatSession, status: 201 }),
  "GET /v1/sessions": doc("Chat", "end-user", "sessions:read", "List own sessions", { query: { limit: "Page size", offset: "Offset", archived: "true for archived sessions", ids: "Comma-separated ids (anonymous callers)" } }),
  "GET /v1/sessions/search": doc("Chat", "end-user", "sessions:search", "Search own session titles and messages", { query: { q: "Search text", limit: "Max results (1-100)" } }),
  [`PATCH /v1/sessions/${SID}`]: doc("Chat", "end-user", "sessions:write", "Rename and/or archive a session", { body: s.SessionPatch, response: s.ChatSessionMeta }),
  [`POST /v1/sessions/${SID}/fork`]: doc("Chat", "end-user", "sessions:write", "Copy history into a new session", { body: s.ForkSession, response: s.ChatSession, status: 201 }),
  [`GET /v1/sessions/${SID}/export`]: doc("Chat", "end-user", "sessions:read", "Download a session as JSON or Markdown", { query: { format: "markdown for a transcript" }, response: "download" }),
  [`DELETE /v1/sessions/${SID}`]: doc("Chat", "end-user", "sessions:write", "Delete a session and stop its turn"),
  [`POST /v1/sessions/${SID}/stop`]: doc("Chat", "end-user", "chat:invoke", "Abort the in-flight turn"),
  [`GET /v1/sessions/${SID}/messages`]: doc("Chat", "end-user", "sessions:read", "Message history", { query: { limit: "Page size", offset: "Offset" } }),
  [`POST /v1/sessions/${SID}/messages`]: doc("Chat", "end-user", "chat:invoke", "Send a message and stream the reply", { body: s.SendMessage, response: "sse" }),
  [`PATCH /v1/sessions/${SID}/messages/${MID}`]: doc("Chat", "end-user", "chat:invoke", "Edit a user message and regenerate", { body: s.EditMessage, response: "sse" }),
  [`POST /v1/sessions/${SID}/messages/${MID}/reactions`]: doc("Chat", "end-user", "sessions:write", "Toggle a reaction", { body: s.Reaction, response: s.ChatMessage }),

  "GET /v1/events": doc("Events", "key", "events:subscribe", "Server-wide lifecycle event stream", { response: "sse" }),

  "GET /v1/models": doc("Discovery", "end-user", "status:read", "Available models"),
  "GET /v1/models/options": doc("Discovery", "end-user", "status:read", "Model options"),
  "GET /v1/health": doc("Discovery", "end-user", "status:read", "Server and upstream readiness"),
  "GET /v1/capabilities": doc("Discovery", "end-user", "status:read", "Server and upstream features"),
  "GET /v1/skills": doc("Discovery", "end-user", "skills:read", "Installed skills"),
  "GET /v1/toolsets": doc("Discovery", "end-user", "toolsets:read", "Toolsets"),

  "POST /v1/runs": doc("Runs", "end-user", "chat:invoke", "Start a long-running agent task", { body: s.RunCreate, status: 201 }),
  "GET /v1/runs": doc("Runs", "end-user", "chat:invoke", "Own runs (all runs for API keys)"),
  "GET /v1/runs/:id": doc("Runs", "end-user", "chat:invoke", "One run"),
  "GET /v1/runs/:id/events": doc("Runs", "end-user", "chat:invoke", "A run's event stream", { response: "sse" }),
  "POST /v1/runs/:id/stop": doc("Runs", "end-user", "chat:invoke", "Stop a run"),
  "POST /v1/runs/:id/steer": doc("Runs", "end-user", "chat:invoke", "Steer a run", { body: s.Forwarded }),
  "POST /v1/runs/:id/approval": doc("Runs", "end-user", "chat:invoke", "Answer a pending approval", { body: s.Forwarded }),

  "GET /v1/jobs": doc("Jobs", "key", "crons:read", "Scheduled jobs"),
  "GET /v1/jobs/:id": doc("Jobs", "key", "crons:read", "One job"),
  "POST /v1/jobs": doc("Jobs", "key", "crons:write", "Create a job", { body: s.Forwarded }),
  "PATCH /v1/jobs/:id": doc("Jobs", "key", "crons:write", "Update a job", { body: s.Forwarded }),
  "DELETE /v1/jobs/:id": doc("Jobs", "key", "crons:write", "Delete a job"),
  "POST /v1/jobs/:id/pause": doc("Jobs", "key", "crons:write", "Pause a job"),
  "POST /v1/jobs/:id/resume": doc("Jobs", "key", "crons:write", "Resume a job"),
  "POST /v1/jobs/:id/run": doc("Jobs", "key", "crons:write", "Run a job now"),
  "GET /v1/jobs/:id{[A-Za-z0-9_-]+}/output": doc("Jobs", "key", "crons:read", "A job's output files"),
  "GET /v1/jobs/:id{[A-Za-z0-9_-]+}/output/:file{[A-Za-z0-9_.-]+}": doc("Jobs", "key", "crons:read", "One output file"),

  "GET /v1/agent/sessions": doc("Agent sessions", "key", "sessions:read-all", "The agent's own session store"),
  "POST /v1/agent/sessions": doc("Agent sessions", "key", "sessions:write-all", "Create an agent session", { body: s.Forwarded }),
  [`GET /v1/agent/sessions/${ASID}`]: doc("Agent sessions", "key", "sessions:read-all", "One agent session"),
  [`PATCH /v1/agent/sessions/${ASID}`]: doc("Agent sessions", "key", "sessions:write-all", "Update an agent session", { body: s.Forwarded }),
  [`DELETE /v1/agent/sessions/${ASID}`]: doc("Agent sessions", "key", "sessions:write-all", "Delete an agent session"),
  [`GET /v1/agent/sessions/${ASID}/messages`]: doc("Agent sessions", "key", "sessions:read-all", "An agent session's messages"),
  [`POST /v1/agent/sessions/${ASID}/fork`]: doc("Agent sessions", "key", "sessions:write-all", "Fork an agent session", { body: s.Forwarded }),
  [`POST /v1/agent/sessions/${ASID}/model`]: doc("Agent sessions", "key", "sessions:write-all", "Lock the session's model", { body: s.Forwarded }),
  [`POST /v1/agent/sessions/${ASID}/chat`]: doc("Agent sessions", "key", "sessions:write-all + chat:invoke", "Run one turn", { body: s.Forwarded }),
  [`POST /v1/agent/sessions/${ASID}/chat/stream`]: doc("Agent sessions", "key", "sessions:write-all + chat:invoke", "Run one turn, streamed", { body: s.Forwarded, response: "sse" }),
  "GET /v1/commands": doc("Commands", "any", undefined, "Relayable slash commands and their scopes"),
  [`POST /v1/agent/sessions/${ASID}/commands`]: doc("Commands", "key", "per command + chat:invoke", "Relay a slash command (disabled by default)", { body: s.CommandRun }),

  [`GET /v1/agent/sessions/${ASID}/goal`]: doc("Goals", "key", "goals:read", "Goal loop state"),
  [`PUT /v1/agent/sessions/${ASID}/goal`]: doc("Goals", "key", "goals:write + chat:invoke", "Set the goal", { body: s.GoalSet }),
  [`DELETE /v1/agent/sessions/${ASID}/goal`]: doc("Goals", "key", "goals:write + chat:invoke", "Clear the goal"),
  [`POST /v1/agent/sessions/${ASID}/goal/pause`]: doc("Goals", "key", "goals:write + chat:invoke", "Pause the loop"),
  [`POST /v1/agent/sessions/${ASID}/goal/resume`]: doc("Goals", "key", "goals:write + chat:invoke", "Resume the loop"),
  [`POST /v1/agent/sessions/${ASID}/goal/wait`]: doc("Goals", "key", "goals:write + chat:invoke", "Park the loop on a process", { body: s.GoalWait }),
  [`POST /v1/agent/sessions/${ASID}/goal/unwait`]: doc("Goals", "key", "goals:write + chat:invoke", "Release the wait barrier"),
  [`GET /v1/agent/sessions/${ASID}/goal/gates`]: doc("Goals", "key", "goals:read", "Quality gates"),
  [`POST /v1/agent/sessions/${ASID}/goal/gates`]: doc("Goals", "key", "goals:write + chat:invoke", "Add a gate", { body: s.GateAdd }),
  [`DELETE /v1/agent/sessions/${ASID}/goal/gates/${N}`]: doc("Goals", "key", "goals:write + chat:invoke", "Remove a gate"),
  [`DELETE /v1/agent/sessions/${ASID}/goal/gates`]: doc("Goals", "key", "goals:write + chat:invoke", "Remove all gates"),
  [`GET /v1/agent/sessions/${ASID}/goal/subgoals`]: doc("Goals", "key", "goals:read", "Subgoals"),
  [`POST /v1/agent/sessions/${ASID}/goal/subgoals`]: doc("Goals", "key", "goals:write + chat:invoke", "Add a subgoal", { body: s.Text }),
  [`DELETE /v1/agent/sessions/${ASID}/goal/subgoals/${N}`]: doc("Goals", "key", "goals:write + chat:invoke", "Remove a subgoal"),
  [`DELETE /v1/agent/sessions/${ASID}/goal/subgoals`]: doc("Goals", "key", "goals:write + chat:invoke", "Remove all subgoals"),

  "POST /v1/media/tts": doc("Tools", "end-user", "chat:invoke", "Text to speech (when the agent supports it)", { body: s.Forwarded, response: "download" }),
  "POST /v1/media/images": doc("Tools", "end-user", "chat:invoke", "Generate an image", { body: s.Prompt }),
  "POST /v1/web/search": doc("Tools", "end-user", "chat:invoke", "Web search", { body: s.Query }),
  "POST /v1/web/extract": doc("Tools", "end-user", "chat:invoke", "Extract a public page", { body: s.Url }),
  "POST /v1/browser/tasks": doc("Tools", "end-user", "chat:invoke", "Start a browser-automation run", { body: s.Task, status: 201 }),
  "POST /v1/chat/completions": doc("Passthrough", "key", "chat:invoke", "OpenAI-compatible chat, forwarded", { body: s.Forwarded }),
  "POST /v1/responses": doc("Passthrough", "key", "chat:invoke", "OpenAI-compatible responses, forwarded", { body: s.Forwarded }),

  "GET /v1/profiles": doc("Profiles", "key", "status:read", "Profiles on the host"),
  [`GET /v1/profiles/${PROFILE}`]: doc("Profiles", "key", "status:read", "One profile", { response: "cli" }),
  "POST /v1/profiles": doc("Profiles", "key", "profiles:manage", "Create a profile", { body: s.ProfileCreate, response: "cli" }),
  [`DELETE /v1/profiles/${PROFILE}`]: doc("Profiles", "key", "profiles:manage", "Delete a profile", { response: "cli" }),
  [`PATCH /v1/profiles/${PROFILE}`]: doc("Profiles", "key", "profiles:manage", "Rename or describe a profile", { body: s.ProfilePatch, response: "cli" }),
  [`POST /v1/profiles/${PROFILE}/export`]: doc("Profiles", "key", "profiles:manage", "Export a profile archive", { response: "archive" }),
  [`POST /v1/profiles/${PROFILE}/install`]: doc("Profiles", "key", "profiles:manage", "Install a profile from a source", { body: s.ProfileInstall, response: "cli" }),
  [`POST /v1/profiles/${PROFILE}/import`]: doc("Profiles", "key", "profiles:manage", "Import an uploaded profile archive", { body: "archive", response: "cli" }),
  [`POST /v1/profiles/${PROFILE}/update`]: doc("Profiles", "key", "profiles:manage", "Update a profile", { response: "cli" }),
  "PUT /v1/toolsets/:platform": doc("Management", "key", "toolsets:manage", "Enable or disable a toolset", { body: s.ToolsetToggle, response: "cli" }),
  "POST /v1/backups": doc("Management", "key", "backups:manage", "Create a backup and download the zip", { response: "archive" }),
  "POST /v1/backups/import": doc("Management", "key", "backups:manage", "Restore an uploaded backup", { body: "archive", response: "cli" }),

  "GET /v1/memory": doc("Files", "key", "memory:read", "MEMORY.md"),
  "PUT /v1/memory": doc("Files", "key", "memory:write", "Replace MEMORY.md", { body: s.Content }),
  "GET /v1/memory/user": doc("Files", "key", "memory:read", "USER.md"),
  "PUT /v1/memory/user": doc("Files", "key", "memory:write", "Replace USER.md", { body: s.Content }),
  "POST /v1/memory/entries": doc("Files", "key", "memory:write", "Add, replace or remove a memory entry", { body: s.MemoryEntry }),
  "GET /v1/soul": doc("Files", "key", "soul:read", "SOUL.md"),
  "PUT /v1/soul": doc("Files", "key", "soul:write", "Replace SOUL.md", { body: s.Content }),
  "POST /v1/skills": doc("Files", "key", "skills:write", "Create a skill", { body: s.NamedContent, status: 201 }),
  [`GET /v1/skills/${SKILL}`]: doc("Files", "key", "skills:read", "A skill's SKILL.md"),
  [`PATCH /v1/skills/${SKILL}`]: doc("Files", "key", "skills:write", "Replace a skill's SKILL.md", { body: s.Content }),
  [`DELETE /v1/skills/${SKILL}`]: doc("Files", "key", "skills:write", "Delete a skill"),
  [`GET /v1/skills/${SKILL}/files/*`]: doc("Files", "key", "skills:read", "Read a skill reference file"),
  [`PUT /v1/skills/${SKILL}/files/*`]: doc("Files", "key", "skills:write", "Write a skill reference file", { body: s.Content }),
  "GET /v1/bundles": doc("Files", "key", "bundles:read", "Skill bundles"),
  [`GET /v1/bundles/${SKILL}`]: doc("Files", "key", "bundles:read", "One bundle"),
  [`PUT /v1/bundles/${SKILL}`]: doc("Files", "key", "bundles:write", "Write a bundle", { body: s.Content }),
  [`DELETE /v1/bundles/${SKILL}`]: doc("Files", "key", "bundles:write", "Delete a bundle"),
  "GET /v1/subagents": doc("Files", "key", "subagents:read", "Live delegation transcripts"),
  "GET /v1/subagents/:id{[A-Za-z0-9_.-]+}": doc("Files", "key", "subagents:read", "One transcript, parsed"),
  "POST /v1/subagents/:id{[A-Za-z0-9_.-]+}/steer": doc("Files", "key", "subagents:control", "Not supported (501): steer from the parent session"),
  "POST /v1/subagents/:id{[A-Za-z0-9_.-]+}/stop": doc("Files", "key", "subagents:control", "Not supported (501): stop from the parent session"),
};
