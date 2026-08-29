# 1.1 The server and CLI

`@in-th3-l00p/hermes-remote` is a Bun server that sits next to a local Hermes agent and exposes it to the web. Its companion package `@in-th3-l00p/hermes-remote-cli` installs one binary, `hermes-remote` (with `hermes-api` kept as an alias).

## How it works

The Hermes agent's own gateway exposes an OpenAI compatible API on `127.0.0.1:8642`, guarded by an `API_SERVER_KEY`. Hermes Remote is a facade in front of it:

1. It authenticates every incoming request (API key, Supabase JWT, or optional anonymous mode).
2. It persists the conversation in SQLite (`~/.hermes-remote/chat.db`), scoped to the owning user.
3. It streams each turn to the upstream agent, injecting a system message that identifies the caller.
4. The upstream bearer key never leaves the server.

If no upstream is configured, a built in demo agent answers instead, so the whole stack can be exercised offline.

## CLI reference

```bash
hermes-remote init [flags]        # write ~/.hermes-remote/config.json
hermes-remote serve [flags]       # run the API server
hermes-remote keys create --name <n> --scope <s> [--scope ...]
    [--user-grantable <s,s>] [--expires 90d] [--cidr <a.b.c.d/n,...>] [--dangerous]
hermes-remote keys list | show <id> | revoke <id> | rotate <id>
hermes-remote keys grant <id> --scope <s> | ungrant <id> --scope <s>
hermes-remote service install | uninstall | status
hermes-remote logs [--tail 50]
```

### serve flags

| Flag | Env | Config key | Meaning |
| ---- | --- | ---------- | ------- |
| `--port` | | `port` | HTTP port, default 8643 |
| `--cors a,b` | | `cors` | Allowed browser origins (comma list) |
| `--upstream` | `HERMES_UPSTREAM_URL` | `upstreamUrl` | Hermes agent API server URL |
| `--upstream-key` | `HERMES_UPSTREAM_KEY` | `upstreamKey` | The agent's `API_SERVER_KEY` |
| `--model` | `HERMES_UPSTREAM_MODEL` | `upstreamModel` | Upstream model name |
| | | `auth` | User auth provider (`supabase`, `clerk`, `jwt`); see [Authentication](/auth/) |
| `--supabase-url` | `SUPABASE_URL` | `supabaseUrl` | Legacy: user tokens via JWKS (maps to the `jwt` provider) |
| `--supabase-jwt-secret` | `SUPABASE_JWT_SECRET` | `supabaseJwtSecret` | Legacy HS256 verification (maps to the `jwt` provider) |
| | `CLERK_SECRET_KEY` | | Enables the `clerk` provider when no other auth is set |
| `--anonymous` | | `anonymous` | Allow unauthenticated chat (demos only) |
| `--rate-limit` / `--rate-window` | | `rateLimit` | Requests per principal per window |

Precedence: flags override environment variables, which override `config.json`; an explicit `auth` config section beats the legacy supabase fields. `hermes-remote init` writes the config file so `serve` needs no flags at all.

## Scopes

API keys carry explicit scopes, organized in four tiers. Chat routes enforce them:

| Route | Required scope |
| ----- | -------------- |
| `POST /v1/sessions`, `DELETE /v1/sessions/:id`, reactions | `sessions:write` |
| `GET /v1/sessions`, `GET .../messages` | `sessions:read` |
| `POST .../messages`, `PATCH .../messages/:id`, `POST .../stop` | `chat:invoke` |
| `/v1/runs*` | `chat:invoke` (runs are owned per principal; API keys see all) |
| `GET /v1/health`, `/v1/capabilities`, `/v1/models*` | `status:read` |
| `GET /v1/skills` / `GET /v1/toolsets` | `skills:read` / `toolsets:read` |
| `/v1/jobs*` | `crons:read` (GET) / `crons:write` (mutations), API keys only |

Tier 3 scopes (config, hooks, skill installs, and other host level surfaces reserved for future routes) require `--dangerous` at creation time. User tokens are implicitly limited to tier 1 and to sessions they own.

## HTTP API and SSE protocol

All routes require `Authorization: Bearer <token>` unless `--anonymous` is set. `GET /v1/status` is the only public route.

| Route | Purpose |
| ----- | ------- |
| `GET /v1/status` | Health and version |
| `GET /v1/auth/whoami` | Introspect the calling principal |
| `POST /v1/sessions` | Create a session (owned by the caller) |
| `GET /v1/sessions?limit=&offset=` | List own sessions; anonymous callers pass `?ids=` |
| `DELETE /v1/sessions/:id` | Delete a session and its messages |
| `GET /v1/sessions/:id/messages?limit=&offset=` | History with `total` |
| `POST /v1/sessions/:id/messages` | Send `{content, attachments?}`, streams SSE |
| `PATCH /v1/sessions/:id/messages/:mid` | Edit a user message, truncate after it, regenerate |
| `POST /v1/sessions/:id/messages/:mid/reactions` | Toggle `{emoji}` |
| `POST /v1/sessions/:id/stop` | Abort the in flight turn, keep the partial reply |
| `GET /v1/health` | Own status + the upstream agent's readiness report |
| `GET /v1/capabilities` | hermes-remote features + the upstream capability set |
| `GET /v1/models` · `GET /v1/models/options` | Model discovery (proxied) |
| `GET /v1/skills` · `GET /v1/toolsets` | Agent skill and toolset enumeration (proxied) |
| `POST /v1/runs` | Start a long-running agent task (identity injected for user principals) |
| `GET /v1/runs` · `GET /v1/runs/:id` | List own runs / poll one |
| `GET /v1/runs/:id/events` | SSE event stream for a run (proxied) |
| `POST /v1/runs/:id/stop` · `/steer` · `/approval` | Control a run |
| `GET /v1/jobs` · `GET /v1/jobs/:id` | Inspect scheduled jobs (API key only) |
| `POST /v1/jobs` · `PATCH/DELETE /v1/jobs/:id` · `POST /v1/jobs/:id/pause\|resume\|run` | Administer jobs (API key only) |

Streaming responses are `text/event-stream` with these events, each carrying a JSON `data` payload:

| Event | Payload |
| ----- | ------- |
| `user` | The stored user message |
| `assistant` | `{ id }` of the reply placeholder |
| `delta` | `{ id, text }` appended token text |
| `done` | The final assistant message |
| `error` | `{ id, message }` when the agent fails |

Attachments are image data URLs; they are forwarded to the upstream model as vision content parts.

Beyond the routes above, the server exposes the agent's full management surface — profiles, config, providers, memory, soul, skills lifecycle, cron, hooks, gateway, kanban, goals, slash commands, media/web tools, events — documented separately in [1.4 The management API](/projects/management).

Discovery, run, and job routes are proxied from the upstream agent's API server (or served by the offline demo upstream when none is configured). Upstream failures come back as 502 `upstream_error` with the upstream status; user-started runs get the same verified-identity context injected as chat turns, and run visibility is per principal.

## Operational features

* Rate limiting per principal with `retry-after` on 429.
* Append only audit log (`~/.hermes-remote/audit.log`, JSONL) for auth failures and every mutation.
* Request body, message length, and attachment size caps (`limits` in the app options).
* `service install` writes a launchd plist (macOS) or systemd user unit (Linux) so the server survives reboots.
* `keys rotate` swaps the secret without changing the key's id or scopes; `--cidr` pins a key to source networks.
