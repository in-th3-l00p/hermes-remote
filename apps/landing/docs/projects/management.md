# 1.4 The management API

Since 3.2.0 hermes-remote exposes the agent's **full feature surface** — not just chat. Three bridges make that possible:

| Bridge | What it reaches | How |
| ------ | --------------- | --- |
| HTTP proxy | Gateway API (chat, runs, models, capabilities, agent sessions, jobs) | Authenticated proxy on 127.0.0.1:8642 |
| CLI | Everything the `hermes` binary manages (config, skills hub, cron, gateway, kanban, …) | Allowlisted argv templates, audited, with timeouts |
| Filesystem | `~/.hermes` documents (SOUL.md, memories, skill files, cron outputs) | Allowlisted paths; `.env`/`auth.json`/keys are unreadable by construction |

CLI-backed responses return `{ ok: true, raw: "<command output>" }`; failures map to 502 `cli_error` with the exit code. All management surfaces are **API-key only** with exact scopes — user tokens keep tier 1 (chat, own sessions and runs, discovery, safe reads).

## Profiles

Every route accepts `X-Hermes-Profile: <name>` to target one of the host's isolated Hermes profiles. Keys minted with `keys create --profile <name>` are pinned to that profile (requests elsewhere get 403 `profile_forbidden`). `GET /v1/profiles` lists profiles; `POST/PATCH/DELETE /v1/profiles*` and export/import/install/update manage them (`profiles:manage`). In the client, `client.withProfile("indra")` returns a client pinned to a profile.

## Endpoint groups

| Group | Endpoints | Scope |
| ----- | --------- | ----- |
| Config | `GET/PUT/DELETE /v1/config[/:key]`, `POST /v1/config/check\|migrate` | `config:read` / `config:write` |
| Providers | `GET/PUT /v1/providers/model\|fallbacks\|moa`, `GET /v1/providers/auth` | `status:read` / `providers:manage` |
| Agent ops | `GET /v1/agent/status\|doctor\|prompt-size\|security-audit`, `GET /v1/insights`, `GET /v1/logs`, `POST /v1/agent/pause\|resume` | `status:read`, `insights:read`, `logs:read`, `ops:control` |
| Memory | `GET/PUT /v1/memory[/user]`, `POST /v1/memory/entries`, `GET /v1/memory/journey`, `GET/PUT /v1/memory/providers` | `memory:*` |
| Soul | `GET/PUT /v1/soul`, `GET /v1/soul/skins`, `PUT /v1/soul/skin` | `soul:*` |
| Skills | `GET/POST/PATCH/DELETE /v1/skills[/:name]`, `GET/PUT .../files/*`, pending approve/reject, hub search/install/update/uninstall/audit/taps, curator | `skills:read/write/install` |
| Bundles | `GET/PUT/DELETE /v1/bundles[/:name]` | `bundles:*` |
| Cron | `/v1/jobs*` plus `GET /v1/jobs/:id/runs` and `GET /v1/jobs/:id/output[/:file]` | `crons:*` |
| Checkpoints / approvals | `GET /v1/checkpoints`, `POST /v1/checkpoints/prune`, `GET /v1/approvals`, `POST /v1/approvals/proposals` | `checkpoints:rollback`, `config:*` |
| Hooks / webhooks | `GET /v1/hooks[/doctor]`, `POST /v1/hooks/:event/test`, `POST /v1/hooks/consent/revoke`, `GET/POST/DELETE /v1/webhooks/subscriptions` | `hooks:*`, `webhooks:manage` |
| Gateway | `GET /v1/gateway[/platforms]`, `POST /v1/gateway/start\|stop\|restart\|enroll`, `PUT /v1/gateway/platforms/:name` | `status:read`, `ops:control`, `config:write` |
| Messaging / pairing | `POST /v1/messages/send`, `GET/POST/DELETE /v1/pairing/codes` | `messaging:send`, `pairing:manage` |
| Kanban / projects | `/v1/kanban/tasks*` (+comments), `/v1/projects*` | `kanban:*`, `projects:manage` |
| Runtime | `PUT /v1/toolsets/:platform`, `/v1/mcp*`, `/v1/plugins*`, `POST /v1/backups[/import]` | `toolsets:manage`, `mcp:manage`, `plugins:manage`, `backups:manage` |
| Agent sessions | `/v1/agent/sessions*` incl. messages, fork, model lock, `chat` and `chat/stream` | `sessions:read-all` / `sessions:write-all` |
| Subagents | `GET /v1/subagents` (delegation transcripts) | `subagents:read` |

## Goals (Ralph loops)

`GET /v1/agent/sessions/:id/goal` reads the full loop state straight from the agent's session database: goal text, completion contract, subgoals, quality gates with pass state, turn usage, wait barrier, and last judge verdict (`goals:read`). Gate and subgoal lists have their own GET routes.

Mutations (`PUT/DELETE .../goal`, pause/resume, wait/unwait, gates add/remove/clear, subgoals add/remove/clear) map to the agent's `/goal` and `/subgoal` slash commands, delivered through the **command relay** (below). All under `goals:write`.

## Slash commands

`GET /v1/commands` lists the allowlisted slash commands with the scope each requires; `POST /v1/agent/sessions/:id/commands {"command": "/goal status"}` runs one in a session. Unknown commands are rejected — the allowlist maps `/goal`, `/subgoal`, `/title`, `/model`, `/busy`, `/rollback`, `/context`, `/status`, `/journey`, `/personality`, `/skills`, `/cron`, `/sessions`, and `/hatch` to their scopes.

**Relay caveat (verified against a live agent):** the gateway API server does not intercept slash commands — a relayed command is processed as a normal model turn. The relay therefore ships **disabled by default** (`"commandRelay": true` in config.json enables it; `POST` routes return 501 while it is off). Goal *reads* work regardless, since they come from the state database.

## Media, web, and raw access

- `POST /v1/media/tts` proxies the upstream audio API when the agent's `capabilities.features.audio_api` is true; otherwise 501 with the capability report.
- `POST /v1/media/images {prompt, model?}`, `POST /v1/web/search {query}`, `POST /v1/web/extract {url}` run a templated single-tool agent run and return `{ runId, output, raw }` (structured output when the tool result parses as JSON).
- `POST /v1/browser/tasks {task}` starts a browser-automation run and returns `{ runId }`; follow it via the runs surface.
- `POST /v1/chat/completions` and `POST /v1/responses` pass through verbatim to the upstream's OpenAI-compatible API (API keys with `chat:invoke` only).

## Events

`GET /v1/events` (`events:subscribe`) is an SSE stream of lifecycle events hermes-remote observes: `run.created`, `run.stopped`, `agent_session.turn`, `command`, with heartbeats. It is the push channel for web dashboards.

## Configuration

In `~/.hermes-remote/config.json`:

```json
{
  "hermesBinary": "/usr/local/bin/hermes",
  "profileHomes": { "indra": "/Users/me/.hermes/profiles/indra" },
  "commandRelay": false
}
```

`hermesBinary` defaults to `hermes` on PATH; profile homes default to `~/.hermes/profiles/<name>`. Some CLI-backed endpoints depend on the installed hermes version's subcommand names — the `raw` field always carries the CLI's actual output.
