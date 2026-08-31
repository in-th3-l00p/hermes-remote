# API keys and scopes

Every request resolves to exactly one principal before any route logic runs:

| Principal | Token | Gets |
| --------- | ----- | ---- |
| API key | `Bearer hk_<id>.<secret>` | Exactly the scopes minted on the key |
| User | `Bearer <jwt>` verified by the auth provider | Tier 1 scopes, own resources only |
| Anonymous | none (only with `--anonymous`) | Tier 1, sessions addressed by id |

Unauthenticated requests get 401 on every route, known or not, so the route map does not leak.

## API keys

Keys look like `hk_<id>.<secret>`. The server stores only an argon2 hash of the secret. Keys are created, granted, revoked, and rotated exclusively through [`hermes-remote keys`](/server/cli#keys) on the host; a leaked key can never mint another. Optional attributes per key: an expiry, an IPv4 CIDR allowlist checked against the socket address, and a profile pin (requests targeting a different Hermes profile get 403).

## The scope catalog

Scopes are a closed set in four tiers. Routes require them exactly; there is no wildcard and no admin scope. An "admin" is just a key that was explicitly granted many scopes.

### Tier 1: end-user surface

The only scopes a user token or anonymous principal can hold. For users they always mean "own resources only".

| Scope | Grants |
| ----- | ------ |
| `chat:invoke` | Send messages, edit and regenerate, stop turns, start runs, media/web/browser tool runs |
| `sessions:read` | List own chat sessions, read message history |
| `sessions:write` | Create and delete own sessions, toggle reactions |
| `sessions:search` | Reserved for session search |
| `goals:read` | Read a session's goal state (API-key routes) |
| `goals:write` | Set and manage goals (API-key routes) |
| `checkpoints:rollback` | List and prune checkpoints |
| `events:subscribe` | The `/v1/events` SSE firehose |
| `skills:read` | Skill enumeration and skill file reads |
| `bundles:read` | Skill bundle reads |
| `toolsets:read` | Toolset enumeration |
| `status:read` | Health, capabilities, models, profiles list, agent status |
| `subagents:read` | Delegation transcript listing |

### Tier 2: operator surface

API keys only. The server refuses these on user tokens.

| Scope | Grants |
| ----- | ------ |
| `memory:read` / `memory:write` | MEMORY.md and USER.md reads and writes |
| `skills:write` | Skill create/patch/delete, pending approvals, curator |
| `bundles:write` | Bundle writes |
| `crons:read` / `crons:write` | Scheduled job inspection and administration |
| `hooks:read` | Hook listing and doctor |
| `kanban:read` / `kanban:write` | Kanban board |
| `soul:read` | SOUL.md and skin reads |
| `insights:read` | Token and cost analytics |
| `logs:read` | Agent and gateway logs |
| `sessions:read-all` / `sessions:write-all` | The agent's own session store, across users |
| `subagents:control` | Reserved for steering subagents |
| `messaging:send` | One-shot delivery to messaging platforms |
| `projects:manage` | Project registry |

### Tier 3: dangerous, host-level

API keys only, and `keys create`/`keys grant` require the `--dangerous` flag for each of these.

| Scope | Grants |
| ----- | ------ |
| `config:read` / `config:write` | The agent's config.yaml, approvals |
| `soul:write` | SOUL.md writes, personality, skins |
| `hooks:manage` | Hook tests and consent revocation |
| `webhooks:manage` | Outbound webhook subscriptions |
| `skills:install` | Skill hub installs, updates, taps, audits |
| `mcp:manage` | MCP server management |
| `plugins:manage` | Plugin enable/disable/validate |
| `profiles:manage` | Profile create/delete/rename/export/import |
| `providers:manage` | Model routing, fallbacks, MoA, credential pools |
| `toolsets:manage` | Reserved for toolset writes |
| `memory:providers` | External memory provider selection |
| `ops:control` | Agent pause/resume, gateway start/stop/restart/enroll |
| `pairing:manage` | Pairing codes |
| `backups:manage` | Backup import |

### Auth tier

| Scope | Grants |
| ----- | ------ |
| `auth:users` | Reserved for token exchange and user management |

## Granting well

* Give each key the minimum. A chat product's backend needs `chat:invoke`, `sessions:read`, `sessions:write` and nothing else.
* `chat:invoke` is agent access: what a turn may do is bounded by the Hermes profile's toolsets. Serve a locked-down profile (web toolsets only, no terminal) to strangers, and pin the key to it with `--profile`.
* Rotate on any suspicion: `hermes-remote keys rotate <id>` keeps the id and scopes, kills the old secret instantly.
