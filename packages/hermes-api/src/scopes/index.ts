export const TIER1_SCOPES = [
  "chat:invoke",
  "sessions:read",
  "sessions:write",
  "sessions:search",
  "goals:read",
  "goals:write",
  "checkpoints:rollback",
  "events:subscribe",
  "skills:read",
  "bundles:read",
  "toolsets:read",
  "status:read",
  "subagents:read",
] as const;

export const TIER2_SCOPES = [
  "memory:read",
  "memory:write",
  "skills:write",
  "bundles:write",
  "crons:read",
  "crons:write",
  "hooks:read",
  "kanban:read",
  "kanban:write",
  "soul:read",
  "insights:read",
  "logs:read",
  "sessions:read-all",
  "sessions:write-all",
  "subagents:control",
  "messaging:send",
  "projects:manage",
] as const;

export const TIER3_SCOPES = [
  "config:read",
  "config:write",
  "soul:write",
  "hooks:manage",
  "webhooks:manage",
  "skills:install",
  "mcp:manage",
  "plugins:manage",
  "profiles:manage",
  "providers:manage",
  "toolsets:manage",
  "memory:providers",
  "ops:control",
  "pairing:manage",
  "backups:manage",
] as const;

export const AUTH_SCOPES = ["auth:users"] as const;

export type Scope =
  | (typeof TIER1_SCOPES)[number]
  | (typeof TIER2_SCOPES)[number]
  | (typeof TIER3_SCOPES)[number]
  | (typeof AUTH_SCOPES)[number];

const ALL = new Set<string>([...TIER1_SCOPES, ...TIER2_SCOPES, ...TIER3_SCOPES, ...AUTH_SCOPES]);

/**
 * Scopes held implicitly by user and anonymous principals: chat, their own
 * sessions, and read-only discovery. Everything else needs an API key.
 */
export const END_USER_SCOPES = [
  "chat:invoke",
  "sessions:read",
  "sessions:write",
  "sessions:search",
  "status:read",
  "skills:read",
  "toolsets:read",
] as const;

// auth:users lets a key act for any user, so it needs the same acknowledgment.
const DANGEROUS = new Set<string>([...TIER3_SCOPES, ...AUTH_SCOPES]);
const END_USER = new Set<string>(END_USER_SCOPES);
const USER_GRANTABLE = new Set<string>(TIER1_SCOPES);

export function isKnownScope(scope: string): scope is Scope {
  return ALL.has(scope);
}

export function isDangerousScope(scope: string): boolean {
  return DANGEROUS.has(scope);
}

export function isUserGrantableScope(scope: string): boolean {
  return USER_GRANTABLE.has(scope);
}

export function isEndUserScope(scope: string): boolean {
  return END_USER.has(scope);
}
