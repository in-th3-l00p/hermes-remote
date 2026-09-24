# Rate limits, audit log, and limits

## Rate limiting

Two fixed-window limiters run independently:

* **Auth-failure limiter, always on.** Requests that end in 401 count against the client IP: 30 per 60 seconds by default. This throttles credential guessing before the (expensive) argon2 hash check runs.
* **Per-principal limiter, opt in.** Enabled by `--rate-limit <n> --rate-window <seconds>` or the `rateLimit` config key. Each API key, each user, and each anonymous client gets its own budget, so one abusive caller cannot starve the rest.

Exceeding either returns 429 with a `retry-after` header and this body:

```json
{ "error": { "code": "rate_limited", "message": "Too many requests" } }
```

## Audit log

`~/.hermes-remote/audit.log` is append-only JSONL (mode 0600). Every mutation, every refused or failed request (status 400 and up, including 401, 403 and 429), and every read outside routine chat and discovery traffic (config, logs, memory, files, profiles, ...) lands there with the acting principal and client address. Key changes made with `hermes-remote keys` are recorded too, as `CLI` entries with principal `host`:

```json
{"at":"2026-08-31T12:00:00.000Z","method":"POST","path":"/v1/sessions","status":201,"principal":"key:ab12cd34","ip":"203.0.113.7"}
{"at":"2026-08-31T12:00:05.000Z","method":"GET","path":"/v1/sessions","status":401,"principal":"unauthenticated","ip":"198.51.100.4"}
{"at":"2026-08-31T12:01:00.000Z","method":"CLI","path":"keys revoke ab12cd34","status":0,"principal":"host"}
```

Ship it to your log pipeline; nothing rotates it for you.

## Request limits

Defaults, overridable via the `limits` option when embedding the server:

| Limit | Default |
| ----- | ------- |
| Request body size | 10,000,000 bytes |
| Message length | 8,000 characters |
| Attachments per message | 4 |
| Attachment data URL length | 2,000,000 characters |

Oversized bodies get 413 `payload_too_large`; oversized messages and attachments get 400 `invalid_message`.

Fixed caps on other inputs: image prompts, web search queries and browser tasks up to 8,000 characters; a run's `input` up to 100,000 characters when serialized; reactions up to 16 characters without whitespace, and at most 20 distinct reactions per message.

## The demo agent

When no upstream is configured, chat routes answer from a built-in offline demo agent, and discovery/runs/jobs answer from offline fakes. This is intentional: the full stack, clients, and hooks can be exercised without a Hermes agent. `serve` prints which agent is active on startup.

## Running as a service

`hermes-remote service install` writes a launchd plist (macOS) or a systemd user unit (Linux) so the server starts on boot with the config file. `hermes-remote logs --tail 100` tails the server log. For TLS, reverse proxies, and hardening, see [Deploying](/tutorials/deploying).

## Metrics

`GET /v1/metrics` serves Prometheus metrics to API keys holding `status:read`:

| Metric | Type | Labels |
| ------ | ---- | ------ |
| `hermes_http_requests_total` | counter | `method`, `route` (the route pattern, never a raw id), `status` |
| `hermes_http_request_duration_seconds` | histogram | `method`, `route`; time to response headers (streams continue after it) |
| `hermes_chat_turns_total` | counter | `outcome`: `completed`, `stopped`, `failed` |
| `hermes_chat_turns_in_flight` | gauge | |

A Prometheus scrape job only needs a bearer token:

```yaml
scrape_configs:
  - job_name: hermes-remote
    metrics_path: /v1/metrics
    authorization: { credentials: hk_... }
    static_configs: [{ targets: ["127.0.0.1:8643"] }]
```

Worth alerting on: a rising share of 5xx responses (the agent or the `hermes` CLI is unavailable), `hermes_chat_turns_total{outcome="failed"}`, and 401/429 bursts (credential guessing).
