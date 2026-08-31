# Changelog

## Unreleased

* The live examples are now fully static demo apps. A new browser-safe package (`packages/examples-demo`, `@intheloop-studio/hermes-remote-examples-demo`) exports `createDemoFetch()`, an in-memory fake of the hermes-remote HTTP routes the six example apps call: seeded chat sessions, runs in several states with SSE event feeds, profiles (default/work/research), config, memory and soul files, jobs, discovery data, and an event firehose. Chat streams over the real SSE protocol with canned, prompt-keyed replies, and state is mutable per page load. Each example app wires the fake in through the client's `fetch` option; the served sandbox backend (`packages/examples-backend`), the Vercel Function at `/api/hermes/*`, the Groq integration, and the public sandbox key are all removed. The landing deployment is static files only.
* Live examples platform: six example React apps (chat, auth, configuration, runs, profiles, command-center) under `apps/examples/*`, each hosted at `/examples/<name>/app/` with an architecture article at `/examples/<name>/`; `/examples/` is a grid index.

## Unreleased (3.2.0)

* **Full agent coverage.** hermes-remote now exposes the agent's entire feature surface through three bridges: the existing HTTP proxy, a new CLI bridge (`HermesCliBridge` — allowlisted argv templates over the `hermes` binary, audited, with timeouts and a concurrency cap), and a new FS bridge (`FsBridge` — allowlisted profile-home paths; `.env`/`auth.json`/key material unreadable by construction).
* **Profiles**: `ProfileRegistry` + `/v1/profiles*` (list/show/create/delete/rename/describe/export/import/install/update); every route accepts `X-Hermes-Profile`; API keys can be minted with `--profile` and are pinned server-side.
* **~90 new management endpoints** (API-key scoped): config, providers (model/fallbacks/moa/auth pools), agent ops (status/doctor/insights/logs/prompt-size/security-audit/pause/resume), memory (files, entries, journey, providers), soul + skins, skills lifecycle (documents, files, pending approvals, hub search/install/update/audit/taps, curator), bundles, cron runs + outputs, checkpoints, approvals, hooks, webhooks, gateway control + platforms, messaging send, pairing, kanban, projects, toolsets, MCP, plugins, backups, subagent transcripts, and the agent's own session store (`/v1/agent/sessions*` incl. streaming chat, fork, model lock). Five new scopes: `ops:control`, `messaging:send`, `pairing:manage`, `projects:manage`, `backups:manage` — tiers otherwise unchanged, no admin scope, user tokens still tier 1.
* **Ralph loops (goals)**: `GET .../goal` (+gates/subgoals) reads full loop state — text, contract, gates with pass state, turn budget, wait barrier, judge verdict — directly from the agent's session database; mutations map to `/goal`//`/subgoal` slash commands via the command relay. **Slash commands**: `GET /v1/commands` catalog + `POST /v1/agent/sessions/:id/commands` with a command→scope allowlist. Live verification showed the upstream API server does not intercept slash commands (they run as model turns), so the relay ships disabled by default (`commandRelay` config).
* **Media & web**: `/v1/media/tts` (upstream audio API when the capability is on, 501 otherwise), `/v1/media/images`, `/v1/web/search`, `/v1/web/extract` (templated single-tool runs returning structured output), `/v1/browser/tasks`, plus raw OpenAI-compatible passthrough (`/v1/chat/completions`, `/v1/responses`) for API keys.
* **Events**: `GET /v1/events` SSE firehose of observed lifecycle events (run/session/command) with heartbeats.
* Client (1.2.0): complete namespace coverage (`profiles`, `config`, `providers`, `agent`, `memory`, `soul`, `skills`, `bundles`, `checkpoints`, `approvals`, `hooks`, `webhooks`, `gateway`, `messaging`, `pairing`, `kanban`, `projects`, `toolsets`, `mcp`, `plugins`, `backups`, `subagents`, `agentSessions`, `commands`, `goals`, `media`, `web`, `browser`, `events`, `passthrough`) and `client.withProfile(name)`.
* React (1.2.0): `useResource`/`useAction` generics, one hook per management surface, `useGoal` (loop state + mutations), `useEvents` (live SSE subscription).

## 3.1.0

* Server: the upstream agent now sits behind an `Upstream` interface family (`chat`, `discovery`, `runs`, `jobs`) with two implementations — `HermesUpstream` (live gateway) and `DemoUpstream` (offline fakes, used in demo mode and tests). `AppOptions.upstream` enables the new routes.
* New routes, all proxied from the upstream with hermes-remote auth on top: `GET /v1/health` (own status + upstream readiness), `GET /v1/capabilities` (hermes-remote features + upstream set), `GET /v1/models`, `GET /v1/models/options`, `GET /v1/skills`, `GET /v1/toolsets`; runs (`POST/GET /v1/runs`, `GET /v1/runs/:id`, SSE `GET /v1/runs/:id/events`, `POST .../stop|steer|approval`) under `chat:invoke` with per-principal ownership (`RunStore` in chat.db) and identity injection for user-started runs; jobs (`/v1/jobs*`) API-key-only under `crons:read`/`crons:write`. Upstream failures map to 502 `upstream_error`.
* Client (1.1.0): `client.discovery.*`, `client.runs.*` (including `events()` as an async iterable), `client.jobs.*`, and `client.conversation(sessionId?)` — a conversation handle that lazily creates its session on first send.
* React (1.1.0): `useAgentInfo`, `useRuns`, and `useRunEvents` hooks.
* Integration suite: gated live checks for health, capabilities, and models.

## 3.0.0

* **Breaking:** user authentication is now a providers module. `UserTokenVerifier`/`SupabaseUser` and the `userVerifier` option are replaced by `AuthProvider`/`VerifiedUser` and `authProvider`; `SupabaseJwksVerifier`, `hs256Verifier`, and `verifySupabaseJwt` are replaced by `JwtAuthProvider` (same zero-dependency JWKS/HS256 verification, plus optional `issuer`/`audience` pinning). `is_anonymous` on the verified identity is now `isAnonymous`.
* New SDK-backed providers, selected via config: `SupabaseAuthProvider` (official `@supabase/supabase-js`, `auth.getClaims`) and `ClerkAuthProvider` (official `@clerk/backend`, `verifyToken` with `secretKey` or networkless `jwtKey`, `audience`, `authorizedParties`). Both SDKs are optional peer dependencies loaded only when the provider is enabled; a missing SDK fails with an error naming the package. `createAuthProvider(config)` builds any provider from a plain config object.
* **Breaking:** the HTTP layer moved from a hand-rolled `Bun.serve` router to Hono. Wire behavior is unchanged (routes, error bodies, SSE protocol, 401-before-404, `retry-after` on 429); CORS, body caps, and both rate limiters (per principal, and per IP for failed auth) now come from `hono/cors`, `hono/body-limit`, and `hono-rate-limiter`. The exported `RateLimiter` class is gone; 429 responses additionally carry standard `RateLimit-*` headers, and oversized streamed bodies are rejected mid-flight instead of only via Content-Length.
* CLI: `config.json` gains an `auth` section (`{"auth": {"provider": "supabase" | "clerk" | "jwt", ...}}`). Legacy `--supabase-url`/`--supabase-jwt-secret` flags, env vars, and config fields keep working, mapped onto the `jwt` provider; `CLERK_SECRET_KEY` alone enables the Clerk provider.
* Docs: new Authentication section (overview, Supabase, Clerk, custom providers) and an end-to-end Clerk tutorial.

## 2.0.0

* **Breaking:** the management CLI moved out of `@intheloop-studio/hermes-remote` into its own package, `@intheloop-studio/hermes-remote-cli` (`packages/cli`). The `hermes-remote` and `hermes-api` bins are now installed via `npm i -g @intheloop-studio/hermes-remote-cli`. The server package no longer ships bins and is a pure library; its exports are unchanged.
* Internal restructure: every package is split into one module per concern (server: scopes/limits → auth → chat → http; cli: one file per command family) with no behavior change; code-structure rules added to CONTRIBUTING.md.

### Server (`@intheloop-studio/hermes-remote`)

* Failed authentication attempts are now rate limited per IP (default 30/60s, configurable via `authFailureLimit`); over-limit attempts get 429 with `retry-after` before any key verification work.
* Anonymous principals are rate-limited per client IP instead of one shared bucket; audit entries log them as `anonymous:<ip>`.
* The request body cap is enforced by `Bun.serve` (`maxRequestBodySize`), closing the chunked-transfer bypass of the Content-Length check.
* SSE turns are cancelled upstream when the client disconnects; a second concurrent turn on a session returns 409 `turn_in_flight`; abandoned streams no longer leak upstream connections.
* Audit/request-log write failures fall back to stderr instead of failing the request.
* `keys.json` is written 0600 in a 0700 home dir (existing files are tightened on next write).
* User-influenced strings (email, user id, key name) are sanitized before entering the agent identity turn.

### CLI (`@intheloop-studio/hermes-remote-cli`)

* `service install` units now use absolute binary paths with PATH/`HERMES_REMOTE_HOME` env, service log files, and restart delays — generated units actually start under launchd/systemd.
* `init` merges over the existing config instead of overwriting it, and writes `config.json` 0600.
* A malformed `config.json` fails `serve`/`init` loudly instead of silently booting unconfigured.
* A busy port fails with `port <n> already in use` instead of a stack trace.

### Client (`@intheloop-studio/hermes-remote-client`)

* The SSE parser closes the connection on early consumer exit, handles CRLF and multi-line `data:` frames, strips BOMs, and skips malformed JSON payloads instead of aborting the stream.
* Streaming methods validate events at runtime (`narrowChatEvent`, newly exported) and drop malformed or unknown frames.
* A 401 with a static token fails immediately; the single retry now only happens when a `tokenProvider` is configured.

### React (`@intheloop-studio/hermes-remote-react`)

* `useChat` aborts in-flight streams on unmount, `open()`, and `reset()` — no more cross-session message bleed or leaked connections; stream failures mark interrupted assistant messages as `error` instead of leaving them streaming forever.
* Editing a message that is no longer in the list appends instead of deleting the last message; unknown SSE event names are ignored.

## 1.0.0

First stable release, under the new name Hermes Remote (previously hermes-web).

### Server (`@intheloop-studio/hermes-remote`)

* Secure HTTP facade over a local Hermes agent's API server with SSE streaming chat.
* SQLite persisted sessions with per user ownership, auto titles, pagination.
* Message edits with regeneration, reactions, image attachments, turn cancellation (`POST /v1/sessions/:id/stop`).
* Auth: scoped `hk_` API keys (argon2 hashed, expiry, rotation, CIDR allowlists) plus user JWTs verified via Supabase JWKS (ES256) or HS256 secret, plus optional anonymous mode.
* Per route scope enforcement, per principal rate limiting, append only audit log, request and attachment size limits, multi origin CORS.
* Agent identity injection: every turn tells the agent who it is speaking with.
* CLI: `init` (config file), `serve`, `keys` (create, list, show, revoke, rotate, grant, ungrant), `service` (launchd and systemd units), `logs`.

### Client (`@intheloop-studio/hermes-remote-client`)

* Isomorphic, zero dependency client with typed SSE streaming, abort signals, `stopTurn`, automatic 401 retry via `tokenProvider`, typed `HermesApiError`.

### React (`@intheloop-studio/hermes-remote-react`)

* `useChat` (send, edit, react, open, reset, stop, streaming state) and `useSessions` (list, refresh, remove), plus `HermesProvider`.

### Project

* 148 unit tests at 100% line and function coverage, gated in CI; live integration suite; docs site with tutorials and a technical write up; shadcn based reference chat app with Supabase auth (GitHub OAuth, email OTP, anonymous guests).
