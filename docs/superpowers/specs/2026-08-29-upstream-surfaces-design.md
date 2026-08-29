# Upstream abstraction and discovery/runs/jobs surfaces — design

Date: 2026-08-29
Status: approved

## Goal

Widen hermes-remote toward the upstream agent's real API (probed live,
hermes-agent v0.20.4): abstract the upstream behind capability-shaped
interfaces, and expose discovery (health, capabilities, models, skills,
toolsets), runs (long agent tasks), and jobs (cron administration) through the
server, the typed client, and React hooks.

## Decisions already made

- Access policy: runs are available to API keys and signed-in users (with
  per-principal ownership and identity injection); jobs are API-key-only
  behind tier-2 `crons:read`/`crons:write`. Scope catalog is unchanged.
- Upstream `/api/sessions/*` (server-side session chat) is a non-goal — the
  existing chat layer is that surface.
- Version 3.1.0, purely additive; no breaking client/server changes.

## Upstream facts (from the live instance)

- `GET /health` (no auth, basic), `GET /health/detailed` (readiness checks).
- `GET /v1/models`, `GET /api/model/options`, `GET /v1/capabilities`
  (feature flags + endpoint map), `GET /v1/skills`, `GET /v1/toolsets`.
- `POST /v1/chat/completions` (used today), `POST /v1/responses`.
- Runs: `POST /v1/runs`, `GET /v1/runs/{id}`, `GET /v1/runs/{id}/events`
  (SSE), `POST /v1/runs/{id}/approval`, `/steer`, `/stop`. **No list
  endpoint** — listing is ours to provide.
- Jobs: `GET /api/jobs`; mutations exist but are gated per instance
  (`jobs_admin` capability flag). Mutation paths: `POST /api/jobs`,
  `PATCH|DELETE /api/jobs/{id}`, `POST /api/jobs/{id}/pause|resume|run`.

## Part 1 — Upstream module (`packages/hermes-api/src/upstream/`)

```ts
interface Upstream {
  chat: AgentBackend;
  discovery: UpstreamDiscovery;
  runs: UpstreamRuns;
  jobs: UpstreamJobs;
}
interface UpstreamDiscovery {
  health(): Promise<unknown>;        // /health/detailed, falls back to /health
  capabilities(): Promise<unknown>;
  models(): Promise<unknown>;
  modelOptions(): Promise<unknown>;
  skills(): Promise<unknown>;
  toolsets(): Promise<unknown>;
}
interface UpstreamRuns {
  create(body: unknown): Promise<unknown>;        // returns at least { id }
  get(id: string): Promise<unknown>;
  events(id: string, signal?: AbortSignal): Promise<ReadableStream<Uint8Array>>;
  stop(id: string): Promise<unknown>;
  steer(id: string, body: unknown): Promise<unknown>;
  approve(id: string, body: unknown): Promise<unknown>;
}
interface UpstreamJobs {
  list(): Promise<unknown>;
  get(id: string): Promise<unknown>;
  create(body: unknown): Promise<unknown>;
  update(id: string, body: unknown): Promise<unknown>;
  remove(id: string): Promise<unknown>;
  pause(id: string): Promise<unknown>;
  resume(id: string): Promise<unknown>;
  trigger(id: string): Promise<unknown>;
}
```

Payloads are `unknown` pass-throughs by design: hermes-remote adds auth,
ownership, and identity — it does not re-model the upstream's schemas.

- `HermesUpstream` implements `Upstream` against the gateway: one private
  `request(method, path, body?)` core (bearer auth, JSON, error mapping),
  `chat` is the existing `HermesAgent`. Failures throw `HermesUpstreamError`
  (existing class, reused).
- `DemoUpstream` implements `Upstream` offline: `chat` is `DemoAgent`,
  discovery returns small fixed fixtures, runs is an in-memory store whose
  event stream emits a short deterministic SSE sequence then completes, jobs
  is an in-memory CRUD with pause/resume/trigger. Demo mode and unit tests
  exercise every surface.
- Module dependency order becomes scopes/limits → auth → chat → upstream →
  http.

## Part 2 — Server routes

`AppOptions.upstream?: Upstream`. Routes below are registered only when it is
set. The CLI always sets it (`HermesUpstream` when an upstream is configured,
`DemoUpstream` otherwise) and passes `upstream.chat` as the chat agent.

| Route | Scope | Behavior |
|---|---|---|
| `GET /v1/health` | `status:read` | `{ status, version, upstream }`; upstream health merged, fetch failure → `status: "unreachable"`, still 200 |
| `GET /v1/capabilities` | `status:read` | `{ object: "hermes-remote.capabilities", version, auth: { provider }, anonymous, features, upstream }` |
| `GET /v1/models` | `status:read` | proxy `discovery.models()` |
| `GET /v1/models/options` | `status:read` | proxy `discovery.modelOptions()` |
| `GET /v1/skills` | `skills:read` | proxy |
| `GET /v1/toolsets` | `toolsets:read` | proxy |
| `POST /v1/runs` | `chat:invoke` | identity injection for user/anonymous principals, create upstream, record ownership, return upstream body |
| `GET /v1/runs` | `chat:invoke` | list own runs from the local store (API keys: all runs) |
| `GET /v1/runs/:id` | `chat:invoke` | ownership check → proxy `runs.get` |
| `GET /v1/runs/:id/events` | `chat:invoke` | ownership check → SSE passthrough (`text/event-stream`, upstream byte stream returned as-is) |
| `POST /v1/runs/:id/stop` · `/steer` · `/approval` | `chat:invoke` | ownership check → proxy |
| `GET /v1/jobs` · `GET /v1/jobs/:id` | `crons:read` | proxy |
| `POST /v1/jobs` · `PATCH/DELETE /v1/jobs/:id` · `POST /v1/jobs/:id/pause|resume|run` | `crons:write` | proxy; upstream refusals (e.g. `jobs_admin` off) pass through as upstream errors |

- **Run ownership**: new `runs` table (id TEXT PRIMARY KEY, principal TEXT,
  created_at TEXT) via `RunStore` in the upstream module, opened on the same
  SQLite file as the chat store. Rules mirror sessions: user principals see
  only their own runs; api_key principals see all; anonymous principals own
  by `anonymous:<ip>` key. Unknown or unowned id → 404 `run_not_found`.
- **Identity injection**: for user and anonymous principals, the same
  identity preamble used for chat turns is prepended to the run's textual
  input (string `input` gets the preamble prepended; array `input` gets a
  prepended system entry; the exact field name is confirmed against the
  upstream OpenAPI/schema during implementation, with the chosen mapping
  recorded in code). API-key runs pass through untouched.
- **Error mapping**: `HermesUpstreamError` → 502
  `{ error: { code: "upstream_error", message, upstreamStatus } }`. The
  upstream bearer key never appears in any response or log.
- Route files live in `src/upstream/routes/` (discovery.ts, runs.ts,
  jobs.ts), mounted as a Hono sub-app like `chatRoutes`.

## Part 3 — Client (`hermes-ts`)

New namespaces on `HermesClient`, all using the existing fetch/auth core:

- `client.discovery.health() / capabilities() / models() / modelOptions() /
  skills() / toolsets()` — typed as `Promise<T = unknown>` generics with
  light result interfaces for the hermes-remote-owned wrappers (health,
  capabilities).
- `client.runs.create(body) / list() / get(id) / stop(id) / steer(id, body) /
  approve(id, body)` and `client.runs.events(id, signal?)` returning
  `AsyncIterable<{ event: string; data: unknown }>` via the existing SSE
  parser.
- `client.jobs.list() / get() / create() / update() / remove() / pause() /
  resume() / trigger()`.
- `client.conversation(sessionId?)` — the conversation abstraction: a handle
  with `id`, `send(content, attachments?)` and `edit(messageId, content)`
  (both `AsyncIterable<ChatEvent>`), `stop()`, `react(messageId, emoji)`,
  `messages()`, `remove()`. A handle without an id creates the session on
  first `send()` and exposes the id afterward. Implemented as a thin wrapper
  over the existing flat methods, which remain public.

## Part 4 — React hooks (`react-hermes`)

- `useAgentInfo({ client })` → `{ health, capabilities, models, loading,
  error, refresh }`; fetches the three discovery calls in parallel on mount.
- `useRuns({ client })` → `{ runs, loading, error, create, refresh }`.
- `useRunEvents({ client, runId })` → `{ events, done, error }`; subscribes
  to `client.runs.events` while mounted, aborts on unmount or runId change.
- No jobs hook (operator surface).

## Testing

- TDD; 100% line+function coverage maintained; strict typecheck; snippets
  check.
- `DemoUpstream` drives server route tests through `app.fetch` (including SSE
  passthrough and ownership 404s). `HermesUpstream` unit-tested against a
  fake fetch using response shapes recorded from the live probe.
- Integration suite gains gated live checks: health, capabilities, models
  against the running stack.
- Docs: `projects/server.md` endpoint + scope tables extended;
  `projects/client.md` gains the namespaces and the conversation handle;
  `projects/react.md` gains the new hooks; snippets parse-checked.

## Delivery

Step-by-step commits: upstream module → run store → server routes → client
namespaces + conversation handle → hooks → docs + version 3.1.0. Plain
lowercase commit messages, no co-author lines.
