# HTTP API conventions

Everything the clients do is plain HTTP plus server-sent events, so any language works. This section is the complete endpoint reference; the pages after this one cover each group.

## Authentication

Every route except `GET /v1/status` requires `Authorization: Bearer <token>`. The token is either an `hk_` API key or a user JWT verified by the configured [auth provider](/auth/). Unauthenticated requests get 401 on every path, even unknown ones.

```bash
curl -s http://localhost:8643/v1/auth/whoami -H "Authorization: Bearer $TOKEN"
```

```json
{ "type": "api_key", "id": "ab12cd34", "name": "my-app", "scopes": ["chat:invoke"] }
```

For a user token the body is `{ "type": "user", "id": "...", "email": "..." }`; for anonymous mode it is `{ "type": "anonymous" }`.

## Errors

Failures are JSON with stable codes:

```json
{ "error": { "code": "missing_scope", "message": "This route requires the chat:invoke scope" } }
```

Common codes: `unauthorized` (401), `missing_scope` and `api_key_required` and `profile_forbidden` (403), `not_found`, `session_not_found`, `profile_not_found` (404), `payload_too_large` (413), `rate_limited` (429, with `retry-after`), `invalid_request` and `invalid_message` (400), `upstream_error` and `cli_error` (502), `not_supported` (501).

## Profiles

Any route accepts an `X-Hermes-Profile: <name>` header to target one of the host's isolated Hermes profiles. Keys minted with `--profile` are pinned; see [Profiles](/api/profiles).

## Route groups

| Group | Routes | Backed by |
| ----- | ------ | --------- |
| [Chat](/api/chat) | `/v1/sessions*` | The server's own SQLite store plus the upstream agent |
| [Discovery](/api/discovery) | `/v1/health`, `/v1/capabilities`, `/v1/models*`, `/v1/skills`, `/v1/toolsets` | HTTP proxy |
| [Runs](/api/runs) | `/v1/runs*` | HTTP proxy with per-principal ownership |
| [Jobs](/api/jobs) | `/v1/jobs*` | HTTP proxy, plus CLI and filesystem for history and output |
| [Profiles](/api/profiles) | `/v1/profiles*` | CLI bridge |
| [Management](/api/management) | config, providers, ops, hooks, gateway, kanban, and more | CLI bridge |
| [Files](/api/files) | memory, soul, skills, bundles, cron output, subagents | Filesystem bridge |
| [Goals and commands](/api/goals) | `/v1/agent/sessions/:id/goal*`, `/v1/commands` | state.db reads plus the command relay |
| [Events](/api/events) | `/v1/events` | Server-side event bus over SSE |
| [Tools and passthrough](/api/passthrough) | media, web, browser, `/v1/chat/completions`, `/v1/responses` | HTTP proxy |

Two response styles exist. Routes backed by the HTTP proxy or the server's own store return structured JSON. Routes backed by the CLI bridge return `{ "ok": true, "raw": "<command output>" }`; they are best-effort against hermes 0.20.x subcommand names, and the `raw` field always carries what the CLI actually printed.
