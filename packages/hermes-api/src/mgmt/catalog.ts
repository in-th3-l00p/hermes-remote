import type { Scope } from "../scopes/index.ts";

export interface RouteParam {
  name: string;
  from: "param" | "query" | "body";
  required?: boolean;
  /** When set, the value is appended as `<flag> <value>` instead of substituted. */
  flag?: string;
}

export interface CliRouteSpec {
  method: "get" | "post" | "put" | "patch" | "delete";
  path: string;
  scope: Scope;
  argv: string[];
  params?: RouteParam[];
  timeoutMs?: number;
  /**
   * Set when the hermes CLI has no non-interactive command for this
   * operation; the route answers 501 with this explanation.
   */
  unsupported?: string;
}

const param = (name: string, required = true): RouteParam => ({
  name,
  from: "param",
  required,
});
const body = (name: string, required = false): RouteParam => ({
  name,
  from: "body",
  required,
});
const queryFlag = (name: string, flag: string): RouteParam => ({
  name,
  from: "query",
  flag,
});
const bodyFlag = (name: string, flag: string): RouteParam => ({
  name,
  from: "body",
  flag,
});

export const MGMT_ROUTES: CliRouteSpec[] = [
  { method: "get", path: "/v1/config", scope: "config:read", argv: ["config", "show"] },
  { method: "get", path: "/v1/config/:key{[A-Za-z0-9_.-]+}", scope: "config:read", argv: ["config", "get", "{key}"], params: [param("key")] },
  { method: "put", path: "/v1/config/:key{[A-Za-z0-9_.-]+}", scope: "config:write", argv: ["config", "set", "{key}", "{value}"], params: [param("key"), body("value", true)] },
  { method: "delete", path: "/v1/config/:key{[A-Za-z0-9_.-]+}", scope: "config:write", argv: ["config", "unset", "{key}"], params: [param("key")] },
  { method: "post", path: "/v1/config/check", scope: "config:write", argv: ["config", "check"] },
  { method: "post", path: "/v1/config/migrate", scope: "config:write", argv: ["config", "migrate"] },

  { method: "get", path: "/v1/providers/model", scope: "status:read", argv: ["config", "get", "model"] },
  { method: "put", path: "/v1/providers/model", scope: "providers:manage", argv: ["model", "{model}"], params: [body("model", true)] },
  { method: "get", path: "/v1/providers/fallbacks", scope: "status:read", argv: ["fallback", "list"] },
  { method: "put", path: "/v1/providers/fallbacks", scope: "providers:manage", argv: [], unsupported: "Fallback chains are edited interactively (hermes fallback add/remove/clear); read them with GET" },
  { method: "get", path: "/v1/providers/moa", scope: "status:read", argv: ["moa", "list"] },
  { method: "put", path: "/v1/providers/moa", scope: "providers:manage", argv: [], unsupported: "Mixture-of-Agents presets are configured interactively (hermes moa configure); read them with GET" },
  { method: "get", path: "/v1/providers/auth", scope: "providers:manage", argv: ["auth", "list"] },

  { method: "get", path: "/v1/agent/status", scope: "status:read", argv: ["status"] },
  { method: "get", path: "/v1/agent/doctor", scope: "status:read", argv: ["doctor"] },
  { method: "get", path: "/v1/agent/prompt-size", scope: "status:read", argv: ["prompt-size"] },
  { method: "get", path: "/v1/agent/security-audit", scope: "status:read", argv: ["security", "audit"], timeoutMs: 120_000 },
  { method: "get", path: "/v1/insights", scope: "insights:read", argv: ["insights"], params: [queryFlag("days", "--days"), queryFlag("source", "--source")] },
  { method: "get", path: "/v1/logs", scope: "logs:read", argv: ["logs"], params: [queryFlag("tail", "--tail"), queryFlag("source", "--source"), queryFlag("filter", "--filter")] },
  { method: "post", path: "/v1/agent/pause", scope: "ops:control", argv: ["pause"] },
  { method: "post", path: "/v1/agent/resume", scope: "ops:control", argv: ["resume"] },

  { method: "get", path: "/v1/memory/journey", scope: "memory:read", argv: ["journey"] },
  { method: "get", path: "/v1/memory/providers", scope: "memory:providers", argv: ["memory", "status"] },
  { method: "put", path: "/v1/memory/providers", scope: "memory:providers", argv: [], unsupported: "Memory providers are set up interactively (hermes memory setup); read the current one with GET" },
  { method: "get", path: "/v1/soul/skins", scope: "soul:read", argv: ["skin", "list"] },
  { method: "put", path: "/v1/soul/skin", scope: "soul:write", argv: ["skin", "switch", "{name}"], params: [body("name", true)] },

  ...["get /v1/skills/pending", "post /v1/skills/pending/:id/approve", "post /v1/skills/pending/:id/reject"].map((route): CliRouteSpec => {
    const [method, path] = route.split(" ") as ["get" | "post", string];
    return { method, path, scope: "skills:write", argv: [], unsupported: "Skill write approvals are chat commands (/skills pending|approve|reject) with no CLI equivalent" };
  }),
  { method: "get", path: "/v1/skills/hub/search", scope: "skills:read", argv: ["skills", "search", "{q}"], params: [{ name: "q", from: "query", required: true }, queryFlag("source", "--source")] },
  { method: "get", path: "/v1/skills/hub/taps", scope: "skills:install", argv: ["skills", "tap", "list"] },
  { method: "post", path: "/v1/skills/hub/taps", scope: "skills:install", argv: ["skills", "tap", "add", "{url}"], params: [body("url", true)] },
  { method: "delete", path: "/v1/skills/hub/taps/:name", scope: "skills:install", argv: ["skills", "tap", "remove", "{name}"], params: [param("name")] },
  { method: "post", path: "/v1/skills/hub/install", scope: "skills:install", argv: ["skills", "install", "{source}"], params: [body("source", true)], timeoutMs: 120_000 },
  { method: "post", path: "/v1/skills/:name/update", scope: "skills:install", argv: ["skills", "update", "{name}"], params: [param("name")], timeoutMs: 120_000 },
  { method: "post", path: "/v1/skills/:name/uninstall", scope: "skills:install", argv: ["skills", "uninstall", "{name}"], params: [param("name")] },
  { method: "post", path: "/v1/skills/:name/audit", scope: "skills:install", argv: ["skills", "audit", "{name}"], params: [param("name")], timeoutMs: 120_000 },
  { method: "get", path: "/v1/skills/curator", scope: "skills:write", argv: ["curator", "status"] },
  { method: "post", path: "/v1/skills/curator/run", scope: "skills:write", argv: ["curator", "run"], timeoutMs: 300_000 },
  { method: "post", path: "/v1/skills/curator/pause", scope: "skills:write", argv: ["curator", "pause"] },

  { method: "get", path: "/v1/jobs/:id{[A-Za-z0-9_-]+}/runs", scope: "crons:read", argv: ["cron", "runs", "{id}"], params: [param("id")] },
  { method: "get", path: "/v1/checkpoints", scope: "checkpoints:rollback", argv: ["checkpoints", "list"] },
  { method: "post", path: "/v1/checkpoints/prune", scope: "checkpoints:rollback", argv: ["checkpoints", "prune"] },
  { method: "get", path: "/v1/approvals", scope: "config:read", argv: ["approvals"] },
  { method: "post", path: "/v1/approvals/proposals", scope: "config:write", argv: [], unsupported: "hermes approvals produces allowlist proposals itself; read them with GET /v1/approvals" },

  { method: "get", path: "/v1/hooks", scope: "hooks:read", argv: ["hooks", "list"] },
  { method: "get", path: "/v1/hooks/doctor", scope: "hooks:read", argv: ["hooks", "doctor"] },
  { method: "post", path: "/v1/hooks/consent/revoke", scope: "hooks:manage", argv: ["hooks", "revoke", "{command}"], params: [body("command", true)] },
  { method: "post", path: "/v1/hooks/:event/test", scope: "hooks:manage", argv: ["hooks", "test", "{event}"], params: [param("event")] },
  { method: "get", path: "/v1/webhooks/subscriptions", scope: "webhooks:manage", argv: ["webhook", "list"] },
  { method: "post", path: "/v1/webhooks/subscriptions", scope: "webhooks:manage", argv: ["webhook", "subscribe", "{name}"], params: [body("name", true), bodyFlag("prompt", "--prompt"), bodyFlag("events", "--events"), bodyFlag("description", "--description")] },
  { method: "delete", path: "/v1/webhooks/subscriptions/:id", scope: "webhooks:manage", argv: ["webhook", "remove", "{id}"], params: [param("id")] },

  { method: "get", path: "/v1/gateway", scope: "status:read", argv: ["gateway", "status"] },
  { method: "get", path: "/v1/gateway/platforms", scope: "status:read", argv: ["gateway", "list"] },
  { method: "post", path: "/v1/gateway/start", scope: "ops:control", argv: ["gateway", "start"] },
  { method: "post", path: "/v1/gateway/stop", scope: "ops:control", argv: ["gateway", "stop"] },
  { method: "post", path: "/v1/gateway/restart", scope: "ops:control", argv: ["gateway", "restart"] },
  { method: "post", path: "/v1/gateway/enroll", scope: "ops:control", argv: ["gateway", "enroll"] },
  { method: "put", path: "/v1/gateway/platforms/:name", scope: "config:write", argv: ["config", "set", "gateway.{name}.{key}", "{value}"], params: [param("name"), body("key", true), body("value", true)] },

  { method: "post", path: "/v1/messages/send", scope: "messaging:send", argv: ["send", "--to", "{target}", "{message}"], params: [body("target", true), body("message", true)] },
  { method: "get", path: "/v1/pairing/codes", scope: "pairing:manage", argv: ["pairing", "list"] },
  { method: "post", path: "/v1/pairing/codes", scope: "pairing:manage", argv: ["pairing", "approve", "{platform}", "{code}"], params: [body("platform", true), body("code", true)] },
  { method: "delete", path: "/v1/pairing/users/:platform/:user", scope: "pairing:manage", argv: ["pairing", "revoke", "{platform}", "{user}"], params: [param("platform"), param("user")] },
  { method: "post", path: "/v1/pairing/pending/clear", scope: "pairing:manage", argv: ["pairing", "clear-pending"] },

  { method: "get", path: "/v1/kanban/tasks", scope: "kanban:read", argv: ["kanban", "list"] },
  { method: "post", path: "/v1/kanban/tasks", scope: "kanban:write", argv: ["kanban", "create", "{title}"], params: [body("title", true), bodyFlag("body", "--body"), bodyFlag("assignee", "--assignee")] },
  { method: "patch", path: "/v1/kanban/tasks/:id", scope: "kanban:write", argv: [], unsupported: "Kanban tasks change through workflow verbs (assign, complete, block, ...), not a generic update" },
  { method: "post", path: "/v1/kanban/tasks/:id/assign", scope: "kanban:write", argv: ["kanban", "assign", "{id}", "{profile}"], params: [param("id"), body("profile", true)] },
  { method: "post", path: "/v1/kanban/tasks/:id/complete", scope: "kanban:write", argv: ["kanban", "complete", "{id}"], params: [param("id"), bodyFlag("summary", "--summary")] },
  { method: "post", path: "/v1/kanban/tasks/:id/block", scope: "kanban:write", argv: ["kanban", "block", "{id}", "{reason}"], params: [param("id"), body("reason", true)] },
  { method: "post", path: "/v1/kanban/tasks/:id/unblock", scope: "kanban:write", argv: ["kanban", "unblock", "{id}"], params: [param("id")] },
  { method: "delete", path: "/v1/kanban/tasks/:id", scope: "kanban:write", argv: ["kanban", "archive", "{id}"], params: [param("id")] },
  { method: "post", path: "/v1/kanban/tasks/:id/comments", scope: "kanban:write", argv: ["kanban", "comment", "{id}", "{text}"], params: [param("id"), body("text", true)] },

  { method: "get", path: "/v1/projects", scope: "projects:manage", argv: ["project", "list"] },
  { method: "post", path: "/v1/projects", scope: "projects:manage", argv: ["project", "create", "{name}"], params: [body("name", true)] },
  { method: "patch", path: "/v1/projects/:name", scope: "projects:manage", argv: ["project", "add-folder", "{name}", "{path}"], params: [param("name"), body("path", true)] },
  { method: "delete", path: "/v1/projects/:name", scope: "projects:manage", argv: ["project", "archive", "{name}"], params: [param("name")] },

  { method: "get", path: "/v1/mcp", scope: "mcp:manage", argv: ["mcp", "list"] },
  { method: "post", path: "/v1/mcp", scope: "mcp:manage", argv: ["mcp", "add", "{name}", "{url}"], params: [body("name", true), body("url", true)] },
  { method: "delete", path: "/v1/mcp/:name", scope: "mcp:manage", argv: ["mcp", "remove", "{name}"], params: [param("name")] },
  { method: "get", path: "/v1/plugins", scope: "plugins:manage", argv: ["plugins", "list"] },
  { method: "post", path: "/v1/plugins/:name/enable", scope: "plugins:manage", argv: ["plugins", "enable", "{name}"], params: [param("name")] },
  { method: "post", path: "/v1/plugins/:name/disable", scope: "plugins:manage", argv: ["plugins", "disable", "{name}"], params: [param("name")] },
  { method: "post", path: "/v1/plugins/:name/validate", scope: "plugins:manage", argv: ["plugins", "validate", "{name}"], params: [param("name")] },
];
