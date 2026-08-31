# ARCHITECTURE.md — hermes-web

## Overview

hermes-web exposes a local Hermes agent instance to the web, securely. It is a Bun + TypeScript monorepo with three packages:

```
hermes-web/
├── packages/
│   ├── hermes-api/       # Bun HTTP server — authenticated facade over a local Hermes instance
│   ├── cli/              # Management CLI (bins hermes-remote/hermes-api) built on hermes-api
│   ├── hermes-ts/        # "hermes.ts" — typed TypeScript client (@intheloop-studio/hermes-web-ts)
│   └── react-hermes/     # React hooks built on hermes-ts
├── CLAUDE.md             # Hermes feature reference + project conventions
└── ARCHITECTURE.md       # This file
```

All packages share one `tsconfig` base (strict), are built and tested with Bun (`bun test`), and publish types from source.

## System diagram

```
Browser / app
   │  (hermes.ts / react-hermes — API keys for backends, minted user tokens for browsers)
   ▼
hermes-api  (Bun server, public-facing)
   │
   ├── HTTP proxy ──► Hermes built-in API server  http://127.0.0.1:8642
   │                  (chat completions, responses, runs, sessions, jobs,
   │                   skills/toolsets enumeration, models, capabilities)
   │
   ├── CLI bridge ──► `hermes …` subcommands
   │                  (cron, hooks, goals, memory, config, skills install/manage,
   │                   bundles, profiles, status, insights, checkpoints, kanban)
   │
   └── FS bridge  ──► ~/.hermes/ (read-mostly)
                      (config.yaml, memories/, skills/, cron/jobs.json,
                       cron/output/, logs/, state.db read-only queries)
```

### Why three bridges

Hermes's built-in API server covers chat, sessions, runs, jobs, and capability enumeration — but not memory, hooks, goals, cron management, or configuration. hermes-api therefore composes three backends behind one coherent REST API:

1. **HTTP proxy** (preferred) — forwards to `127.0.0.1:8642` with the server-held `API_SERVER_KEY`. The upstream bearer key never leaves the server; clients authenticate to hermes-api with their own credentials.
2. **CLI bridge** — spawns `hermes <cmd> --json` via `Bun.spawn` for management operations that have no HTTP equivalent. All CLI invocations go through a single `HermesCli` module (command allowlist, argument escaping, timeout, JSON parsing) so nothing else in the codebase shells out.
3. **FS bridge** — reads well-known `~/.hermes/` files (e.g. cron output, memory files, logs) where that is faster and safer than shelling out. Writes go through the CLI whenever a CLI command exists, so Hermes's own validation/consent logic stays in the loop.

Each bridge is defined by an interface (`HermesHttpBackend`, `HermesCliBackend`, `HermesFsBackend`) with a real implementation and an in-memory fake — this is what makes 100% unit coverage possible without a live agent.

## hermes-api

### Server

- Bun's native `Bun.serve` with a small typed router (no framework dependency needed; if one is used, Hono — it's Bun-native and edge-portable).
- OpenAPI 3.1 spec generated from route schemas (Zod), served at `GET /openapi.json`; hermes-ts types are generated from the same schemas, so client and server can never drift.
- SSE streaming passthrough for chat/runs/events.

### Identity, authentication & authorization

hermes-api has two kinds of principals, both presented as `Authorization: Bearer <token>`:

1. **API keys** (`hk_<id>.<secret>`) — machine principals for backends and operators. Created **only via the hermes-api CLI on the server host** — there is deliberately no HTTP endpoint for minting or escalating keys, so a leaked key can never create more keys. Stored hashed (argon2) in the server's own SQLite; attributes: name, scope set, optional profile restriction, optional expiry, optional CIDR allowlist, revoked flag.
2. **User tokens** — short-lived JWTs (signed with a server-held key, default TTL 15 min) representing an **end user** of the product built on hermes-api. They are never created from a password or login form on hermes-api itself; they are minted through **token exchange** by a platform backend that holds an API key with the `auth:users` permission (see below).

#### Permission model

Deny-by-default, fine-grained scopes, no implicit wildcards. Every route declares its required scope; a principal must hold it exactly (no prefix matching). The catalog, ordered by risk:

**Tier 1 — end-user surface** (grantable to user tokens):
`chat:invoke` (completions/responses/runs/turns), `sessions:read`, `sessions:write`, `sessions:search`, `goals:read`, `goals:write`, `checkpoints:rollback`, `events:subscribe`, `skills:read`, `bundles:read`, `toolsets:read`, `status:read`, `subagents:read`.

**Tier 2 — operator surface** (API keys only; the server refuses to place these in a user token):
`memory:read`, `memory:write`, `skills:write`, `bundles:write`, `crons:read`, `crons:write`, `hooks:read`, `kanban:read`, `kanban:write`, `soul:read`, `insights:read`, `logs:read`, `sessions:read-all` / `sessions:write-all` (cross-user session access), `subagents:control`.

**Tier 3 — dangerous / host-level** (API keys only, never bundled — each must be granted explicitly; the CLI prints a warning when granting them):
`config:read`, `config:write`, `soul:write`, `hooks:manage`, `webhooks:manage`, `skills:install`, `mcp:manage`, `plugins:manage`, `profiles:manage`, `providers:manage`, `toolsets:manage`, `memory:providers`.

**Auth tier** (ideally held by a key that holds *nothing else*):
`auth:users` — mint user tokens via token exchange and manage user records (`/v1/auth/token`, `/v1/users/*`). A pure auth key cannot touch the agent at all.

There is no `admin` super-scope; "admin" is just a key that was explicitly granted many scopes. `chat:invoke` is itself treated as sensitive — the agent can run terminal commands — so what a chat turn may do is bounded by the Hermes profile's toolset configuration, and locked-down profiles (e.g. web toolsets only, no terminal) are the recommended target for user-facing keys via the key's profile restriction.

#### Resource ownership

Every session (and its goals, checkpoints, runs) is tagged with the `user_id` that created it. User tokens are hard-limited to resources they own — `sessions:read` on a user token means *own sessions only*. API keys with `sessions:read` see only sessions they created themselves; cross-user visibility requires `sessions:read-all`/`sessions:write-all`. This makes multi-tenant chat products safe by default.

#### Token exchange (external identity providers)

The platform keeps its own login (Auth0, Clerk, Cognito, custom — hermes-api never sees IdP credentials) and its backend brokers access:

```
End user ──login──► Platform IdP
                      │ verified identity
                      ▼
Platform backend ──POST /v1/auth/token (API key with auth:users)──► hermes-api
   body: {
     user:   { provider: "auth0", subject: "auth0|abc123",   // stable external identity
               profile?: {...}, metadata?: {...},            // optional, see User entity
               agent_visibility?: "anonymous" },
     scopes: ["chat:invoke", "sessions:read", "sessions:write"],
     ttl?:   900
   }
   ◄── { token, expires_at, user: { id, ... } }
                      │
                      ▼
Browser uses `token` directly with hermes.ts; refresh = re-exchange by the backend.
```

Rules:
- The user is **upserted** on exchange, keyed by `(provider, subject)` — no separate registration step needed (auto-provisioning can be disabled per key, then unknown users are rejected).
- Granted scopes must be ⊆ the key's `user_grantable_scopes` (set at key creation) ∩ Tier 1. Both checks are server-side and non-negotiable.
- Minting is audited: which key, which user, which scopes, when.
- Disabling a user (`POST /v1/users/:id/disable`) immediately invalidates their outstanding tokens (tokens carry a per-user generation counter checked on each request).

#### The User entity

```ts
interface User {
  id: string;                          // server-generated, stable, opaque (usr_...)
  identities: { provider: string; subject: string }[];  // external IdP links
  profile?: {                          // all optional — platform decides what to share
    name?: string;
    email?: string;
    locale?: string;
    timezone?: string;
    [k: string]: unknown;              // free-form profile fields
  };
  metadata?: Record<string, unknown>;  // platform-private data; NEVER shown to the agent
  agent_visibility: "anonymous" | "pseudonymous" | "full";   // default: "anonymous"
  disabled: boolean;
  created_at: string;
  updated_at: string;
}
```

What the **agent** learns about the user is controlled by `agent_visibility` and enforced by hermes-api at turn time (it prepends a `<user-context>` block to the session's first turn; it never writes users into Hermes's global `USER.md`, which is per-profile, not per-user):

| Visibility | Agent sees |
|---|---|
| `anonymous` (default) | Nothing. No user block is injected; sessions are indistinguishable across users from the agent's perspective. |
| `pseudonymous` | Only the stable opaque `user.id` — enough for the agent to keep per-user continuity ("this is the same person as yesterday") without knowing who they are. |
| `full` | `user.id` + the `profile` fields (name, locale, timezone, …). `metadata` is still withheld — it is platform-private by definition. |

Two deployment patterns follow from this:
- **Shared-agent, anonymous users** — one Hermes profile serves everyone; keep visibility `anonymous`/`pseudonymous` so the agent's global memory never absorbs personal data.
- **Profile-per-user** — the platform provisions a Hermes profile per user (via `profiles:manage`) for full isolation of memory/skills/sessions; `full` visibility is safe there, and Hermes's own memory system personalizes per user.

#### Operational

- Rate limiting per principal (separate budgets for keys and user tokens); audit log of every mutating call and every token mint.
- CORS allowlist configurable; user tokens are the only principal intended for browsers — API keys in frontend code are treated as a deployment error (the docs and CLI say so loudly).

### hermes-api CLI

The server package ships a `hermes-api` binary (Bun) for host-side administration — the only way to manage API keys:

```
hermes-api serve                                  # run the server
hermes-api init                                   # create server config + signing keys
hermes-api keys create --name ci-bot \
    --scope chat:invoke --scope sessions:read \
    --profile support-agent \
    --user-grantable chat:invoke,sessions:read,sessions:write \
    --expires 90d                                 # prints the secret once, stores only the hash
hermes-api keys list | show <id> | revoke <id> | rotate <id>
hermes-api users list | show <id> | disable <id> | enable <id> | delete <id>
hermes-api audit tail                             # follow the audit log
hermes-api doctor                                 # check upstream Hermes reachability, key hygiene
```

`keys create` refuses ambient over-granting: Tier 3 scopes require an explicit `--dangerous` acknowledgment flag, and `--user-grantable` accepts Tier 1 scopes only.

### API endpoint map (v1)

All routes are prefixed `/v1`. Standard REST semantics; list endpoints support pagination (`?cursor`, `?limit`); mutations return the updated resource. Required scope per route follows the permission catalog above.

#### Auth & users (`auth:users` scope; API keys only)
| Method & path | Purpose |
|---|---|
| `POST /v1/auth/token` | Token exchange: upsert user from external IdP identity + mint scoped user JWT |
| `GET /v1/auth/whoami` | Introspect the calling principal (type, scopes, user/key id) — any authenticated principal |
| `GET /v1/users` · `GET /v1/users/:id` | List / inspect users |
| `PATCH /v1/users/:id` | Update profile, metadata, `agent_visibility` |
| `POST /v1/users/:id/disable` · `/enable` | Kill/restore access (invalidates outstanding tokens) |
| `DELETE /v1/users/:id` | Delete user record (sessions retained but orphan-tagged, or cascaded via `?cascade=true`) |
| `POST /v1/users/:id/identities` · `DELETE …/identities/:provider` | Link/unlink additional IdP identities |

#### Chat & runs (proxied to Hermes HTTP API)
| Method & path | Purpose |
|---|---|
| `POST /v1/chat/completions` | OpenAI-compatible chat (streaming SSE incl. `hermes.tool.progress` events) |
| `POST /v1/responses` | Stateful multi-turn via `previous_response_id` |
| `POST /v1/runs` | Start a long-running agent task → `run_id` |
| `GET /v1/runs` / `GET /v1/runs/:id` | List / poll run status |
| `GET /v1/runs/:id/events` | SSE event stream for a run |
| `POST /v1/runs/:id/stop` | Stop a run |
| `POST /v1/runs/:id/approvals/:approvalId` | Approve/deny a pending tool approval |
| `GET /v1/models` / `GET /v1/capabilities` | Model discovery / machine-readable feature set |

#### Sessions (proxy + CLI for archive/prune/export)
| Method & path | Purpose |
|---|---|
| `GET /v1/sessions` | List sessions (metadata, token counters) |
| `POST /v1/sessions` | Create a session |
| `GET /v1/sessions/:id` | Metadata + message history |
| `PATCH /v1/sessions/:id` | Rename/retitle |
| `DELETE /v1/sessions/:id` | Delete |
| `POST /v1/sessions/:id/fork` | Fork/branch a session |
| `POST /v1/sessions/:id/turns` | Run a single turn in the session (SSE) |
| `POST /v1/sessions/:id/archive` · `/export` | Archive / export transcript |
| `GET /v1/sessions/search?q=` | FTS5 full-text search across sessions |
| `GET /v1/sessions/:id/checkpoints` · `POST …/checkpoints/:cpId/rollback` | Inspect shadow-git checkpoints / rollback |

#### Goals (CLI bridge — `/goal` surface)
| Method & path | Purpose |
|---|---|
| `GET /v1/sessions/:id/goal` | Show active goal + contract + judge state |
| `PUT /v1/sessions/:id/goal` | Set/replace goal (`{ text, contract?, draft?: boolean }` — `draft: true` auto-expands via goal_judge) |
| `DELETE /v1/sessions/:id/goal` | Clear |
| `POST /v1/sessions/:id/goal/pause` · `/resume` | Pause / resume the loop |
| `POST /v1/sessions/:id/goal/gates` · `DELETE …/gates/:gateId` | Add / remove quality-gate commands |
| `POST /v1/sessions/:id/goal/wait` · `/unwait` | Park on pid/duration / unpark |

#### Memory
| Method & path | Purpose |
|---|---|
| `GET /v1/memory` | MEMORY.md content + char limits + usage |
| `GET /v1/memory/user` | USER.md content |
| `POST /v1/memory/entries` | Add entry (maps to memory `add`) |
| `PATCH /v1/memory/entries` | Replace by substring (memory `replace`) |
| `DELETE /v1/memory/entries` | Remove by substring (memory `remove`) |
| `GET /v1/memory/journey` | Learning-journey timeline (skills + memory events) |
| `GET /v1/memory/providers` · `PUT /v1/memory/providers/:name` | List / configure external providers (Honcho, Mem0, …) |

#### Skills & bundles
| Method & path | Purpose |
|---|---|
| `GET /v1/skills` | Index (progressive-disclosure level 0 metadata) |
| `GET /v1/skills/:name` | Full SKILL.md (level 1) |
| `GET /v1/skills/:name/files/*path` | Reference file (level 2) |
| `POST /v1/skills` · `PATCH /v1/skills/:name` · `DELETE /v1/skills/:name` | Create / patch-or-edit / delete (mirrors `skill_manage`) |
| `GET /v1/skills/hub/search?q=&source=` · `GET /v1/skills/hub/:source/*id` | Search / inspect hub skills |
| `POST /v1/skills/hub/install` · `POST /v1/skills/:name/uninstall` · `/update` · `/audit` | Hub lifecycle (security scan results returned) |
| `GET /v1/skills/pending` · `POST /v1/skills/pending/:id/approve` · `/reject` | Staged-write approval gate |
| `GET/POST /v1/bundles` · `GET/PUT/DELETE /v1/bundles/:name` | Skill bundles CRUD |

#### Cron (scheduled tasks)
| Method & path | Purpose |
|---|---|
| `GET /v1/crons` · `POST /v1/crons` | List / create (schedule, prompt, skills, model pin, reasoning effort, workdir, delivery, continuity, context_from, script, no_agent) |
| `GET /v1/crons/:id` · `PATCH /v1/crons/:id` · `DELETE /v1/crons/:id` | Inspect / edit / remove |
| `POST /v1/crons/:id/pause` · `/resume` · `/run` | Lifecycle + trigger now |
| `GET /v1/crons/:id/runs` | Execution history (claimed/running/completed/failed/blocked_config) |
| `GET /v1/crons/:id/output` · `GET …/output/:timestamp` | Stored outputs from `cron/output/` |

#### Event hooks & webhooks
| Method & path | Purpose |
|---|---|
| `GET /v1/hooks` | All configured hooks (gateway, plugin, shell, outbound) + consent status |
| `POST /v1/hooks/shell` · `DELETE /v1/hooks/shell/:id` | Manage shell-hook config entries |
| `POST /v1/hooks/:event/test` | Fire hooks against synthetic payloads |
| `POST /v1/hooks/consent/revoke` | Revoke an allowlist entry |
| `GET /v1/hooks/doctor` | Health audit |
| `GET/POST /v1/webhooks/outbound` · `DELETE /v1/webhooks/outbound/:id` | Signed outbound lifecycle-event subscriptions (this is also how web clients get push: subscribe hermes-api itself, which re-broadcasts over `GET /v1/events` SSE) |
| `GET /v1/events` | Server-wide SSE firehose of lifecycle events (session/agent/tool/cron/kanban) |

#### Configuration & profiles
| Method & path | Purpose |
|---|---|
| `GET /v1/config` | Resolved non-secret config (secrets redacted) |
| `GET /v1/config/:key` · `PUT /v1/config/:key` · `DELETE /v1/config/:key` | Get / set / unset (routes through `hermes config`, so secret-routing and validation apply) |
| `POST /v1/config/check` · `/migrate` | Missing-option check / migration |
| `GET /v1/profiles` · `POST /v1/profiles` · `DELETE /v1/profiles/:name` | Profile management; `X-Hermes-Profile` header selects the target profile per request |
| `GET /v1/soul` · `PUT /v1/soul` | SOUL.md personality |
| `GET /v1/providers` · `GET /v1/providers/fallbacks` · `PUT …` | Provider routing, fallback chains, credential-pool status (keys never returned) |

#### Tools, toolsets, MCP, plugins, delegation
| Method & path | Purpose |
|---|---|
| `GET /v1/toolsets` · `PUT /v1/toolsets/:platform` | Enumerate / enable-disable per platform |
| `GET /v1/mcp` · `POST /v1/mcp` · `DELETE /v1/mcp/:name` | MCP server management |
| `GET /v1/plugins` · `POST /v1/plugins/:name/enable` · `/disable` | Plugin management |
| `GET /v1/subagents` · `POST /v1/subagents/:id/steer` · `/stop` | Live delegation monitor (cost rollups), steer/stop children |
| `GET /v1/kanban/tasks` · `POST /v1/kanban/tasks` · `PATCH /v1/kanban/tasks/:id` | Kanban board CRUD + dispatch |

#### Ops & observability
| Method & path | Purpose |
|---|---|
| `GET /v1/status` | hermes-api health + upstream Hermes agent/gateway/auth status |
| `GET /v1/insights` | Token/cost/activity analytics |
| `GET /v1/logs?source=&filter=` | Agent/gateway/error logs |
| `GET /openapi.json` | Generated OpenAPI spec |

## hermes.ts (client)

- Zero-dependency, isomorphic (browser + Bun + Node ≥18) — `fetch` + `EventSource`/ReadableStream only.
- One resource class per API domain mirroring the endpoint map: `client.chat`, `client.sessions`, `client.goals`, `client.memory`, `client.skills`, `client.bundles`, `client.crons`, `client.hooks`, `client.events`, `client.config`, `client.profiles`, `client.toolsets`, `client.subagents`, `client.kanban`, `client.status`.
- Types generated from the server's Zod schemas (single source of truth).
- Streaming surfaces return `AsyncIterable<Event>` (chat deltas, tool progress, run events, the `/v1/events` firehose).
- Typed error hierarchy (`HermesApiError` with status/code), automatic retry with backoff for idempotent requests, per-request profile override.
- **Auth handling:** the client takes either a static token or an async `tokenProvider` callback. In browsers the provider typically calls the platform backend's refresh endpoint (which re-exchanges via `POST /v1/auth/token`); the client transparently re-fetches a token on 401/expiry and retries once. `client.auth` exposes `whoami()` and, for backend usage with an `auth:users` key, `exchangeToken()` and `client.users` CRUD.

## react-hermes (hooks)

Built on hermes.ts + TanStack-Query-style cache semantics (implemented internally to stay dependency-free):

- `<HermesProvider client={...}>` — context + shared cache.
- `useChat()` — streaming chat with message state, tool-progress events, abort.
- `useSessions()` / `useSession(id)` / `useSessionSearch(q)` — list, transcript, fork, rename, checkpoints/rollback.
- `useGoal(sessionId)` — goal state + set/draft/pause/resume/gates.
- `useMemory()` / `useJourney()` — memory files + mutations.
- `useSkills()` / `useSkill(name)` / `useSkillHub()` / `useBundles()`.
- `useCrons()` / `useCron(id)` — incl. run history and outputs.
- `useHooks()` / `useHermesEvents(filter)` — live SSE firehose subscription.
- `useConfig()` / `useProfiles()` / `useToolsets()` / `useSubagents()` / `useKanban()` / `useStatus()` / `useInsights()`.

- `useHermesAuth()` — current principal (`whoami`), token expiry state, and re-auth signaling for the provider's `tokenProvider`.

Every mutation hook invalidates the relevant queries; streaming hooks clean up SSE connections on unmount. Hooks only ever see user tokens — the provider takes a `tokenProvider`, never an API key.

## Testing strategy (100% coverage, enforced)

- `bun test --coverage` with 100% line/branch/function thresholds enforced in CI for every package; a PR that drops coverage fails.
- **Unit tests** (`*.test.ts`) — run everywhere, no Hermes required:
  - hermes-api routes tested against the in-memory fake backends (`FakeHermesHttp`, `FakeHermesCli`, `FakeHermesFs`), covering success, auth/scope failures, upstream errors, and streaming.
  - hermes-ts tested against a mock `fetch`; react-hermes tested with Testing Library against a mocked client.
- **Integration tests** (`*.integration.test.ts`) — require a live Hermes instance (`hermes gateway` with `API_SERVER_ENABLED=true`); gated by `HERMES_INTEGRATION=1` + `HERMES_API_URL`/`HERMES_API_KEY` env vars and excluded from the default test run. They exercise the real bridges end-to-end: real chat turn, session CRUD, cron create→run→output, skill list/view, memory round-trip, goal set/clear, hook list, config get/set on a throwaway profile.
- Contract guard: the OpenAPI spec is snapshot-tested so any route/schema change is an explicit, reviewed diff.
- **Authorization matrix tests:** a generated test iterates every route × every scope tier × both principal types and asserts allow/deny matches the permission catalog — a new route without a declared scope fails the suite. Token-exchange tests cover scope-subset enforcement, tier-1-only user tokens, auto-provisioning on/off, disable-invalidates-tokens, and that `metadata`/withheld profile fields never reach the injected `<user-context>` block at any visibility level.

## Cross-cutting rules

- The Hermes `API_SERVER_KEY` and everything in `~/.hermes/.env` never appear in any API response, log line, or client bundle.
- All mutating operations that Hermes gates behind approval/consent (skill writes, shell-hook consent, memory approval) surface that state through the API rather than bypassing it.
- Profile isolation: every backend call carries the resolved profile; tests always run against a dedicated throwaway profile.
