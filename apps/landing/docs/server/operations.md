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

`~/.hermes-remote/audit.log` is append-only JSONL. Every non-GET request and every 401 lands there with the acting principal:

```json
{"at":"2026-08-31T12:00:00.000Z","method":"POST","path":"/v1/sessions","status":201,"principal":"key:ab12cd34"}
{"at":"2026-08-31T12:00:05.000Z","method":"GET","path":"/v1/sessions","status":401,"principal":"unauthenticated"}
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

## The demo agent

When no upstream is configured, chat routes answer from a built-in offline demo agent, and discovery/runs/jobs answer from offline fakes. This is intentional: the full stack, clients, and hooks can be exercised without a Hermes agent. `serve` prints which agent is active on startup.

## Running as a service

`hermes-remote service install` writes a launchd plist (macOS) or a systemd user unit (Linux) so the server starts on boot with the config file. `hermes-remote logs --tail 100` tails the server log. For TLS, reverse proxies, and hardening, see [Deploying](/tutorials/deploying).
