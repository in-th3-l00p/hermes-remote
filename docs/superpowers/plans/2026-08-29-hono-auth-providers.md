# Hono Migration + Auth Providers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild hermes-api's HTTP layer on Hono with library middleware, and restructure end-user auth into a providers module (Supabase SDK, Clerk SDK, zero-dep generic JWT) behind one `AuthProvider` interface, with website docs.

**Architecture:** Providers land first (`src/auth/providers/`), replacing `UserTokenVerifier`/`SupabaseUser` with `AuthProvider`/`VerifiedUser`; SDKs are optional peer deps loaded through an injectable `loadModule` seam. Then `createApp` is rebuilt as a Hono app (same `{fetch(request, clientIp?)}` contract, clientIp via Hono env), replacing hand-rolled CORS/body-cap/rate-limiting with `hono/cors`, `hono/body-limit`, and `hono-rate-limiter`. Chat routes become a mounted Hono sub-app. CLI gains an `auth` config section. Docs get an Authentication section plus a Clerk tutorial.

**Tech Stack:** Bun, TypeScript strict, Hono 4, hono-rate-limiter 0.5, @supabase/supabase-js 2 (optional peer), @clerk/backend 3 (optional peer), VitePress.

**Spec:** docs/superpowers/specs/2026-08-29-hono-auth-providers-design.md

## Global Constraints

- 100% line AND function coverage (`bunfig.toml` threshold 1.0); run `bun run test` from repo root.
- `bun run typecheck` and `bun scripts/check-snippets.ts` stay green.
- Wire protocol unchanged: error body `{error: {code, message}}`, SSE events, endpoint paths, status codes, `retry-after` on 429.
- Invariants: 401 before 404 on unknown unauthenticated routes; auth-failure IP limiter runs before argon2; identity injection untouched; upstream key never surfaces; audit on non-GET or 401.
- No code comments unless stating a non-obvious constraint. Commits: plain lowercase few words, no co-author line.
- Bun coverage pitfall: classes without constructors need explicit no-op constructors.

## Verified library facts (do not re-derive)

- `hono-rate-limiter`: `rateLimiter({windowMs, limit, keyGenerator, handler?, skipSuccessfulRequests?})`; sets `Retry-After` automatically on limited responses; custom `handler(c, next, options)` controls the 429 body.
- `hono/body-limit`: `bodyLimit({maxSize, onError})`; checks content-length and streamed size.
- Supabase: `createClient(url, key, {auth: {persistSession: false, autoRefreshToken: false}})`; `client.auth.getClaims(jwt)` → `{data: {claims: {sub, email?, is_anonymous?, ...}}, error}` — verifies locally via JWKS for asymmetric keys.
- Clerk: `import {verifyToken} from "@clerk/backend"`; `verifyToken(token, {secretKey?, jwtKey?, audience?, authorizedParties?})` → resolves payload (`sub`, custom claims) or **throws**.
- Hono: `app.fetch(request, env)` → `c.env`; regex path params `:id{[0-9a-f]+}`; sub-app via `app.route("/", sub)`; raw `Response` returns pass through.
- Dependencies already installed in `packages/hermes-api`: `hono`, `hono-rate-limiter` (deps), `@supabase/supabase-js`, `@clerk/backend` (devDeps).

## Route table (must be identical after migration)

| Method | Path | Scope |
|---|---|---|
| GET | /v1/status | none (public) |
| GET | /v1/auth/whoami | authenticated |
| POST | /v1/sessions | sessions:write |
| GET | /v1/sessions | sessions:read |
| DELETE | /v1/sessions/:id | sessions:write |
| POST | /v1/sessions/:id/stop | chat:invoke |
| GET | /v1/sessions/:id/messages | sessions:read |
| POST | /v1/sessions/:id/messages | chat:invoke (SSE) |
| PATCH | /v1/sessions/:id/messages/:mid | chat:invoke (SSE) |
| POST | /v1/sessions/:id/messages/:mid/reactions | sessions:write |

Session/message ids match `[0-9a-f]+`.

---

### Task 1: Provider contract + generic JWT provider

**Files:**
- Create: `packages/hermes-api/src/auth/providers/types.ts`
- Create: `packages/hermes-api/src/auth/providers/jwt.ts`
- Create: `packages/hermes-api/src/auth/providers/index.ts`
- Test: `packages/hermes-api/src/auth/providers/jwt.test.ts`

**Interfaces (Produces):**

```ts
export interface VerifiedUser {
  sub: string;
  email?: string;
  isAnonymous?: boolean;
}
export interface AuthProvider {
  readonly name: string;
  verify(token: string): Promise<VerifiedUser | null>;
}
export interface JwtProviderOptions {
  jwksUrl?: string;
  hs256Secret?: string;
  issuer?: string;
  audience?: string;
  fetch?: typeof fetch;
  now?: () => Date;
}
export class JwtAuthProvider implements AuthProvider {
  constructor(options: JwtProviderOptions);
}
```

`jwt.ts` is a refactor of the current `src/auth/supabase.ts`: keep `parseToken`, base64url decode, HS256 HMAC + `timingSafeEqual`, ES256 JWKS with kid cache and single refetch on unknown kid. Generalize `toUser` into claim validation: reject missing/expired `exp`, missing `sub`, and (when configured) mismatched `iss`/`aud` (aud may be string or array in the token). Map `email` and `is_anonymous` → `isAnonymous`. HS256 path used when `hs256Secret` set; JWKS path when `jwksUrl` set; a token whose `alg` doesn't match the configured mechanism returns null.

- [ ] Write `jwt.test.ts` first, porting fixtures from `supabase.test.ts` (HS256 token minting helper, fake fetch returning a JWKS with a real generated P-256 key, expiry/sub/alg/kid rejection cases) plus new issuer and audience accept/reject cases; run, expect failure.
- [ ] Implement `types.ts`, `jwt.ts`, `index.ts` re-exports; run `bun test packages/hermes-api/src/auth/providers` until green.
- [ ] Commit: `generic jwt auth provider`

### Task 2: Supabase provider (official SDK, optional)

**Files:**
- Create: `packages/hermes-api/src/auth/providers/supabase.ts`
- Test: `packages/hermes-api/src/auth/providers/supabase.test.ts`
- Modify: `packages/hermes-api/src/auth/providers/index.ts`

**Interfaces (Produces):**

```ts
export type ModuleLoader = (specifier: string) => Promise<unknown>;
export interface SupabaseProviderOptions {
  url: string;
  publishableKey: string;
  loadModule?: ModuleLoader;
}
export class SupabaseAuthProvider implements AuthProvider {
  readonly name = "supabase";
  constructor(options: SupabaseProviderOptions);
}
```

(`ModuleLoader` lives in `types.ts`.) Lazily imports `@supabase/supabase-js` on first `verify` via `loadModule` (default `(s) => import(s)`), creates one client with `{auth: {persistSession: false, autoRefreshToken: false}}`, then `auth.getClaims(token)`; `error` or missing claims → null; maps `sub`/`email`/`is_anonymous`. Import failure → error naming the package: `` `auth provider "supabase" requires the optional peer dependency @supabase/supabase-js` ``.

- [ ] Write tests with a fake module exposing `createClient` (assert url/key/options received; getClaims success, error object, thrown, missing-module cases); run, expect failure.
- [ ] Implement; green.
- [ ] Commit: `supabase auth provider`

### Task 3: Clerk provider (official SDK, optional)

**Files:**
- Create: `packages/hermes-api/src/auth/providers/clerk.ts`
- Test: `packages/hermes-api/src/auth/providers/clerk.test.ts`
- Modify: `packages/hermes-api/src/auth/providers/index.ts`

**Interfaces (Produces):**

```ts
export interface ClerkProviderOptions {
  secretKey?: string;
  jwtKey?: string;
  audience?: string;
  authorizedParties?: string[];
  loadModule?: ModuleLoader;
}
export class ClerkAuthProvider implements AuthProvider {
  readonly name = "clerk";
  constructor(options: ClerkProviderOptions);
}
```

Lazily imports `@clerk/backend`, calls `verifyToken(token, options)`; a throw → null; payload with string `sub` maps to `VerifiedUser` (email from `email` claim when a non-empty string — Clerk session tokens carry it only when the instance customizes session claims; the docs task explains this). Missing module → error naming `@clerk/backend`.

- [ ] Write tests with fake module exposing `verifyToken` (assert token/options passthrough; success with/without email; throw → null; missing module); run, expect failure.
- [ ] Implement; green.
- [ ] Commit: `clerk auth provider`

### Task 4: Provider registry

**Files:**
- Create: `packages/hermes-api/src/auth/providers/registry.ts`
- Test: `packages/hermes-api/src/auth/providers/registry.test.ts`
- Modify: `packages/hermes-api/src/auth/providers/index.ts`

**Interfaces (Produces):**

```ts
export type AuthProviderConfig =
  | { provider: "supabase"; url: string; publishableKey: string }
  | { provider: "clerk"; secretKey?: string; jwtKey?: string;
      audience?: string; authorizedParties?: string[] }
  | { provider: "jwt"; jwksUrl?: string; hs256Secret?: string;
      issuer?: string; audience?: string }
  | { provider: "none" };
export function createAuthProvider(
  config: AuthProviderConfig,
  loadModule?: ModuleLoader,
): AuthProvider | null;
```

`"none"` → null. Exhaustive switch, no default-case dead code.

- [ ] Write tests (each variant returns the right class/name; loader threaded through — verify by resolving a fake supabase module; `none` → null; also cover the real default loader by constructing the supabase provider with real installed devDep and calling `verify` is NOT needed — instead assert `createClient` ran: construct via registry without `loadModule`, call `verify("x")` with a stub… network risk — no: cover the default loader in supabase.test.ts instead by verifying a token against the real SDK client created with a fake URL fails closed to null via getClaims error). Run, expect failure.
- [ ] Implement; green. Verify coverage of the default `loadModule` line.
- [ ] Commit: `auth provider registry`

### Task 5: Rewire core to AuthProvider, delete legacy verifiers

**Files:**
- Modify: `packages/hermes-api/src/auth/principal.ts` (type `AuthProvider` for `userVerifier` → rename option to `authProvider`)
- Delete: `packages/hermes-api/src/auth/supabase.ts`, `packages/hermes-api/src/auth/supabase.test.ts`
- Modify: `packages/hermes-api/src/auth/index.ts`, `packages/hermes-api/src/http/app.ts`, `packages/hermes-api/src/http/whoami.ts` (if it reads user fields), `packages/hermes-api/src/index.ts`, `packages/cli/src/cli.ts`, `packages/hermes-api/package.json`
- Test: existing `app.test.ts`, `server.test.ts`, cli tests — update fakes from `UserTokenVerifier` to `AuthProvider`

**Interfaces (Produces):** `AuthenticateOptions.authProvider?: AuthProvider`; `AppOptions.authProvider?: AuthProvider` (replaces `userVerifier`). Package exports: everything from `auth/providers`. `package.json` gains `peerDependencies` `{"@supabase/supabase-js": "^2", "@clerk/backend": "^3"}` with both optional in `peerDependenciesMeta`; SDKs stay in devDependencies.

`cli.ts` interim wiring: `supabaseUrl` → `new JwtAuthProvider({jwksUrl: url + "/auth/v1/.well-known/jwks.json"})`? No — use `createAuthProvider({provider: "jwt", ...})` equivalents so behavior is identical to today (JWKS ES256 / HS256); the SDK-based CLI wiring arrives in Task 8.

- [ ] Update tests first (rename fakes, drop supabase.test.ts, keep every behavioral case by pointing it at `JwtAuthProvider`); run, expect type/test failures.
- [ ] Rewire, delete legacy file; `bun run test` + `bun run typecheck` green at 100%.
- [ ] Commit: `auth provider interface everywhere`

### Task 6: Hono app

**Files:**
- Modify: `packages/hermes-api/src/http/app.ts` (rebuild on Hono)
- Create: `packages/hermes-api/src/http/middleware.ts` (auth middleware, audit middleware, error/429/413 body helpers)
- Create: `packages/hermes-api/src/chat/routes/register.ts` (`chatRoutes(options, limits): Hono<AppEnv>`)
- Delete: `packages/hermes-api/src/http/cors.ts` (+ its tests), `handleChatRoute` dispatchers in `src/chat/routes/index.ts`, `sessions.ts`/`messages.ts` manual matching (converted to Hono handlers), `RateLimiter` class + `peek`/`check` tests in `src/limits/`
- Modify: `packages/hermes-api/src/limits/index.ts` (keep `Limits`, `DEFAULT_LIMITS`, `ipInCidr`; drop `RateLimiter`, keep `RateLimitOptions {limit, windowSeconds}` as the public config shape)
- Test: `app.test.ts` carries over; add cases for streamed-body 413 and rate-limit headers if behavior differs

**Interfaces (Produces):**

```ts
type AppEnv = {
  Bindings: { clientIp?: string };
  Variables: { principal: Principal };
};
```

`createApp` wrapper: `{ fetch: (request, clientIp) => hono.fetch(request, { clientIp }) }`.

Middleware order: cors (when configured) → status route → body limit → auth-failure limiter (`keyGenerator: c => "ip:" + (c.env.clientIp ?? "unknown")`, `skipSuccessfulRequests: true`, limit/window from `authFailureLimit` option, default 30/60s, handler emits `rate_limited` body) → auth middleware (`authenticate()`, sets principal or returns denial; counts as failure for the previous limiter via its 401 status) → per-principal limiter (only when `options.rateLimit` set; `keyGenerator: c => principalKey(c.get("principal"))`) → routes → notFound 404 → audit middleware (outermost, wraps everything so it sees final status).

Keep `authenticate()` signature; `whoamiBody` unchanged. SSE handlers return the `Response` from `streamTurn` directly.

- [ ] Port route handlers to `register.ts` as Hono handlers (scope check, access check, body parse, same error codes), one route per handler, reusing `shared.ts` helpers.
- [ ] Rebuild `app.ts`; keep `AppOptions` fields (minus `userVerifier`, plus `authProvider` from Task 5).
- [ ] Run full suite; fix until green at 100% (delete dead cors/limiter tests, add coverage for middleware branches: no-cors mode, anonymous mode, 413 stream, 429 both limiters, 401-before-404).
- [ ] `git rm` deleted files; commit: `http layer on hono`

### Task 7: startServer + integration parity check

**Files:**
- Modify: `packages/hermes-api/src/http/server.ts` (only if `AppOptions` shape changed), `server.test.ts`

- [ ] Run `bun run test`, `bun run typecheck`, build clients (`bun run --cwd packages/hermes-ts build`, `bun run --cwd packages/react-hermes build`) to confirm cross-package types.
- [ ] Commit if changes: `server wiring`

### Task 8: CLI auth config

**Files:**
- Modify: `packages/cli/src/config.ts` (`auth?: AuthProviderConfig`; keep legacy `supabaseUrl`/`supabaseJwtSecret`)
- Modify: `packages/cli/src/commands/serve.ts` (resolve auth config: explicit `auth` section wins; legacy fields/flags/env map to `{provider:"jwt", jwksUrl}` / `{provider:"jwt", hs256Secret}`; pass `AuthProviderConfig` through `ServeRequest`)
- Modify: `packages/cli/src/context.ts` (`ServeRequest.auth: AuthProviderConfig | null` replaces `supabaseUrl`/`supabaseJwtSecret`)
- Modify: `packages/cli/src/cli.ts` (`createAuthProvider(request.auth ?? {provider:"none"})` → `authProvider` option)
- Modify: `packages/cli/src/commands/init.ts` and USAGE text if they mention supabase flags
- Test: `packages/cli/src/commands/serve.test.ts` (or wherever serve is covered)

- [ ] Tests first: `auth.provider: "clerk"` config reaches `ctx.serve` as-is; legacy `supabaseUrl` maps to jwt/jwks config; flag/env precedence preserved.
- [ ] Implement; full suite green.
- [ ] Commit: `cli auth provider config`

### Task 9: Docs + tutorial

**Files:**
- Create: `apps/landing/docs/auth/index.md`, `auth/supabase.md`, `auth/clerk.md`, `auth/custom.md`
- Create: `apps/landing/docs/tutorials/clerk-auth.md`
- Modify: `apps/landing/docs/.vitepress/config.ts` (new "Authentication" sidebar section between Projects and Tutorials; renumber)
- Modify: `apps/landing/docs/tutorials/supabase-auth.md`, `tutorials/custom-auth.md` (update to provider config, link new guides)
- Modify: `apps/landing/docs/projects/server.md` if it documents the old flags

Content requirements: every config example matches `AuthProviderConfig` exactly; Clerk guide covers secretKey vs jwtKey (networkless), session-claim customization for email; custom guide shows both the `jwt` config path and a full `AuthProvider` implementation snippet; tutorial walks Clerk app → `~/.hermes-remote/config.json` → React `tokenProvider: () => getToken()` → whoami/identity verification. All fences pass `bun scripts/check-snippets.ts`.

- [ ] Write pages; run snippets check and `bun run --cwd apps/landing docs:build` (or the existing docs build script) to verify.
- [ ] Commit: `auth provider docs`

### Task 10: Version bump + records

**Files:**
- Modify: `packages/hermes-api/package.json`, `packages/cli/package.json` (3.0.0, cli dep range `^3.0.0`), `packages/hermes-ts/package.json`, `packages/react-hermes/package.json` only if convention requires lockstep (check HANDOFF: hermes-api and cli lockstep; clients independent — leave clients)
- Modify: `CHANGELOG.md`, `HANDOFF.md` (repo map: providers dir, hono; design-vs-reality note about the router no longer hand-rolled)

- [ ] Update, run full verification: `bun run test` (100%), `bun run typecheck`, snippets, client builds.
- [ ] Commit: `3.0.0 hono and auth providers`

*(Tag/publish is a separate user decision — do not tag.)*

## Self-review notes

- Spec coverage: Part 1 → Tasks 6–7; Part 2 → Tasks 1–5; Part 3 → Task 8; Part 4 → Task 9; versioning → Task 10. ✔
- Default-loader coverage strategy lives in Task 2/4 test notes. ✔
- Names used consistently: `AuthProvider`, `VerifiedUser`, `JwtAuthProvider`, `SupabaseAuthProvider`, `ClerkAuthProvider`, `createAuthProvider`, `AuthProviderConfig`, `ModuleLoader`, `authProvider` option, `AppEnv`. ✔
