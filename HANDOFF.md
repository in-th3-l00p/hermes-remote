# HANDOFF.md — agent onboarding for Hermes Remote

This document exists so that any agent (or human) can pick up development cold. It records what is actually built, how it is deployed, every piece of external infrastructure, the conventions that must be preserved, and the known pitfalls. Read this before touching anything. Companion documents:

* `CLAUDE.md` — the Hermes agent feature reference (the upstream product this project wraps) plus project conventions.
* `ARCHITECTURE.md` — the original design document. **Partially aspirational, see "Design vs reality" below.**
* `RELEASE.md` — the five-milestone release plan. All milestones are complete as of v1.0.0 (2026-08); only human-only launch steps remain (video recording, X post).
* Docs site source in `apps/landing/docs/` — user-facing documentation, including a technical write-up under `internals/`.

## What this project is, in one paragraph

Hermes Remote turns a local [Hermes agent](https://hermes-agent.nousresearch.com) into a secure web product. A Bun server (`packages/hermes-api`, published as `@intheloop-studio/hermes-remote`, managed by the CLI in `packages/cli` → `@intheloop-studio/hermes-remote-cli`) sits in front of the agent's built-in OpenAI-compatible API server (127.0.0.1:8642), adds authentication (scoped API keys + user JWTs), authorization, persistence (SQLite chat sessions), rate limiting, and identity injection, and exposes streaming chat over SSE. A typed client (`packages/hermes-ts` → `@intheloop-studio/hermes-remote-client`) and React hooks (`packages/react-hermes` → `@intheloop-studio/hermes-remote-react`) consume it. A reference chat app (`apps/chat`) and a marketing/docs site (`apps/landing`) complete the product. Released at v1.0.0, live at https://hermes-remote.tiscacatalin.com.

## Design vs reality

`ARCHITECTURE.md` describes three bridges (HTTP proxy, CLI bridge, FS bridge), an OpenAPI/Zod schema pipeline, and API coverage of the agent's full feature surface (memory, cron, hooks, goals, skills management...). **Since 3.2.0 all three of ARCHITECTURE.md's bridges are implemented** (HTTP proxy, CLI bridge, FS bridge) and the API covers the agent's full feature surface: chat, discovery, runs, jobs, profiles (X-Hermes-Profile everywhere, profile-pinned keys), config/providers/ops, memory/soul/skills/bundles, cron+checkpoints+approvals, hooks/webhooks/gateway/messaging/pairing/kanban/projects/toolsets/mcp/plugins/backups, the agent's own session store, goals (Ralph loops, read from state.db; writes via the command relay, off by default — the upstream does NOT intercept slash commands, verified live), media/web tool runs, OpenAI passthrough, and an SSE event firehose. CLI-backed endpoints return `{ok, raw}` — several argv templates are best-effort against hermes 0.20.x subcommands and should be validated when the agent updates. Since 3.0.0 the HTTP layer runs on Hono (CORS, body caps, and rate limiting come from `hono/cors`, `hono/body-limit`, and `hono-rate-limiter`; still no Zod or OpenAPI generation). The CLI bridge, FS bridge, and the wider endpoint map remain the natural roadmap for 1.x/2.0. When extending, keep ARCHITECTURE.md's principal model and scope rules — those ARE implemented and enforced exactly as written.

## Repository map

```
packages/hermes-api/          @intheloop-studio/hermes-remote — server library (no bins since 2.0.0)
                              (one directory per concern; deps flow scopes/limits → auth → chat → http)
  src/scopes/                 closed scope catalog + 4 tiers (no admin scope, by design)
  src/limits/                 DEFAULT_LIMITS, RateLimitOptions, ipInCidr
  src/auth/principal.ts       Principal/KeyVerifier types, authenticate()
  src/auth/providers/         AuthProvider/VerifiedUser contract (types.ts), JwtAuthProvider (jwt.ts,
                              zero-dep HS256/JWKS+kid-cache, issuer/audience), SupabaseAuthProvider +
                              ClerkAuthProvider (official SDKs as optional peer deps behind the
                              loadModule seam), createAuthProvider registry
  src/auth/keys.ts            KeyStore — hk_<id>.<secret> keys, argon2 via Bun.password, scopes, CIDR, rotate
  src/chat/agent.ts           AgentBackend interface; DemoAgent (offline fake); HermesAgent (upstream proxy)
  src/chat/identity.ts        identityTurn injection (security invariant) + history builder
  src/chat/routes/            Hono sub-app: chatRoutes() in index.ts; sessions.ts, messages.ts, sse.ts,
                              shared.ts (ChatEnv/helpers), validate.ts
  src/chat/store/             ChatStore — bun:sqlite; db.ts schema, messages.ts ops, types.ts models
  src/bridge/                 CliBridge (allowlisted argv over the hermes binary, spawn seam,
                              timeout+concurrency cap) + FakeCliBridge test double; FsBridge
                              (profile-home file access, credential denylist, traversal-safe)
  src/profiles/               ProfileRegistry (parses `hermes profile list`, cached) + /v1/profiles
                              routes; X-Hermes-Profile middleware lives in http/middleware.ts
  src/mgmt/                   Management surface: catalog.ts (declarative CLI route table, ~70 rows),
                              routes.ts registrar, fs-routes.ts (memory/soul/skills files/bundles/
                              cron output/subagents), commands.ts (slash-command allowlist + relay),
                              goals.ts (GoalStore over state.db + Ralph-loop routes), shared.ts
  src/events/                 EventBus + GET /v1/events SSE
  src/upstream/               Upstream facade {chat, discovery, runs, jobs, sessions, raw}: types.ts contracts,
                              hermes.ts (live gateway bridge), demo.ts (offline fakes), run-store.ts
                              (per-principal run ownership, SQLite), identity.ts (run identity
                              injection), routes/ (discovery.ts, runs.ts, jobs.ts Hono sub-app)
  src/http/app.ts             createApp composition root: Hono app + middleware chain
  src/http/middleware.ts      cors/auth/audit middleware + both hono-rate-limiter instances
  src/http/whoami.ts          whoami body helper
  src/http/server.ts          startServer — Bun.serve, requestIP → app.fetch(request, ip), audit JSONL append
packages/cli/                 @intheloop-studio/hermes-remote-cli — management CLI (bins: hermes-remote, hermes-api)
  src/run.ts                  thin dispatcher over commands/
  src/commands/               keys.ts, serve.ts, service.ts, init.ts, logs.ts — one file per command family
  src/context.ts, config.ts   CliContext/CliResult/USAGE; config file load
  src/args.ts                 flag parsing
  src/cli.ts                  bin entry — wires config, HERMES_REMOTE_HOME ?? ~/.hermes-remote, real verifiers
packages/hermes-ts/           @intheloop-studio/hermes-remote-client — isomorphic client
  src/http.ts                 HTTP/auth core: fetch wrapper, token|tokenProvider (401 single retry), SSE stream
  src/client.ts               HermesClient resource methods: sendMessage/editMessage (AsyncIterable<ChatEvent>,
                              AbortSignal), stopTurn, sessions CRUD, whoami
  src/sse.ts                  SSE parser (async iterator over fetch body)
packages/react-hermes/        @intheloop-studio/hermes-remote-react — hooks
  src/use-chat.ts             useChat: React state wiring for messages, streaming, send/edit/react/open/reset/stop
  src/chat-events.ts          pure chat-event → message-list reducer used by useChat
  src/use-sessions.ts         useSessions: list/refresh/remove (note idsKey join — see gotchas)
  src/context.ts              HermesProvider + useHermesClient
packages/examples-demo/       @intheloop-studio/hermes-remote-examples-demo (private) — browser-safe,
                              dependency-free in-memory fake of the hermes-remote routes the example
                              apps call; createDemoFetch() plugs into HermesClient's fetch option
apps/chat/                    Reference chat app: Vite + React + shadcn (zinc dark), Supabase auth
                              (GitHub OAuth, email OTP, anonymous), sessions sidebar, markdown, attachments
apps/landing/                 Marketing site (Vite multi-page: / and /examples/) + VitePress docs at /docs/
  docs/.vitepress/config.ts   base "/docs/", outDir "../dist/docs" — docs build INTO the landing dist
  vercel.json                 host-based 308 redirect hermes-web.* → hermes-remote.* (pattern "/(.*)" + "$1")
integration/                  Integration suite, own workspace, coverage OFF. harness.ts picks the target:
                              local mode (default, boots a real server in-process over DemoAgent/DemoUpstream/
                              FakeCliBridge, runs in CI) or live mode (HERMES_INTEGRATION=1 + URL/TOKEN against
                              a real agent). See integration/README.md
scripts/check-snippets.ts     Bun.Transpiler parse-check of every ts/tsx fence in the docs (runs in CI)
assets/                       logo.svg, wordmark.svg, og.png (1200x630), announcement.md (X thread, unposted)
.github/workflows/test.yml    push/PR: install, build clients, typecheck, bun test packages (100% gate),
                              integration suite in local mode, snippets, example builds
.github/workflows/release.yml on v* tag: test, publish 4 packages to npm (registry.npmjs.org), tarballs on GH release
```

Directory names predate the rename (hermes-api/hermes-ts/react-hermes); the published npm names are the hermes-remote ones. Do not rename directories casually — imports, workspaces, and CI reference them.

## The security model (implemented, do not weaken)

* **Principals:** `api_key` (Bearer `hk_<id>.<secret>`, argon2-hashed secrets, minted only via CLI, never over HTTP), `user` (a JWT verified through the `AuthProvider` interface — Supabase or Clerk via their official SDKs as optional peer deps, or the zero-dep `jwt` provider for JWKS/HS256 issuers; selected by the `auth` section of config.json), `anonymous` (only if explicitly enabled). Unknown routes return 401 before 404 when unauthenticated (deliberate: don't leak the route map).
* **Scopes** are a closed catalog with four tiers; user tokens get tier 1 only and only their own sessions (`user_id` ownership enforced in ChatStore queries). There is **no admin scope** — administration is the host CLI only.
* **Identity injection:** every turn prepends a system message built by `identityTurn()` in `src/chat/routes.ts` (`<user-context>You are chatting through hermes-remote with <identity>...`). Only verified claims go in. This is how "the agent knows who it is speaking with" works end to end.
* The upstream `API_SERVER_KEY` lives only in server config; it must never reach responses, logs, or client bundles.
* Rate limiting is per principal (fixed window, `retry-after` on 429). Mutations and auth failures append JSONL to `~/.hermes-remote/audit.log`.

## The SSE protocol

`POST /v1/sessions/:id/messages` (and `PATCH .../messages/:mid` for edit+regenerate) stream `text/event-stream` with events: `user` (persisted user message echo), `assistant` (assistant message shell), `delta` (token chunk `{id, text}`), `done` (final message), `error`. `POST /v1/sessions/:id/stop` aborts the in-flight turn via an AbortController held in `options.turns` (a `Map` passed into `createApp`); the partial reply is kept and finished as `done`. The client's `sse.ts` and the server's `routes.ts` are the two ends — change them together, and exercise via the integration suite.

## Conventions (non-negotiable)

1. **100% line AND function coverage**, enforced by `bunfig.toml` `coverageThreshold = 1.0` and CI. `bun run test` = `bun test packages`. Every new feature ships with tests in the same commit. Side effects (fs, network, time, Bun.serve) go behind injectable seams — see how `CliContext`, `now`, `AgentBackend`, and `UserTokenVerifier` are injected. The docs page `internals/engineering.md` explains the approach.
2. **Two test tiers:** unit (no external deps, fakes for the agent) in `packages/*`; integration in `integration/` via `harness.ts`. Local mode (`bun run test:integration:local`, the default and what CI runs on every push/PR) boots a real hermes-remote in-process over the demo agent; live mode (`bun run test:integration` with `HERMES_INTEGRATION=1`, `HERMES_REMOTE_URL`, `HERMES_REMOTE_TOKEN`) targets a running server wired to a real Hermes agent and validates the CLI argv templates.
3. **Commits:** a few plain words, lowercase, no decoration, no "---", never a Co-Authored-By line. Examples in `git log`: "domain redirect", "jwks verification", "shadcn chat app".
4. **TypeScript strict everywhere; Bun everywhere** (`bun install`, `bun test`, `bun run`). Build clients before typecheck (`bun run --cwd packages/hermes-ts build`, same for react-hermes) — cross-package types resolve from `dist`.
5. **UI:** apps/chat is shadcn (zinc dark theme, Tailwind v4 via @tailwindcss/vite). apps/landing keeps the shadcn theme tokens and Tailwind but is deliberately minimal: prose, plain links, and unchromed code blocks instead of cards, buttons, and borders. Keep it that way.
6. `bun run typecheck` and `bun scripts/check-snippets.ts` must stay green; CI runs both.

## External infrastructure (accounts, projects, secrets)

* **GitHub:** repo `in-th3-l00p/hermes-remote` (renamed from hermes-web; old URL redirects). The machine's `gh` has TWO accounts and **keeps flipping to `catalin-george-tisca-fortech`** (work account) causing push 403s and publish failures. Before pushing or publishing: `gh auth switch --user in-th3-l00p`; for package publishes use `gh auth token --user in-th3-l00p` (token needs `write:packages`).
* **npm (npmjs.org):** all four packages are public on npm under the `@intheloop-studio` org (`registry.npmjs.org`): `@intheloop-studio/hermes-remote`, `-cli`, `-client`, `-react`. Consumers need no registry setup because the packages are public. The release workflow publishes automatically on `v*` tags using the `NPM_TOKEN` GitHub Actions secret (`npm publish --access public`); `publishConfig` in each package pins the registry and public access. Since the 2.0.0 split, the CLI ships as `@intheloop-studio/hermes-remote-cli` (`packages/cli`) and the server package has no bins. History: the packages were previously on GitHub Packages under the `@in-th3-l00p` scope; that scope and registry are retired.
* **Release process:** bump versions in the four package.json files (hermes-api and cli stay in lockstep; cli's dependency on `@intheloop-studio/hermes-remote` is a plain `^x.0.0` range, NOT `workspace:*`, because CI publishes with `npm publish` which does not rewrite workspace protocols — keep it in sync when bumping) → commit → `git tag vx.y.z` → push tag → `release.yml` tests, publishes, packs tarballs, creates/updates the GitHub release.
* **Vercel:** project `hermes-web` (team inth3loop), Root Directory `apps/landing` with source-files-outside-root enabled — **deploy from the repo root** (`bunx vercel deploy --prod`), never from apps/landing. Build: `bun run build` = build the six example apps → vite build → vitepress docs → copy example dists into `dist/examples/<name>/app/`. The deployment is fully static: there are no Vercel Functions, no rewrites, and no server-side env vars. Vercel's Bun (1.3.x) logs "Unknown lockfile version" for our 1.4 lockfile and resolves fresh — harmless today, hermetic once Vercel's Bun catches up. Domains: `hermes-remote.tiscacatalin.com` (primary) and `hermes-web.tiscacatalin.com` (308 redirect via vercel.json host rule). Wildcard DNS for tiscacatalin.com already points at Vercel.
* **Live examples:** `/examples/` grid index → per-example articles (`apps/landing/examples/articles/*.md`, rendered by `src/examples/article.tsx`, snippet-checked) and live apps (`apps/examples/<name>`, individual Vite projects, base `/examples/<name>/app/`). The apps are fully static demos: no server, no shared state. Each app's `src/lib/client.ts` calls `createDemoFetch()` from `packages/examples-demo` (`@intheloop-studio/hermes-remote-examples-demo`, in the 100% coverage gate) and passes it to `HermesClient` via the `fetch` option. The package is a browser-safe, in-memory fake of the hermes-remote routes the apps use — seeded sessions/runs/jobs/profiles/memory/soul/config, streaming chat over the real SSE protocol with canned replies, a working stop endpoint, and an event firehose — with mutable state per page load. The `hk_` token in the apps is a demo credential the fake fetch recognizes, not a real key. The auth example still verifies real Supabase sign-in in the browser; the fake backend decodes the JWT payload without signature verification (it guards nothing).
* **Supabase:** project `jhvuzxmhyyyovzgtdwvl` (eu-central-1). Signs tokens with **ES256** (JWKS at `https://jhvuzxmhyyyovzgtdwvl.supabase.co/auth/v1/.well-known/jwks.json`) — this is why `SupabaseJwksVerifier` exists; there is no shared HS256 secret for this project. Enabled: anonymous sign-ins, email OTP (built-in SMTP only — **needs custom SMTP before real production traffic**), GitHub OAuth (client `Ov23li7SAcVnYVbqn30n`; the secret passed through a chat session, so **rotating it is recommended**). Management API access worked via the CLI token in the macOS keychain (`security find-generic-password -l "Supabase CLI" -w`).
* **Local dev stack on this machine:** the Hermes agent runs under profile `indra` (`~/.hermes/profiles/indra/.env` holds its `API_SERVER_KEY`; gateway API on 127.0.0.1:8642). hermes-remote serves on **:8643**, chat app on **:5173** (`apps/chat/.env.local` has `VITE_HERMES_API_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`). Server state in `~/.hermes-remote/` (config.json, keys.json, chat.db, audit.log), overridable via `HERMES_REMOTE_HOME`.

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

457 unit tests, 100% line+function coverage, strict typecheck clean, 45 doc snippets parse-checked, integration suite 11/11 in local mode (in-process server over the demo agent; also runs in CI on every push and PR). The live-mode integration suite was last verified against the real stack before the harness rework (real streamed turn, persistence round trip, live stop cancellation, auth rejection with a real Supabase ES256 token); rerun it with HERMES_INTEGRATION=1 next time the agent is up. Identity verified end to end: the agent answered with the authenticated user's email and Supabase user id, and with the stable anonymous id for guests.

## Roadmap / open work

1. **Widen the API surface** toward ARCHITECTURE.md: CLI bridge and FS bridge, then memory, cron, skills, goals, hooks endpoints, each with scopes from the existing catalog, client methods, and hooks where UI-relevant. This is the big 1.x/2.0 arc.
2. Human launch steps (owner only): record the 30–45s demo, post `assets/announcement.md` on X, submit to Nous Research Discord showcase.
3. Security hygiene: rotate the GitHub OAuth client secret; configure custom SMTP in Supabase for email OTP.
4. Nice-to-haves noted during development: hosted DemoAgent deployment for a clickable public demo (decided against for 1.0 — needs a Bun host), deprecation stub releases for the pre-rename 0.x package names.
