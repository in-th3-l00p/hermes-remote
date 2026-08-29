# Full-coverage hermes-api — design

Date: 2026-08-29
Status: approved

## Goal

Make hermes-api a complete web interface to a Hermes agent: every feature and
configuration surface of the agent (per the official docs and the live
product) reachable over HTTP with hermes-remote auth on top, multi-profile
aware, with a complete TypeScript client and React hook layer. Management
surfaces are API-key-scoped; user tokens keep tier 1 only.

## Architecture: three bridges

1. **HTTP proxy bridge** (exists) — the gateway API server (chat, responses,
   runs, models, capabilities, skills/toolsets read, upstream sessions, jobs).
2. **CLI bridge** (new) — `CliBridge` executes the `hermes` binary with
   **allowlisted argv templates only** (data-defined, no shell strings, no
   user-supplied flags), a `-p <profile>` flag when targeting a non-default
   profile, timeouts, a concurrency cap, and audit entries. Command output is
   parsed with per-command parsers where structured; the raw text is always
   returned in a `raw` field. Injectable seam (`FakeCliBridge` in tests).
3. **FS bridge** (new) — `FsBridge` resolves paths inside a profile home with
   an **allowlisted file map** (SOUL.md, memories, skills trees, bundles,
   cron outputs, logs, delegation transcripts, state.db read-only) and size
   caps. `.env`, `auth.json`, `keys.json`, and any credential material are
   **denylisted at the bridge level** — unreadable and unwritable through any
   endpoint. Path traversal is rejected by resolution against the root.

## Profiles (the multiplexer)

- `ProfileRegistry` discovers profiles via `hermes profile list` and resolves
  each profile's home directory and gateway upstream (port + API key read
  from the profile env by the host CLI wiring, never exposed).
- Every route accepts `X-Hermes-Profile`; absent means the default profile.
- API keys may be minted with `--profile <name>` (new key attribute
  `profile?: string`); a profile-restricted key is rejected (403
  `profile_forbidden`) on any other profile.
- Endpoints: `GET /v1/profiles`, `GET /v1/profiles/:name` (`status:read`);
  `POST /v1/profiles`, `DELETE /v1/profiles/:name`, `PATCH /v1/profiles/:name`
  (rename/describe), `POST /v1/profiles/:name/export` (streams archive),
  `/import`, `/install`, `/update` (`profiles:manage`).

## Scope additions (tier assignments)

`ops:control` (T3), `messaging:send` (T2), `pairing:manage` (T3),
`projects:manage` (T2), `backups:manage` (T3). Everything else maps to the
existing catalog. No admin scope; user tokens remain tier 1 (chat, own
sessions, runs, discovery, goals on own sessions, safe commands).

## Endpoint catalog

Legend: bridge = HTTP (gateway proxy) | CLI | FS | HR (hermes-remote logic).

### Already shipped (become profile-aware)
Chat sessions/messages/SSE/stop; whoami; status; health; capabilities;
models(+options); skills/toolsets read; runs (create/list/get/events/stop/
steer/approval); jobs CRUD+lifecycle.

### Config & providers (CLI) — Wave 2
| Endpoint | Scope | Bridge |
|---|---|---|
| `GET /v1/config` (redacted) | `config:read` | CLI `config show` |
| `GET /v1/config/:key` · `PUT` · `DELETE` | `config:read`/`config:write` | CLI `config get/set/unset` |
| `POST /v1/config/check` · `/migrate` | `config:write` | CLI |
| `GET/PUT /v1/providers/model` | `status:read`/`providers:manage` | CLI `model` |
| `GET/PUT /v1/providers/fallbacks` | same | CLI `fallback` |
| `GET/PUT /v1/providers/moa` | same | CLI `moa` |
| `GET /v1/providers/auth` (pool status, no secrets) | `providers:manage` | CLI `auth` |

### Agent ops & observability — Wave 2
| Endpoint | Scope | Bridge |
|---|---|---|
| `GET /v1/agent/status` | `status:read` | CLI `status` |
| `GET /v1/agent/doctor` | `status:read` | CLI `doctor` |
| `GET /v1/agent/prompt-size` | `status:read` | CLI `prompt-size` |
| `GET /v1/agent/security-audit` | `status:read` | CLI `security` |
| `GET /v1/insights?days=` | `insights:read` | CLI `insights` |
| `GET /v1/logs?source=&filter=&tail=` | `logs:read` | CLI `logs` |
| `POST /v1/agent/pause` · `/resume` | `ops:control` | CLI `pause`/`resume` |

### Memory, soul, journey — Wave 3
| Endpoint | Scope | Bridge |
|---|---|---|
| `GET /v1/memory` · `GET /v1/memory/user` (+limits/usage) | `memory:read` | FS |
| `PUT /v1/memory` · `PUT /v1/memory/user` | `memory:write` | FS |
| `POST /v1/memory/entries` (add/replace/remove) | `memory:write` | HR over FS |
| `GET /v1/memory/journey` | `memory:read` | CLI `journey` |
| `GET/PUT /v1/memory/providers` | `memory:providers` | CLI `memory` |
| `GET/PUT /v1/soul` | `soul:read`/`soul:write` | FS SOUL.md |
| `GET /v1/soul/skins` · `PUT /v1/soul/skin` | `soul:write` | CLI `skin` |

### Skills lifecycle & bundles — Wave 3
| Endpoint | Scope | Bridge |
|---|---|---|
| `GET /v1/skills/:name` · `GET .../files/*path` | `skills:read` | FS |
| `POST /v1/skills` · `PATCH/DELETE /v1/skills/:name` · `PUT .../files/*path` | `skills:write` | FS |
| `GET /v1/skills/pending` · `POST .../:id/approve|reject` | `skills:write` | CLI `skills` |
| `GET /v1/skills/hub/search?q=&source=` | `skills:read` | CLI |
| `POST /v1/skills/hub/install` · `POST /v1/skills/:name/update|uninstall|audit` | `skills:install` | CLI |
| `GET/POST /v1/skills/hub/taps` · `DELETE .../taps/:name` | `skills:install` | CLI |
| `GET /v1/skills/curator` · `POST .../run|pause` | `skills:write` | CLI `curator` |
| `GET/POST /v1/bundles` · `GET/PUT/DELETE /v1/bundles/:name` | `bundles:read`/`bundles:write` | FS + CLI |

### Cron (full), checkpoints, approvals — Wave 4
| Endpoint | Scope | Bridge |
|---|---|---|
| `GET /v1/jobs/:id/runs` | `crons:read` | CLI `cron runs` |
| `GET /v1/jobs/:id/output` · `/output/:name` | `crons:read` | FS cron/output |
| `GET /v1/checkpoints` · `POST /v1/checkpoints/prune` | `checkpoints:rollback` | CLI `checkpoints` |
| `GET /v1/approvals` · `POST /v1/approvals/proposals` | `config:read`/`config:write` | CLI `approvals` |

### Hooks & webhooks — Wave 4
| Endpoint | Scope | Bridge |
|---|---|---|
| `GET /v1/hooks` (all systems + consent) | `hooks:read` | CLI `hooks list` |
| `POST /v1/hooks/:event/test` | `hooks:manage` | CLI `hooks test` |
| `POST /v1/hooks/consent/revoke` | `hooks:manage` | CLI `hooks revoke` |
| `GET /v1/hooks/doctor` | `hooks:read` | CLI `hooks doctor` |
| `GET/POST/DELETE /v1/webhooks/subscriptions` | `webhooks:manage` | CLI `webhook` |

### Gateway — Wave 4
| Endpoint | Scope | Bridge |
|---|---|---|
| `GET /v1/gateway` (state + per-platform connection) | `status:read` | CLI `gateway status` + HTTP health |
| `POST /v1/gateway/start|stop|restart` | `ops:control` | CLI |
| `GET /v1/gateway/platforms` | `status:read` | HR (health platforms + config) |
| `PUT /v1/gateway/platforms/:name` (non-secret settings; secrets write-only via config) | `config:write` | CLI config |
| `POST /v1/gateway/enroll` | `ops:control` | CLI |

### Messaging, kanban, projects — Wave 4
| Endpoint | Scope | Bridge |
|---|---|---|
| `POST /v1/messages/send` | `messaging:send` | CLI `send` |
| `GET/POST /v1/pairing/codes` · `DELETE .../:code` | `pairing:manage` | CLI `pairing` |
| `GET/POST /v1/kanban/tasks` · `PATCH/DELETE .../:id` · comments/links | `kanban:read`/`kanban:write` | CLI `kanban` |
| `GET/POST/PATCH/DELETE /v1/projects` | `projects:manage` | CLI `project` |

### Runtime management — Wave 4
| Endpoint | Scope | Bridge |
|---|---|---|
| `PUT /v1/toolsets/:platform` (enable/disable lists) | `toolsets:manage` | CLI `tools` |
| `GET/POST /v1/mcp` · `DELETE /v1/mcp/:name` | `mcp:manage` | CLI `mcp` |
| `GET /v1/plugins` · `POST /v1/plugins/:name/enable|disable|validate` | `plugins:manage` | CLI `plugins` |
| `POST /v1/backups` (zip stream) · `POST /v1/backups/import` | `backups:manage` | CLI `backup`/`import` |

### Upstream sessions, commands, goals — Wave 5
| Endpoint | Scope | Bridge |
|---|---|---|
| `GET/POST /v1/agent/sessions` · `GET/PATCH/DELETE /v1/agent/sessions/:id` | `sessions:read-all`/`sessions:write-all` | HTTP `/api/sessions` |
| `GET .../messages` · `POST .../fork` · `POST .../model` | same | HTTP |
| `POST .../chat` · `POST .../chat/stream` (SSE) | `chat:invoke` + `sessions:write-all` | HTTP |
| `GET /v1/commands` (catalog + scope map) | any authenticated | HR |
| `POST /v1/agent/sessions/:id/commands` `{command}` | per-command scope from the allowlist | HTTP chat relay |
| `GET /v1/agent/sessions/:id/goal` (text, contract, subgoals, gates+state, turns, wait, verdict) | `goals:read` | FS state.db read-only |
| `PUT/DELETE .../goal`, `POST .../goal/pause|resume`, `POST .../goal/wait`·`/unwait` | `goals:write` | command relay |
| `GET/POST .../goal/gates` · `DELETE .../gates/:n` · `DELETE .../gates` | `goals:write` | command relay |
| `GET/POST .../goal/subgoals` · `DELETE .../subgoals/:n` · `DELETE .../subgoals` | `goals:write` | command relay |
| `GET /v1/events` (SSE firehose of hermes-remote-observed lifecycle events) | `events:subscribe` | HR |

Command relay: send the slash-command text through upstream session chat
(stream) and return the outcome. Whether the upstream intercepts commands is
verified during implementation (live probe was inconclusive); if it does not,
goal reads stay on state.db and goal writes return 501 `not_supported` with
the upstream capability report — never silent misbehavior. The command
allowlist maps each command to a scope; unlisted commands are rejected.

### Media & web — Wave 6
| Endpoint | Scope | Bridge |
|---|---|---|
| `POST /v1/media/tts` | `chat:invoke` | HTTP audio api when `capabilities.audio_api`, else 501 |
| `POST /v1/media/images` `{prompt, model?}` | `chat:invoke` | HR templated run over `image_gen` toolset |
| `POST /v1/web/search` `{query}` | `chat:invoke` | HR templated run over `web` toolset |
| `POST /v1/web/extract` `{url}` | `chat:invoke` | HR templated run |
| `POST /v1/browser/tasks` + `GET .../:id` + `GET .../:id/events` | `chat:invoke` | HR runs with browser toolset |
| `POST /v1/chat/completions` · `POST /v1/responses` (raw passthrough) | `chat:invoke`, api_key only | HTTP |
| `GET /v1/subagents` (delegation monitor) | `subagents:read` | FS delegation transcripts |

Templated runs: the endpoint builds a constrained run input instructing the
agent to call exactly one tool and return its result; responses are parsed
back into structured fields with the raw output included.

### Out of scope (documented)
Interactive wizards (`setup`, platform onboarding, `login`), host lifecycle
(`update`, `uninstall`), alternate servers/UIs (`serve`, `dashboard`,
`desktop`, `console`, `acp`, `proxy`, `lsp`), shell `completion`, `debug`
upload, migration tools (`claw`, `import-agent`), `secrets`/`egress`
mutations (status is readable via config/agent-status).

## Client (hermes-ts)

Namespaces covering every surface, all methods typed with `Promise<T = unknown>`
generics plus concrete interfaces for hermes-remote-owned shapes:
`profiles`, `config`, `providers`, `agent` (status/doctor/insights/logs/
pause/resume/promptSize/securityAudit), `memory`, `soul`, `skills` (incl.
hub, pending, curator), `bundles`, `jobs` (extended), `checkpoints`,
`approvals`, `hooks`, `webhooks`, `gateway`, `messaging`, `pairing`,
`kanban`, `projects`, `toolsets`, `mcp`, `plugins`, `backups`,
`agentSessions` (incl. `chatStream` SSE), `commands`, `goals`, `events`
(SSE iterable), `media`, `web`, `browser`, `subagents` — alongside the
existing `discovery`, `runs`, `conversation`. Every client call accepts the
profile via a `withProfile(name)` client derivative that sets
`X-Hermes-Profile` on all requests.

## React (react-hermes)

Generic foundation: `useResource(fetch, deps)` (data/loading/error/refresh)
and `useAction(fn)` (run/pending/error/result). Named hooks over them for the
UI-relevant surfaces: `useProfiles`, `useAgentStatus`, `useConfig`,
`useMemory`, `useSoul`, `useSkills`, `useBundles`, `useJobs`,
`useCheckpoints`, `useHooksInfo`, `useGateway`, `useKanban`, `useProjects`,
`useToolsets`, `useMcp`, `usePlugins`, `useAgentSessions`, `useGoal(sessionId)`,
`useCommands`, `useEvents` (SSE subscription), plus existing chat/runs hooks.
All hooks take `{ client }` (structural ClientLike types, consistent with the
package).

## Security invariants (extended)

- CLI bridge: allowlisted argv templates only; every invocation audited; a
  concurrency cap and timeout per command; the binary path is configured, not
  discovered from PATH at request time.
- FS bridge: allowlist + credential denylist; size caps; traversal-safe.
- Secrets are write-only everywhere (config set routes to .env; reads are
  redacted by `hermes config show`).
- Profile-restricted keys enforced before any bridge call.
- User tokens: tier 1 only — chat, own sessions/runs, discovery, goals and
  safe commands on their own sessions. Every management surface requires an
  API key with the exact scope.
- All mutations audited (existing audit middleware covers new routes).

## Testing

TDD, 100% line+function coverage throughout. `FakeCliBridge` replays
transcripts recorded from the live machine; FS fixtures in temp dirs;
`DemoUpstream` extended for upstream sessions + audio-off behavior;
table-driven tests over the declarative route catalog (one test row per
endpoint: scope denial, happy path, bridge failure). Integration suite gains
gated live checks per wave. Docs updated per wave; snippets checked.

## Delivery

Waves, each ending green and committed:
1. Bridges + ProfileRegistry + profile middleware + `/v1/profiles` + key
   profile restriction.
2. Config, providers, agent ops.
3. Memory, soul, journey, skills lifecycle, bundles, curator.
4. Cron extension, checkpoints, approvals, hooks, webhooks, gateway,
   messaging, pairing, kanban, projects, toolsets, mcp, plugins, backups.
5. Upstream sessions bridge, commands, goals, events.
6. Media, web, browser, passthrough, subagents.
7. Client namespaces complete + React hooks complete + docs + version bump
   (server/CLI 3.2.0, clients 1.2.0).
