# HANDOFF.md — agent onboarding for Hermes Remote

This document exists so that any agent (or human) can pick up development cold. It records what is actually built, how it is deployed, every piece of external infrastructure, the conventions that must be preserved, and the known pitfalls. Read this before touching anything. Companion documents:

* `CLAUDE.md` — the Hermes agent feature reference (the upstream product this project wraps) plus project conventions.
* `ARCHITECTURE.md` — the original design document. **Partially aspirational, see "Design vs reality" below.**
* `RELEASE.md` — the five-milestone release plan. All milestones are complete as of v1.0.0 (2026-08); only human-only launch steps remain (video recording, X post).
* Docs site source in `apps/landing/docs/` — user-facing documentation, including a technical write-up under `internals/`.

## What this project is, in one paragraph

Hermes Remote turns a local [Hermes agent](https://hermes-agent.nousresearch.com) into a secure web product. A Bun server (`packages/hermes-api`, published as `@in-th3-l00p/hermes-remote`, managed by the CLI in `packages/cli` → `@in-th3-l00p/hermes-remote-cli`) sits in front of the agent's built-in OpenAI-compatible API server (127.0.0.1:8642), adds authentication (scoped API keys + user JWTs), authorization, persistence (SQLite chat sessions), rate limiting, and identity injection, and exposes streaming chat over SSE. A typed client (`packages/hermes-ts` → `@in-th3-l00p/hermes-remote-client`) and React hooks (`packages/react-hermes` → `@in-th3-l00p/hermes-remote-react`) consume it. A reference chat app (`apps/chat`) and a marketing/docs site (`apps/landing`) complete the product. Released at v1.0.0, live at https://hermes-remote.tiscacatalin.com.

## Design vs reality

`ARCHITECTURE.md` describes three bridges (HTTP proxy, CLI bridge, FS bridge), an OpenAPI/Zod schema pipeline, and API coverage of the agent's full feature surface (memory, cron, hooks, goals, skills management...). **What is actually implemented at 1.0.0 is the HTTP proxy bridge only, scoped to chat**: streaming turns, sessions, messages (edit/react/attachments), turn cancellation, plus the full identity/auth/scopes layer. The router is hand-rolled on `Bun.serve` (no Hono, no Zod, no OpenAPI generation) — this was a deliberate simplification. The CLI bridge, FS bridge, and the wider endpoint map remain the natural roadmap for 1.x/2.0. When extending, keep ARCHITECTURE.md's principal model and scope rules — those ARE implemented and enforced exactly as written.

## Repository map

```
packages/hermes-api/          @in-th3-l00p/hermes-remote — server library (no bins since 2.0.0)
                              (one directory per concern; deps flow scopes/limits → auth → chat → http)
  src/scopes/                 closed scope catalog + 4 tiers (no admin scope, by design)
  src/limits/                 DEFAULT_LIMITS, RateLimiter (fixed window per principal), ipInCidr
  src/auth/principal.ts       Principal/KeyVerifier types, authenticate()
  src/auth/supabase.ts        UserTokenVerifier; hs256Verifier; SupabaseJwksVerifier (ES256/JWKS, kid cache)
  src/auth/keys.ts            KeyStore — hk_<id>.<secret> keys, argon2 via Bun.password, scopes, CIDR, rotate
  src/chat/agent.ts           AgentBackend interface; DemoAgent (offline fake); HermesAgent (upstream proxy)
  src/chat/identity.ts        identityTurn injection (security invariant) + history builder
  src/chat/routes/            /v1/sessions* dispatch: sessions.ts, messages.ts, sse.ts, shared.ts, validate.ts
  src/chat/store/             ChatStore — bun:sqlite; db.ts schema, messages.ts ops, types.ts models
  src/http/app.ts             createApp composition root: body cap, auth, rate limit, routing, audit
  src/http/cors.ts, whoami.ts CORS + whoami helpers
  src/http/server.ts          startServer — Bun.serve, requestIP → app.fetch(request, ip), audit JSONL append
packages/cli/                 @in-th3-l00p/hermes-remote-cli — management CLI (bins: hermes-remote, hermes-api)
  src/run.ts                  thin dispatcher over commands/
  src/commands/               keys.ts, serve.ts, service.ts, init.ts, logs.ts — one file per command family
  src/context.ts, config.ts   CliContext/CliResult/USAGE; config file load
  src/args.ts                 flag parsing
  src/cli.ts                  bin entry — wires config, HERMES_REMOTE_HOME ?? ~/.hermes-remote, real verifiers
packages/hermes-ts/           @in-th3-l00p/hermes-remote-client — isomorphic client
  src/http.ts                 HTTP/auth core: fetch wrapper, token|tokenProvider (401 single retry), SSE stream
  src/client.ts               HermesClient resource methods: sendMessage/editMessage (AsyncIterable<ChatEvent>,
                              AbortSignal), stopTurn, sessions CRUD, whoami
  src/sse.ts                  SSE parser (async iterator over fetch body)
packages/react-hermes/        @in-th3-l00p/hermes-remote-react — hooks
  src/use-chat.ts             useChat: React state wiring for messages, streaming, send/edit/react/open/reset/stop
  src/chat-events.ts          pure chat-event → message-list reducer used by useChat
  src/use-sessions.ts         useSessions: list/refresh/remove (note idsKey join — see gotchas)
  src/context.ts              HermesProvider + useHermesClient
apps/chat/                    Reference chat app: Vite + React + shadcn (zinc dark), Supabase auth
                              (GitHub OAuth, email OTP, anonymous), sessions sidebar, markdown, attachments
apps/landing/                 Marketing site (Vite multi-page: / and /examples/) + VitePress docs at /docs/
  docs/.vitepress/config.ts   base "/docs/", outDir "../dist/docs" — docs build INTO the landing dist
  vercel.json                 host-based 308 redirect hermes-web.* → hermes-remote.* (pattern "/(.*)" + "$1")
integration/                  Live-stack tests, own workspace, coverage OFF, gated by HERMES_INTEGRATION=1
scripts/check-snippets.ts     Bun.Transpiler parse-check of every ts/tsx fence in the docs (runs in CI)
assets/                       logo.svg, wordmark.svg, og.png (1200x630), announcement.md (X thread, unposted)
.github/workflows/test.yml    push/PR: install, build clients, typecheck, bun test packages (100% gate), snippets
.github/workflows/release.yml on v* tag: test, publish 4 packages to npm.pkg.github.com, tarballs on GH release
```

Directory names predate the rename (hermes-api/hermes-ts/react-hermes); the published npm names are the hermes-remote ones. Do not rename directories casually — imports, workspaces, and CI reference them.

## The security model (implemented, do not weaken)

* **Principals:** `api_key` (Bearer `hk_<id>.<secret>`, argon2-hashed secrets, minted only via CLI, never over HTTP), `user` (Supabase JWT verified via JWKS ES256, or HS256 secret fallback, through the `UserTokenVerifier` interface), `anonymous` (only if explicitly enabled). Unknown routes return 401 before 404 when unauthenticated (deliberate: don't leak the route map).
* **Scopes** are a closed catalog with four tiers; user tokens get tier 1 only and only their own sessions (`user_id` ownership enforced in ChatStore queries). There is **no admin scope** — administration is the host CLI only.
* **Identity injection:** every turn prepends a system message built by `identityTurn()` in `src/chat/routes.ts` (`<user-context>You are chatting through hermes-remote with <identity>...`). Only verified claims go in. This is how "the agent knows who it is speaking with" works end to end.
* The upstream `API_SERVER_KEY` lives only in server config; it must never reach responses, logs, or client bundles.
* Rate limiting is per principal (fixed window, `retry-after` on 429). Mutations and auth failures append JSONL to `~/.hermes-remote/audit.log`.

## The SSE protocol

`POST /v1/sessions/:id/messages` (and `PATCH .../messages/:mid` for edit+regenerate) stream `text/event-stream` with events: `user` (persisted user message echo), `assistant` (assistant message shell), `delta` (token chunk `{id, content}`), `done` (final message), `error`. `POST /v1/sessions/:id/stop` aborts the in-flight turn via an AbortController held in `options.turns` (a `Map` passed into `createApp`); the partial reply is kept and finished as `done`. The client's `sse.ts` and the server's `routes.ts` are the two ends — change them together, and exercise via the integration suite.

## Conventions (non-negotiable)

1. **100% line AND function coverage**, enforced by `bunfig.toml` `coverageThreshold = 1.0` and CI. `bun run test` = `bun test packages`. Every new feature ships with tests in the same commit. Side effects (fs, network, time, Bun.serve) go behind injectable seams — see how `CliContext`, `now`, `AgentBackend`, and `UserTokenVerifier` are injected. The docs page `internals/engineering.md` explains the approach.
2. **Two test tiers:** unit (no external deps, fakes for the agent) in `packages/*`; integration in `integration/` (`describe.skipIf(!process.env.HERMES_INTEGRATION)`), needs a live Hermes agent + running hermes-remote, env `HERMES_REMOTE_URL`/`HERMES_REMOTE_TOKEN`.
3. **Commits:** a few plain words, lowercase, no decoration, no "---", never a Co-Authored-By line. Examples in `git log`: "domain redirect", "jwks verification", "shadcn chat app".
4. **TypeScript strict everywhere; Bun everywhere** (`bun install`, `bun test`, `bun run`). Build clients before typecheck (`bun run --cwd packages/hermes-ts build`, same for react-hermes) — cross-package types resolve from `dist`.
5. **UI is shadcn only** (zinc dark theme, Tailwind v4 via @tailwindcss/vite). No hand-written CSS beyond tokens. Both apps/chat and apps/landing follow this.
6. `bun run typecheck` and `bun scripts/check-snippets.ts` must stay green; CI runs both.

## External infrastructure (accounts, projects, secrets)

* **GitHub:** repo `in-th3-l00p/hermes-remote` (renamed from hermes-web; old URL redirects). The machine's `gh` has TWO accounts and **keeps flipping to `catalin-george-tisca-fortech`** (work account) causing push 403s and publish failures. Before pushing or publishing: `gh auth switch --user in-th3-l00p`; for package publishes use `gh auth token --user in-th3-l00p` (token needs `write:packages`).
* **GitHub Packages:** all four packages published under scope `@in-th3-l00p` to `npm.pkg.github.com` (a stray 0.2.0 also exists from a failed `&&` chain — harmless). Release workflow publishes automatically on `v*` tags using `GITHUB_TOKEN`. Since the 2.0.0 split, the CLI ships as `@in-th3-l00p/hermes-remote-cli` (`packages/cli`) and the server package has no bins.
* **Release process:** bump versions in the four package.json files (hermes-api and cli stay in lockstep; cli's dependency on `@in-th3-l00p/hermes-remote` is a plain `^x.0.0` range, NOT `workspace:*`, because CI publishes with `npm publish` which does not rewrite workspace protocols — keep it in sync when bumping) → commit → `git tag vx.y.z` → push tag → `release.yml` tests, publishes, packs tarballs, creates/updates the GitHub release.
* **Vercel:** the landing project deploys `apps/landing` (build: `vite build && vitepress build docs`, output `dist/` containing `/`, `/examples/`, `/docs/`). Domains: `hermes-remote.tiscacatalin.com` (primary) and `hermes-web.tiscacatalin.com` (308 redirect via vercel.json host rule). Wildcard DNS for tiscacatalin.com already points at Vercel.
* **Supabase:** project `jhvuzxmhyyyovzgtdwvl` (eu-central-1). Signs tokens with **ES256** (JWKS at `https://jhvuzxmhyyyovzgtdwvl.supabase.co/auth/v1/.well-known/jwks.json`) — this is why `SupabaseJwksVerifier` exists; there is no shared HS256 secret for this project. Enabled: anonymous sign-ins, email OTP (built-in SMTP only — **needs custom SMTP before real production traffic**), GitHub OAuth (client `Ov23li7SAcVnYVbqn30n`; the secret passed through a chat session, so **rotating it is recommended**). Management API access worked via the CLI token in the macOS keychain (`security find-generic-password -l "Supabase CLI" -w`).
* **Local dev stack on this machine:** the Hermes agent runs under profile `indra` (`~/.hermes/profiles/indra/.env` holds its `API_SERVER_KEY`; gateway API on 127.0.0.1:8642). hermes-remote serves on **:8643**, chat app on **:5173** (`apps/chat/.env.local` has `VITE_HERMES_API_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`). Server state in `~/.hermes-remote/` (config.json, keys.db, chat.db, audit.log), overridable via `HERMES_REMOTE_HOME`.

## Known pitfalls (each cost real debugging time)

* **Bun coverage counts implicit class constructors as uncovered functions.** If a class has no constructor and coverage dips, add an explicit no-op constructor (see `DemoAgent`).
* **happy-dom's GlobalRegistrator leaks into later test files.** Every react test file must `GlobalRegistrator.unregister()` in `afterAll`, or server tests fail mysteriously.
* **`fetch` must be bound**: storing `fetch` in an options object and calling it later throws "Illegal invocation" in browsers — use `globalThis.fetch.bind(globalThis)`.
* **Duplicate React** after adding a dependency that bundles its own: `resolve.dedupe: ["react", "react-dom"]` in vite.config plus `rm -rf node_modules/.vite`.
* **useSessions render loop:** an array literal `ids` prop as a hook dep loops forever; the hook keys on `idsKey = ids.join(",")`. Preserve that pattern.
* **tsc rootDir:** the build tsconfigs (`tsconfig.build.json`) set `rootDir: "src"` and exclude tests; build scripts `rm -rf dist` first. Stale `dist/*.d.ts` breaks cross-package typecheck.
* **Vercel host redirects:** `"/:path*"` did not match; `"source": "/(.*)"` with `"$1"` does.
* **Vite binds [::1] by default** — Chrome on IPv4 fails; use `--host 0.0.0.0` when demoing.
* **Do not edit `~/.hermes/.env`** for the agent's API server settings — the live profile is `indra`, whose env is `~/.hermes/profiles/indra/.env`.

## Verification status at handoff

148 unit tests, 100% line+function coverage, strict typecheck clean, 15 doc snippets parse-checked, CI green on main, integration suite 4/4 against the live stack (real streamed turn, persistence round trip, live stop cancellation, auth rejection with a real Supabase ES256 token). Identity verified end to end: the agent answered with the authenticated user's email and Supabase user id, and with the stable anonymous id for guests.

## Roadmap / open work

1. **Widen the API surface** toward ARCHITECTURE.md: CLI bridge and FS bridge, then memory, cron, skills, goals, hooks endpoints, each with scopes from the existing catalog, client methods, and hooks where UI-relevant. This is the big 1.x/2.0 arc.
2. Human launch steps (owner only): record the 30–45s demo, post `assets/announcement.md` on X, submit to Nous Research Discord showcase.
3. Security hygiene: rotate the GitHub OAuth client secret; configure custom SMTP in Supabase for email OTP.
4. Nice-to-haves noted during development: hosted DemoAgent deployment for a clickable public demo (decided against for 1.0 — needs a Bun host), deprecation stub releases for the pre-rename 0.x package names.
