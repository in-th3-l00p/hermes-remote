# Changelog

## Unreleased (2.0.0)

* **Breaking:** the management CLI moved out of `@in-th3-l00p/hermes-remote` into its own package, `@in-th3-l00p/hermes-remote-cli` (`packages/cli`). The `hermes-remote` and `hermes-api` bins are now installed via `npm i -g @in-th3-l00p/hermes-remote-cli`. The server package no longer ships bins and is a pure library; its exports are unchanged.

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
