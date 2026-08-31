# Management (CLI-backed)

These routes drive the `hermes` binary itself, through an allowlisted argv bridge with timeouts, a concurrency cap, and audit logging. Nothing else in the server shells out.

Three things to know before using any of them:

* **Responses are `{ "ok": true, "raw": "<command output>" }`.** The server does not parse the CLI's output; the `raw` string is what the command printed. Failures map to 502 `cli_error` with the exit code and stderr.
* **They are best-effort against hermes 0.20.x.** The argv templates target that version's subcommand names. If your agent is newer and a subcommand moved, the route still runs and `raw` carries the CLI's actual complaint. Validate the routes you depend on when the agent updates.
* **API keys only.** Every route below refuses user tokens, and most scopes are tier 2 or tier 3 (tier 3 needs `--dangerous` at key creation). All routes honor `X-Hermes-Profile`.

```bash
curl -s "$BASE/v1/agent/status" -H "Authorization: Bearer $HK_TOKEN"
```

```json
{ "ok": true, "raw": "hermes 0.20.4\ngateway: running\n..." }
```

## Route catalog

| Route | Scope | CLI command |
| ----- | ----- | ----------- |
| `GET /v1/config` | `config:read` | `config show` |
| `GET /v1/config/:key` | `config:read` | `config get <key>` |
| `PUT /v1/config/:key` body `{value}` | `config:write` | `config set <key> <value>` |
| `DELETE /v1/config/:key` | `config:write` | `config unset <key>` |
| `POST /v1/config/check` | `config:write` | `config check` |
| `POST /v1/config/migrate` | `config:write` | `config migrate` |
| `GET /v1/providers/model` | `status:read` | `config get model` |
| `PUT /v1/providers/model` body `{model}` | `providers:manage` | `model <model>` |
| `GET /v1/providers/fallbacks` | `status:read` | `fallback list` |
| `PUT /v1/providers/fallbacks` body `{chain}` | `providers:manage` | `fallback set <chain>` |
| `GET /v1/providers/moa` | `status:read` | `moa show` |
| `PUT /v1/providers/moa` body `{slots}` | `providers:manage` | `moa set <slots>` |
| `GET /v1/providers/auth` | `providers:manage` | `auth status` |
| `GET /v1/agent/status` | `status:read` | `status` |
| `GET /v1/agent/doctor` | `status:read` | `doctor` |
| `GET /v1/agent/prompt-size` | `status:read` | `prompt-size` |
| `GET /v1/agent/security-audit` | `status:read` | `security audit` |
| `GET /v1/insights?days=&source=` | `insights:read` | `insights` |
| `GET /v1/logs?tail=&source=&filter=` | `logs:read` | `logs` |
| `POST /v1/agent/pause` / `/resume` | `ops:control` | `pause` / `resume` |
| `GET /v1/memory/journey` | `memory:read` | `journey` |
| `GET /v1/memory/providers` | `memory:providers` | `memory status` |
| `PUT /v1/memory/providers` body `{provider}` | `memory:providers` | `memory set <provider>` |
| `GET /v1/soul/skins` | `soul:read` | `skin list` |
| `PUT /v1/soul/skin` body `{name}` | `soul:write` | `skin use <name>` |
| `GET /v1/skills/pending` | `skills:write` | `skills pending` |
| `POST /v1/skills/pending/:id/approve` / `/reject` | `skills:write` | `skills approve` / `reject` |
| `GET /v1/skills/hub/search?q=&source=` | `skills:read` | `skills search <q>` |
| `GET /v1/skills/hub/taps` | `skills:install` | `skills tap list` |
| `POST /v1/skills/hub/taps` body `{url}` | `skills:install` | `skills tap add <url>` |
| `DELETE /v1/skills/hub/taps/:name` | `skills:install` | `skills tap remove <name>` |
| `POST /v1/skills/hub/install` body `{source}` | `skills:install` | `skills install <source>` |
| `POST /v1/skills/:name/update` / `/uninstall` / `/audit` | `skills:install` | `skills update` / `uninstall` / `audit` |
| `GET /v1/skills/curator` | `skills:write` | `curator status` |
| `POST /v1/skills/curator/run` / `/pause` | `skills:write` | `curator run` / `pause` |
| `GET /v1/jobs/:id/runs` | `crons:read` | `cron runs <id>` |
| `GET /v1/checkpoints` | `checkpoints:rollback` | `checkpoints list` |
| `POST /v1/checkpoints/prune` | `checkpoints:rollback` | `checkpoints prune` |
| `GET /v1/approvals` | `config:read` | `approvals history` |
| `POST /v1/approvals/proposals` | `config:write` | `approvals propose` |
| `GET /v1/hooks` | `hooks:read` | `hooks list` |
| `GET /v1/hooks/doctor` | `hooks:read` | `hooks doctor` |
| `POST /v1/hooks/consent/revoke` body `{command}` | `hooks:manage` | `hooks revoke <command>` |
| `POST /v1/hooks/:event/test` | `hooks:manage` | `hooks test <event>` |
| `GET /v1/webhooks/subscriptions` | `webhooks:manage` | `webhook list` |
| `POST /v1/webhooks/subscriptions` body `{url}` | `webhooks:manage` | `webhook add <url>` |
| `DELETE /v1/webhooks/subscriptions/:id` | `webhooks:manage` | `webhook remove <id>` |
| `GET /v1/gateway` | `status:read` | `gateway status` |
| `GET /v1/gateway/platforms` | `status:read` | `gateway list` |
| `POST /v1/gateway/start` / `/stop` / `/restart` / `/enroll` | `ops:control` | `gateway <action>` |
| `PUT /v1/gateway/platforms/:name` body `{key, value}` | `config:write` | `config set gateway.<name>.<key> <value>` |
| `POST /v1/messages/send` body `{message, platform?, target?}` | `messaging:send` | `send <message> [--platform] [--to]` |
| `GET /v1/pairing/codes` | `pairing:manage` | `pairing list` |
| `POST /v1/pairing/codes` | `pairing:manage` | `pairing create` |
| `DELETE /v1/pairing/codes/:code` | `pairing:manage` | `pairing revoke <code>` |
| `GET /v1/kanban/tasks` | `kanban:read` | `kanban list` |
| `POST /v1/kanban/tasks` body `{title, description?}` | `kanban:write` | `kanban add <title>` |
| `PATCH /v1/kanban/tasks/:id` body `{status?, title?, assign?}` | `kanban:write` | `kanban update <id>` |
| `DELETE /v1/kanban/tasks/:id` | `kanban:write` | `kanban remove <id>` |
| `POST /v1/kanban/tasks/:id/comments` body `{text}` | `kanban:write` | `kanban comment <id> <text>` |
| `GET /v1/projects` | `projects:manage` | `project list` |
| `POST /v1/projects` body `{name}` | `projects:manage` | `project add <name>` |
| `PATCH /v1/projects/:name` body `{path?}` | `projects:manage` | `project update <name>` |
| `DELETE /v1/projects/:name` | `projects:manage` | `project remove <name>` |
| `GET /v1/mcp` | `mcp:manage` | `mcp list` |
| `POST /v1/mcp` body `{name, url}` | `mcp:manage` | `mcp add <name> <url>` |
| `DELETE /v1/mcp/:name` | `mcp:manage` | `mcp remove <name>` |
| `GET /v1/plugins` | `plugins:manage` | `plugins list` |
| `POST /v1/plugins/:name/enable` / `/disable` / `/validate` | `plugins:manage` | `plugins <action> <name>` |
| `POST /v1/backups/import` body `{path}` | `backups:manage` | `import <path>` |

Long operations (skill installs, audits, security audit, curator runs, backup imports) get extended timeouts of two to five minutes.

## The agent's own session store

Separate from the [chat surface](/api/chat), the upstream agent keeps its own sessions. hermes-remote proxies them for operators:

| Route | Scope |
| ----- | ----- |
| `GET /v1/agent/sessions`, `GET .../:id`, `GET .../:id/messages` | `sessions:read-all` |
| `POST /v1/agent/sessions`, `PATCH/DELETE .../:id`, `POST .../:id/fork`, `POST .../:id/model` | `sessions:write-all` |
| `POST /v1/agent/sessions/:id/chat` and `POST .../chat/stream` (SSE) | `sessions:write-all` plus `chat:invoke` |

These are cross-user surfaces by definition, which is why they sit behind the tier 2 `-all` scopes and never reach user tokens.
