# Hono migration and auth providers — design

Date: 2026-08-29
Status: approved

## Goal

Two coupled changes to `packages/hermes-api` (plus CLI and docs):

1. Rebuild the HTTP layer on **Hono** so cross-cutting concerns (CORS, body
   limits, rate limiting) come from maintained middleware instead of hand-rolled
   code.
2. Restructure end-user authentication into a **providers module** with three
   first-class providers — Supabase (official SDK), Clerk (official SDK), and a
   zero-dependency generic JWT provider — behind one small interface that also
   serves as the custom-provider contract. SDKs are optional peer dependencies,
   loaded only when the matching provider is enabled.

Plus new website documentation: an Authentication section with one guide per
provider and an end-to-end Clerk tutorial.

## Non-goals

- No changes to the wire protocol (SSE events, endpoint paths, error body
  shape `{error: {code, message}}`, status codes).
- No changes to `hermes-ts`, `react-hermes`, or `apps/chat` beyond what docs
  reference.
- No widening of the API surface (memory/cron/skills endpoints stay roadmap).

## Invariants that must survive (from HANDOFF.md)

- 401 before 404 for unauthenticated requests to unknown routes.
- Identity injection (`identityTurn`) untouched.
- Upstream `API_SERVER_KEY` never reaches responses, logs, or clients.
- Per-principal rate limiting with `retry-after` on 429.
- Auth-failure limiter keyed by client IP runs **before** argon2 verification.
- Audit JSONL for mutations and 401s.
- API keys minted only via CLI; user tokens grant tier 1 scopes only.
- 100% line and function coverage; unit tier has no network dependencies.

## Part 1 — HTTP layer on Hono

`createApp(options)` keeps its exact external contract: returns
`{ fetch(request, clientIp?) }`. Internally it builds a Hono app; the wrapper
passes `clientIp` through Hono's env (`app.fetch(request, { clientIp })`).
`startServer` and all call sites/tests keep working unchanged.

Middleware chain (order matters):

1. `hono/cors` — replaces `src/http/cors.ts`, applied when `corsOrigins` set.
2. Body cap — `hono/body-limit` with `limits.maxBodyBytes` (also covers
   chunked bodies; `Bun.serve` `maxRequestBodySize` stays as backstop).
   Must produce the existing 413 `payload_too_large` error body via a custom
   handler.
3. Auth-failure limiter — `hono-rate-limiter` keyed `ip:<clientIp>`,
   `skipSuccessfulRequests: true`, so only 401 responses consume the window.
   Runs before authentication. 429 body + `retry-after` preserved.
4. Authentication middleware — existing `authenticate()`; sets
   `c.set("principal", ...)`; on denial returns the mapped error response.
   Applied to every route except `GET /v1/status`.
5. Per-principal rate limiter — `hono-rate-limiter` with
   `keyGenerator: () => principalKey(principal)`, enabled only when
   `options.rateLimit` is set (same as today).
6. Audit — middleware that runs after the handler; same entry shape and same
   condition (non-GET or 401).

Routes registered on Hono: `GET /v1/status`, `GET /v1/auth/whoami`, and the
chat routes from `src/chat/routes/` (sessions CRUD, messages POST/PATCH,
reactions, stop, SSE). Chat handler internals (validation, store, SSE
streaming) keep their current signatures; only the dispatch layer changes from
manual URL matching to Hono route definitions. SSE handlers keep returning raw
`Response` objects with `ReadableStream` bodies (Hono passes them through).

`app.notFound` returns 404 `not_found` — the global auth middleware already
guarantees unauthenticated requests get 401 first.

Deleted: `src/http/cors.ts`, the `RateLimiter` class and its uses (the
`Limits` message/attachment constants and `ipInCidr` stay in `src/limits/`).

New dependencies (regular): `hono`, `hono-rate-limiter`.

## Part 2 — Auth providers module

New directory `packages/hermes-api/src/auth/providers/`:

- `types.ts` — the contract:

  ```ts
  interface VerifiedUser { sub: string; email?: string; isAnonymous?: boolean }
  interface AuthProvider {
    readonly name: string;
    verify(token: string): Promise<VerifiedUser | null>;
  }
  ```

  `AuthProvider` replaces `UserTokenVerifier`; `VerifiedUser` replaces
  `SupabaseUser` (field rename `is_anonymous` → `isAnonymous`). `authenticate()`
  and `AppOptions.userVerifier` re-type to `AuthProvider` (option renamed to
  `authProvider`).

- `jwt.ts` — zero-dependency generic verifier, refactored from today's
  `supabase.ts` code: configurable JWKS URL (ES256, kid cache with one refetch
  on unknown kid) or HS256 shared secret, optional issuer/audience checks,
  claim mapping defaults (`sub`, `email`, `is_anonymous`). This is the
  config-only custom-provider path.

- `supabase.ts` — thin preset using `@supabase/supabase-js`:
  `createClient(url, publishableKey).auth.getClaims(token)` (local JWKS
  verification, no network per request after key fetch). Maps claims to
  `VerifiedUser`.

- `clerk.ts` — uses `@clerk/backend`'s `verifyToken(token, { secretKey?,
  jwtKey? })`. Maps `sub` and email claim to `VerifiedUser`.

- `registry.ts` — `createAuthProvider(config, loadModule?)` where config is

  ```ts
  type AuthProviderConfig =
    | { provider: "supabase"; url: string; publishableKey: string }
    | { provider: "clerk"; secretKey?: string; jwtKey?: string }
    | { provider: "jwt"; jwksUrl?: string; hs256Secret?: string;
        issuer?: string; audience?: string }
    | { provider: "none" };
  ```

  `loadModule` is the injectable dynamic-import seam (defaults to
  `(name) => import(name)`); tests inject fakes, so unit tests never touch the
  real SDKs or the network. If a provider is enabled and its SDK is not
  installed, the error message names the exact package to install.

Packaging: `@supabase/supabase-js` and `@clerk/backend` are
`peerDependencies` marked optional in `peerDependenciesMeta`. They are also
`devDependencies` so typecheck and tests compile against real types.

Old exports (`SupabaseJwksVerifier`, `hs256Verifier`, `verifySupabaseJwt`,
`UserTokenVerifier`, `SupabaseUser`) are removed — major version bump to
3.0.0 for `@intheloop-studio/hermes-remote` and the CLI (lockstep).

## Part 3 — CLI

`ConfigFile` gains an `auth` section mirroring `AuthProviderConfig`. Legacy
fields `supabaseUrl`/`supabaseJwtSecret` (and their flags/env vars) keep
working, mapped to `{provider: "supabase"|"jwt"}` configs, with a deprecation
note in `--help` and docs. `serve.ts` resolves the auth config; `cli.ts` calls
`createAuthProvider` and passes the result to `startServer`.

## Part 4 — Documentation (apps/landing/docs)

Restructure the sidebar with an Authentication section:

- `auth/index.md` — concepts: principals, API keys vs user tokens, scopes,
  how a provider plugs in, the feature-flag/optional-peer-dep model.
- `auth/supabase.md` — SDK-based setup (updated from the current tutorial).
- `auth/clerk.md` — Clerk guide.
- `auth/custom.md` — the `jwt` config path and the implement-`AuthProvider`
  path (rewrites `tutorials/custom-auth.md`).
- `tutorials/clerk-auth.md` — end-to-end tutorial: create Clerk app → server
  config → React client with Clerk's `getToken()` as `tokenProvider` →
  verified identity visible to the agent.

Existing `tutorials/supabase-auth.md` and `tutorials/custom-auth.md` are
updated in place to match the new provider config and link to the new guides,
keeping their URLs alive. All code fences must pass `scripts/check-snippets.ts`.

## Testing

- TDD throughout; every step keeps `bun run test` green with 100% line and
  function coverage and strict typecheck clean.
- Hono app tested through `app.fetch(request, ip)` exactly as today —
  existing `app.test.ts` cases carry over nearly verbatim.
- Provider tests: fake SDK modules through the `loadModule` seam (Supabase
  fake exposes `createClient().auth.getClaims`; Clerk fake exposes
  `verifyToken`); jwt provider tests reuse the current supabase.test.ts token
  fixtures.
- Integration suite unchanged (live Supabase ES256 token test now exercises
  the Supabase provider path).

## Delivery

Step-by-step commits in dependency order: providers module first (auth
perfected and abstracted before the framework swap), then Hono migration,
then CLI wiring, then docs, then version bump. Plain lowercase commit
messages, no co-author lines.
