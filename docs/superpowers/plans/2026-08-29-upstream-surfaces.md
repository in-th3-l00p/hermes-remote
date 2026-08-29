# Upstream Surfaces Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Abstract the upstream Hermes agent behind an `Upstream` interface family and expose discovery, runs, and jobs through server routes, client namespaces (plus a conversation handle), and React hooks.

**Architecture:** New `src/upstream/` module (deps: chat → upstream → http) with `HermesUpstream` (live) and `DemoUpstream` (offline) implementing `{chat, discovery, runs, jobs}`. Routes mount as a Hono sub-app gated on `AppOptions.upstream`; run ownership lives in a `RunStore` SQLite table; identity injection reuses `identityTurn`. Client adds `discovery`/`runs`/`jobs` namespaces and `conversation()`; react-hermes adds `useAgentInfo`, `useRuns`, `useRunEvents`.

**Tech Stack:** Bun, TypeScript strict, Hono 4, bun:sqlite, existing SSE parser in hermes-ts.

**Spec:** docs/superpowers/specs/2026-08-29-upstream-surfaces-design.md

## Global Constraints

- 100% line AND function coverage; `bun run test`, `bun run typecheck`, `bun scripts/check-snippets.ts` green; build clients before typecheck.
- Additive only — no breaking changes to existing exports or wire behavior. Version 3.1.0 at the end.
- Scopes from the existing catalog only: `status:read`, `skills:read`, `toolsets:read`, `chat:invoke`, `crons:read`, `crons:write`.
- Upstream bearer key never in responses or logs. Upstream failures → 502 `upstream_error` (+ `upstreamStatus`).
- Runs: users own their runs (`principalKey`), api_key principals see all, unknown/unowned → 404 `run_not_found`. User/anonymous run input gets the `identityTurn` preamble.
- No comments except non-obvious constraints; plain lowercase commits, no co-author.
- Bun coverage: explicit no-op constructors for constructor-less classes.

## Verified facts

- Upstream endpoints: `/health`, `/health/detailed`, `/v1/models`, `/api/model/options`, `/v1/capabilities`, `/v1/skills`, `/v1/toolsets`, `POST /v1/runs` (requires `input`; string or message array), `GET /v1/runs/{id}`, `GET /v1/runs/{id}/events` (SSE), `POST /v1/runs/{id}/approval|steer|stop`, `GET /api/jobs` (+ gated mutations `POST /api/jobs`, `PATCH|DELETE /api/jobs/{id}`, `POST /api/jobs/{id}/pause|resume|run`).
- `identityTurn(principal): AgentTurnMessage` exists in `src/chat/identity.ts`.
- `HttpClient` (hermes-ts) exposes `request<T>(method, path, body?)` and `stream(method, path, body, signal?) → AsyncIterable<SseEvent>` where `SseEvent = { event: string; data: unknown }`; `HermesClient.request` is public.
- `ChatEnv = { Bindings: { clientIp? }, Variables: { principal } }` from `src/chat/routes/shared.ts`; chat routes helpers `json/error/requireScope` reusable.
- `randomId()` and `Database` usage in `src/chat/store/db.ts`; ChatStore takes a path (`:memory:` in tests).

---

### Task 1: Upstream contracts + DemoUpstream

**Files:**
- Create: `packages/hermes-api/src/upstream/types.ts`
- Create: `packages/hermes-api/src/upstream/demo.ts`
- Create: `packages/hermes-api/src/upstream/index.ts`
- Test: `packages/hermes-api/src/upstream/demo.test.ts`

**Interfaces (Produces):**

```ts
// types.ts
import type { AgentBackend } from "../chat/index.ts";
export interface UpstreamDiscovery {
  health(): Promise<unknown>;
  capabilities(): Promise<unknown>;
  models(): Promise<unknown>;
  modelOptions(): Promise<unknown>;
  skills(): Promise<unknown>;
  toolsets(): Promise<unknown>;
}
export interface UpstreamRuns {
  create(body: Record<string, unknown>): Promise<unknown>;
  get(id: string): Promise<unknown>;
  events(id: string, signal?: AbortSignal): Promise<ReadableStream<Uint8Array>>;
  stop(id: string): Promise<unknown>;
  steer(id: string, body: unknown): Promise<unknown>;
  approve(id: string, body: unknown): Promise<unknown>;
}
export interface UpstreamJobs {
  list(): Promise<unknown>;
  get(id: string): Promise<unknown>;
  create(body: unknown): Promise<unknown>;
  update(id: string, body: unknown): Promise<unknown>;
  remove(id: string): Promise<unknown>;
  pause(id: string): Promise<unknown>;
  resume(id: string): Promise<unknown>;
  trigger(id: string): Promise<unknown>;
}
export interface Upstream {
  chat: AgentBackend;
  discovery: UpstreamDiscovery;
  runs: UpstreamRuns;
  jobs: UpstreamJobs;
}
```

`DemoUpstream implements Upstream`: `chat = new DemoAgent()`; discovery returns fixtures (`health` → `{status:"ok", platform:"demo"}`, `capabilities` → `{object:"demo.capabilities", features:{...}}`, `models` → `{object:"list", data:[{id:"demo", object:"model"}]}`, `modelOptions` → `{options:[]}`, `skills`/`toolsets` → `{object:"list", data:[]}`); runs is an in-memory map (`create` assigns `run_<n>` ids, status "completed", echoes input; `get` throws `HermesUpstreamError(404,...)` for unknown; `events` returns a `ReadableStream` emitting 3 SSE frames then closing; `stop/steer/approve` update/echo); jobs is an in-memory CRUD keyed `job_<n>` with `paused` flag and `trigger` appending to a `runs` count. Unknown job ids throw `HermesUpstreamError(404, ...)`.

- [ ] Write `demo.test.ts` covering every method incl. unknown-id throws and reading the events stream to completion; run (fails).
- [ ] Implement `types.ts`, `demo.ts`, `index.ts` (re-export types + DemoUpstream); green, 100% on module.
- [ ] Commit: `upstream contracts and demo upstream`

### Task 2: HermesUpstream

**Files:**
- Create: `packages/hermes-api/src/upstream/hermes.ts`
- Modify: `packages/hermes-api/src/upstream/index.ts`
- Test: `packages/hermes-api/src/upstream/hermes.test.ts`

**Interfaces (Produces):**

```ts
export interface HermesUpstreamOptions {
  baseUrl: string;
  apiKey: string;
  model?: string;
  fetch?: typeof fetch;
}
export class HermesUpstream implements Upstream { constructor(options: HermesUpstreamOptions); }
```

`chat = new HermesAgent(options)`. Private `request(method, path, body?)`: bearer header, JSON body, parse JSON; `!res.ok` → `throw new HermesUpstreamError(res.status, ...)` with the upstream error message when parseable. Endpoint mapping: health → `/health/detailed` falling back to `/health` on failure of `/health/detailed`; capabilities → `/v1/capabilities`; models → `/v1/models`; modelOptions → `/api/model/options`; skills → `/v1/skills`; toolsets → `/v1/toolsets`; runs.create → `POST /v1/runs`; runs.get → `GET /v1/runs/{id}`; runs.events → `GET /v1/runs/{id}/events` returning `res.body` (throw `HermesUpstreamError` when not ok or body null); stop/steer/approve → `POST /v1/runs/{id}/stop|steer|approval`; jobs → `/api/jobs...` per the verified facts.

- [ ] Tests with a fake fetch asserting method/path/headers/body per call, error mapping (non-ok, unparseable body), health fallback, events stream passthrough; run (fails).
- [ ] Implement; green, 100%.
- [ ] Commit: `hermes upstream client`

### Task 3: RunStore

**Files:**
- Create: `packages/hermes-api/src/upstream/run-store.ts`
- Modify: `packages/hermes-api/src/upstream/index.ts`
- Test: `packages/hermes-api/src/upstream/run-store.test.ts`

**Interfaces (Produces):**

```ts
export interface RunRecord { id: string; principal: string; createdAt: string; }
export class RunStore {
  constructor(path?: string, now?: () => Date);   // default ":memory:"
  record(id: string, principal: string): RunRecord;
  get(id: string): RunRecord | null;
  list(principal: string | null): RunRecord[];    // null → all (api_key view), newest first
}
```

Table: `runs (id TEXT PRIMARY KEY, principal TEXT NOT NULL, created_at TEXT NOT NULL)`, `CREATE TABLE IF NOT EXISTS`, mkdir of dirname like chat db.

- [ ] Tests: record/get/list filtering + ordering + persistence across two instances on one temp file; run (fails).
- [ ] Implement; green, 100%.
- [ ] Commit: `run ownership store`

### Task 4: Server routes (discovery, runs, jobs)

**Files:**
- Create: `packages/hermes-api/src/upstream/routes/discovery.ts`
- Create: `packages/hermes-api/src/upstream/routes/runs.ts`
- Create: `packages/hermes-api/src/upstream/routes/jobs.ts`
- Create: `packages/hermes-api/src/upstream/routes/index.ts` (`upstreamRoutes(options): Hono<ChatEnv>`)
- Create: `packages/hermes-api/src/upstream/identity.ts` (`injectRunIdentity`)
- Modify: `packages/hermes-api/src/http/app.ts` (`AppOptions.upstream?: UpstreamOptions`; mount)
- Modify: `packages/hermes-api/src/index.ts` (exports)
- Test: `packages/hermes-api/src/upstream/routes/routes.test.ts` (through `createApp` + `DemoUpstream`)

**Interfaces (Produces):**

```ts
// routes/index.ts
export interface UpstreamRouteOptions {
  upstream: Upstream;
  runStore: RunStore;
  version: string;
  authProviderName?: string;   // from AppOptions.authProvider?.name
  anonymous: boolean;
}
export function upstreamRoutes(options: UpstreamRouteOptions): Hono<ChatEnv>;
// app.ts
export interface AppOptions { /* existing */ upstream?: { upstream: Upstream; runStore?: RunStore }; }
// identity.ts
export function injectRunIdentity(body: Record<string, unknown>, principal: Principal): Record<string, unknown>;
```

Route table (scopes via `requireScope`):

| Route | Scope | Handler behavior |
|---|---|---|
| `GET /v1/health` | `status:read` | `{ status, version, upstream }`; upstream health awaited with `.catch` → `status: "unreachable"`, `upstream: null`; else status from `upstream.status` string when present, defaulting `"ok"` |
| `GET /v1/capabilities` | `status:read` | `{ object: "hermes-remote.capabilities", version, auth: { provider: authProviderName ?? null }, anonymous, features: { chat: true, runs: true, jobs: true, discovery: true }, upstream }` (upstream capabilities, `.catch(() => null)`) |
| `GET /v1/models` | `status:read` | proxy `discovery.models()` |
| `GET /v1/models/options` | `status:read` | proxy `discovery.modelOptions()` |
| `GET /v1/skills` | `skills:read` | proxy |
| `GET /v1/toolsets` | `toolsets:read` | proxy |
| `POST /v1/runs` | `chat:invoke` | JSON body (400 `invalid_run` if not an object); api_key → passthrough, else `injectRunIdentity`; `runs.create`; record `id` from result (string `id` or `run_id` field — 502 if neither); return 201 with upstream body |
| `GET /v1/runs` | `chat:invoke` | `runStore.list(principal.type === "api_key" ? null : principalKey(principal))` → `{ runs }` |
| `GET /v1/runs/:id` | `chat:invoke` | `ownRun` guard → proxy `runs.get` |
| `GET /v1/runs/:id/events` | `chat:invoke` | guard → `runs.events(id, c.req.raw.signal)` → `new Response(stream, { headers: { "content-type": "text/event-stream" } })` |
| `POST /v1/runs/:id/stop` | `chat:invoke` | guard → proxy |
| `POST /v1/runs/:id/steer` | `chat:invoke` | guard → proxy with JSON body |
| `POST /v1/runs/:id/approval` | `chat:invoke` | guard → proxy with JSON body |
| `GET /v1/jobs` | `crons:read` | api_key-only (`requirePrincipalType`) → proxy `jobs.list()` |
| `GET /v1/jobs/:id` | `crons:read` | same → `jobs.get` |
| `POST /v1/jobs` | `crons:write` | same → `jobs.create` |
| `PATCH /v1/jobs/:id` | `crons:write` | same → `jobs.update` |
| `DELETE /v1/jobs/:id` | `crons:write` | same → `jobs.remove` |
| `POST /v1/jobs/:id/pause` / `resume` / `run` | `crons:write` | same → `pause/resume/trigger` |

Shared helpers in `routes/index.ts` (or a `shared.ts` there): `proxy(c, fn)` wrapping `try { json(200, await fn()) } catch (HermesUpstreamError e) { 502 upstream_error with upstreamStatus }`; `ownRun(c, runStore)` → `RunRecord | Response(404 run_not_found)` (api_key sees all via `runStore.get` only); jobs guard: non-api_key principals get 403 `missing_scope`-style `api_key_required` error. `injectRunIdentity`: `input` string → `` `${identityTurn(principal).content}\n\n${input}` ``; `input` array → `[{ role: "system", content: identityTurn(principal).content }, ...input]`; other/missing input → returned unchanged (upstream will 400).

`app.ts`: when `options.upstream` set, build `runStore = options.upstream.runStore ?? new RunStore()` and `app.route("/", upstreamRoutes({ upstream, runStore, version, authProviderName: options.authProvider?.name, anonymous: options.anonymous === true }))` — mounted after auth middleware, before chat routes.

- [ ] Tests through `createApp({ anonymous: true, upstream: { upstream: new DemoUpstream() } })` plus api-key app for jobs/scopes: every route, ownership 404 across principals, identity injection visible in demo run echo, SSE passthrough read to completion, 502 mapping (upstream that throws), scope denials (key without scope → 403), jobs as user → 403, `POST /v1/runs` with non-object body → 400. Run (fails).
- [ ] Implement; full suite green at 100%.
- [ ] Commit: `discovery runs and jobs routes`

### Task 5: CLI wiring

**Files:**
- Modify: `packages/cli/src/cli.ts` (build `HermesUpstream`/`DemoUpstream` once; pass `chat.agent = upstream.chat` and `upstream: { upstream, runStore: new RunStore(join(homeDir, "chat.db")) }`)
- Modify: `packages/cli/src/context.ts` only if `ServeRequest` needs nothing new (it doesn't — upstream config already flows via `request.upstream`)
- Test: existing cli tests keep passing (no new flags)

- [ ] Update `cli.ts`; run full suite + typecheck; green.
- [ ] Commit: `cli upstream wiring`

### Task 6: Client namespaces + conversation handle

**Files:**
- Create: `packages/hermes-ts/src/discovery.ts`, `packages/hermes-ts/src/runs.ts`, `packages/hermes-ts/src/jobs.ts`, `packages/hermes-ts/src/conversation.ts`
- Modify: `packages/hermes-ts/src/client.ts` (instantiate namespaces, `conversation()` factory), `packages/hermes-ts/src/index.ts`
- Test: `packages/hermes-ts/src/resources.test.ts`, `packages/hermes-ts/src/conversation.test.ts`

**Interfaces (Produces):**

```ts
export class DiscoveryResource {
  constructor(http: HttpClient);
  health<T = unknown>(): Promise<T>;            // GET /v1/health
  capabilities<T = unknown>(): Promise<T>;      // GET /v1/capabilities
  models<T = unknown>(): Promise<T>;            // GET /v1/models
  modelOptions<T = unknown>(): Promise<T>;      // GET /v1/models/options
  skills<T = unknown>(): Promise<T>;            // GET /v1/skills
  toolsets<T = unknown>(): Promise<T>;          // GET /v1/toolsets
}
export interface RunRef { id: string; principal?: string; createdAt?: string; }
export class RunsResource {
  constructor(http: HttpClient);
  create<T = unknown>(body: Record<string, unknown>): Promise<T>;
  list(): Promise<RunRef[]>;                    // unwraps { runs }
  get<T = unknown>(id: string): Promise<T>;
  events(id: string, signal?: AbortSignal): AsyncIterable<SseEvent>;  // GET stream
  stop<T = unknown>(id: string): Promise<T>;
  steer<T = unknown>(id: string, body: unknown): Promise<T>;
  approve<T = unknown>(id: string, body: unknown): Promise<T>;
}
export class JobsResource { /* list/get/create/update/remove/pause/resume/trigger, same pattern */ }
export class Conversation {
  readonly client: HermesClient;
  get id(): string | null;
  constructor(client: HermesClient, sessionId?: string);
  send(content: string, options?: { attachments?: Attachment[]; signal?: AbortSignal }): AsyncIterable<ChatEvent>; // creates session on first send
  edit(messageId: string, content: string, options?: { signal?: AbortSignal }): AsyncIterable<ChatEvent>;
  stop(): Promise<{ stopped: boolean }>;        // throws if no session yet
  react(messageId: string, emoji: string): Promise<ChatMessage>;
  messages(): Promise<ChatMessage[]>;
  remove(): Promise<void>;
}
// HermesClient additions
readonly discovery: DiscoveryResource;
readonly runs: RunsResource;
readonly jobs: JobsResource;
conversation(sessionId?: string): Conversation;
```

`Conversation.send` when `id === null`: `await client.createSession()` first, then delegate to `client.sendMessage` (async generator wrapping). Methods called before a session exists (`stop/edit/react/messages/remove`) throw `new Error("conversation has no session yet")`. `HttpClient.stream` needs `body?` to support GET streams — pass `undefined` body from `runs.events` (verify `doFetch` already tolerates undefined body: it does).

- [ ] Tests with fake fetch: every namespace method's method/path/body, `runs.events` SSE iteration, conversation lazy-create flow + all delegations + pre-session throws. Run (fails).
- [ ] Implement; green, 100%; `bun run --cwd packages/hermes-ts build`.
- [ ] Commit: `client discovery runs jobs and conversation handle`

### Task 7: React hooks

**Files:**
- Create: `packages/react-hermes/src/use-agent-info.ts`, `packages/react-hermes/src/use-runs.ts`
- Modify: `packages/react-hermes/src/index.ts`
- Test: `packages/react-hermes/src/use-agent-info.test.tsx`, `packages/react-hermes/src/use-runs.test.tsx` (happy-dom + GlobalRegistrator.unregister in afterAll, matching existing hook tests)

**Interfaces (Produces):**

```ts
export interface UseAgentInfo { health: unknown; capabilities: unknown; models: unknown; loading: boolean; error: Error | null; refresh(): Promise<void>; }
export function useAgentInfo(options: { client: HermesClient }): UseAgentInfo;
export interface UseRuns { runs: RunRef[]; loading: boolean; error: Error | null; create(body: Record<string, unknown>): Promise<unknown>; refresh(): Promise<void>; }
export function useRuns(options: { client: HermesClient }): UseRuns;
export interface UseRunEvents { events: SseEvent[]; done: boolean; error: Error | null; }
export function useRunEvents(options: { client: HermesClient; runId: string | null }): UseRunEvents;
```

`useAgentInfo`: `Promise.all` of the three discovery calls in a `refresh` callback, run on mount; error captures. `useRuns`: list on mount; `create` posts then refreshes. `useRunEvents`: effect keyed on `runId`; `AbortController` per subscription aborted on cleanup; `runId: null` → idle. All follow the `use-sessions.ts` state/callback conventions.

- [ ] Tests with a stub client object (typed via the hooks' structural needs); run (fails).
- [ ] Implement; green, 100%; build react-hermes.
- [ ] Commit: `agent info and runs hooks`

### Task 8: Docs + version 3.1.0

**Files:**
- Modify: `apps/landing/docs/projects/server.md` (routes + scopes tables gain discovery/runs/jobs; note runs ownership + identity injection)
- Modify: `apps/landing/docs/projects/client.md` (namespaces, conversation handle, runs.events example)
- Modify: `apps/landing/docs/projects/react.md` (new hooks)
- Modify: `packages/hermes-api/package.json`, `packages/cli/package.json` (3.1.0, dep `^3.1.0`), `packages/hermes-ts/package.json`, `packages/react-hermes/package.json` (3.1.0 — check current client versions first and bump minor from whatever they are)
- Modify: `CHANGELOG.md` (3.1.0 section), `HANDOFF.md` (repo map: upstream module; design-vs-reality paragraph: discovery/runs/jobs now bridged)

- [ ] Update docs; `bun scripts/check-snippets.ts` and `cd apps/landing && bun run build` green.
- [ ] Bump versions, changelog, handoff; full verification (`bun run test`, `bun run typecheck`, snippets, client builds).
- [ ] Commit: `upstream surfaces docs and 3.1.0`

## Self-review notes

- Spec coverage: Part 1 → Tasks 1–2; run store → Task 3; Part 2 → Task 4 (+ CLI Task 5); Part 3 → Task 6; Part 4 → Task 7; testing/docs/version → per-task + Task 8. Integration additions folded into Task 8 verification? — spec asks for gated live checks: add to Task 8 as a step. ✔ (added below)
- Task 8 extra step: add `integration/` gated tests for health/capabilities/models via live stack.
- Names consistent: `Upstream`, `UpstreamDiscovery/Runs/Jobs`, `DemoUpstream`, `HermesUpstream`, `RunStore`, `RunRecord`, `upstreamRoutes`, `injectRunIdentity`, `DiscoveryResource`, `RunsResource`, `JobsResource`, `Conversation`, `useAgentInfo`, `useRuns`, `useRunEvents`. ✔
