# Changelog

## Unreleased (2.0.0)

* **Breaking:** the management CLI moved out of `@in-th3-l00p/hermes-remote` into its own package, `@in-th3-l00p/hermes-remote-cli` (`packages/cli`). The `hermes-remote` and `hermes-api` bins are now installed via `npm i -g @in-th3-l00p/hermes-remote-cli`. The server package no longer ships bins and is a pure library; its exports are unchanged.
* Internal restructure: every package is split into one module per concern (server: scopes/limits → auth → chat → http; cli: one file per command family) with no behavior change; code-structure rules added to CONTRIBUTING.md.

### Server (`@in-th3-l00p/hermes-remote`)

* Failed authentication attempts are now rate limited per IP (default 30/60s, configurable via `authFailureLimit`); over-limit attempts get 429 with `retry-after` before any key verification work.
* Anonymous principals are rate-limited per client IP instead of one shared bucket; audit entries log them as `anonymous:<ip>`.
* The request body cap is enforced by `Bun.serve` (`maxRequestBodySize`), closing the chunked-transfer bypass of the Content-Length check.
* SSE turns are cancelled upstream when the client disconnects; a second concurrent turn on a session returns 409 `turn_in_flight`; abandoned streams no longer leak upstream connections.
* Audit/request-log write failures fall back to stderr instead of failing the request.
* `keys.json` is written 0600 in a 0700 home dir (existing files are tightened on next write).
* User-influenced strings (email, user id, key name) are sanitized before entering the agent identity turn.

### CLI (`@in-th3-l00p/hermes-remote-cli`)

* `service install` units now use absolute binary paths with PATH/`HERMES_REMOTE_HOME` env, service log files, and restart delays — generated units actually start under launchd/systemd.
* `init` merges over the existing config instead of overwriting it, and writes `config.json` 0600.
* A malformed `config.json` fails `serve`/`init` loudly instead of silently booting unconfigured.
* A busy port fails with `port <n> already in use` instead of a stack trace.

### Client (`@in-th3-l00p/hermes-remote-client`)

* The SSE parser closes the connection on early consumer exit, handles CRLF and multi-line `data:` frames, strips BOMs, and skips malformed JSON payloads instead of aborting the stream.
* Streaming methods validate events at runtime (`narrowChatEvent`, newly exported) and drop malformed or unknown frames.
* A 401 with a static token fails immediately; the single retry now only happens when a `tokenProvider` is configured.

### React (`@in-th3-l00p/hermes-remote-react`)

* `useChat` aborts in-flight streams on unmount, `open()`, and `reset()` — no more cross-session message bleed or leaked connections; stream failures mark interrupted assistant messages as `error` instead of leaving them streaming forever.
* Editing a message that is no longer in the list appends instead of deleting the last message; unknown SSE event names are ignored.

## 1.0.0

First stable release, under the new name Hermes Remote (previously hermes-web).

### Server (`@in-th3-l00p/hermes-remote`)

* Secure HTTP facade over a local Hermes agent's API server with SSE streaming chat.
* SQLite persisted sessions with per user ownership, auto titles, pagination.
* Message edits with regeneration, reactions, image attachments, turn cancellation (`POST /v1/sessions/:id/stop`).
* Auth: scoped `hk_` API keys (argon2 hashed, expiry, rotation, CIDR allowlists) plus user JWTs verified via Supabase JWKS (ES256) or HS256 secret, plus optional anonymous mode.
* Per route scope enforcement, per principal rate limiting, append only audit log, request and attachment size limits, multi origin CORS.
* Agent identity injection: every turn tells the agent who it is speaking with.
* CLI: `init` (config file), `serve`, `keys` (create, list, show, revoke, rotate, grant, ungrant), `service` (launchd and systemd units), `logs`.

### Client (`@in-th3-l00p/hermes-remote-client`)

* Isomorphic, zero dependency client with typed SSE streaming, abort signals, `stopTurn`, automatic 401 retry via `tokenProvider`, typed `HermesApiError`.

### React (`@in-th3-l00p/hermes-remote-react`)

* `useChat` (send, edit, react, open, reset, stop, streaming state) and `useSessions` (list, refresh, remove), plus `HermesProvider`.

### Project

* 148 unit tests at 100% line and function coverage, gated in CI; live integration suite; docs site with tutorials and a technical write up; shadcn based reference chat app with Supabase auth (GitHub OAuth, email OTP, anonymous guests).
