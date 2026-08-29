# Full-Coverage API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the complete hermes-agent coverage catalog (bridges, profiles, ~150 endpoints), then the full TypeScript client and React hook layers.

**Architecture:** Two new bridge seams (`CliBridge` allowlisted-argv executor, `FsBridge` allowlist/denylist file access) plus a `ProfileRegistry` feed a declarative management-route catalog (one data row per CLI-backed endpoint, table-driven tests). Feature-specific logic (memory, skills files, goals, commands, events, media) gets dedicated route files. Client namespaces are thin typed wrappers over `request`/`stream`; React gets `useResource`/`useAction` generics with named wrappers.

**Tech Stack:** Bun, TypeScript strict, Hono 4, bun:sqlite, Bun.spawn.

**Spec:** docs/superpowers/specs/2026-08-29-full-coverage-api-design.md (the endpoint tables there are normative; this plan defines the machinery and patterns).

## Global Constraints

- 100% line AND function coverage after every commit; `bun run test`, `bun run typecheck`, snippets, client builds green.
- Additive; versions at the end: server/CLI 3.2.0, clients 1.2.0.
- Scope additions exactly: `ops:control` (T3), `messaging:send` (T2), `pairing:manage` (T3), `projects:manage` (T2), `backups:manage` (T3).
- CLI bridge: allowlisted argv templates only; params must not begin with `-`; binary path configured, audited, timeout + concurrency cap.
- FS bridge: allowlist prefixes + credential denylist (`.env`, `auth.json`, `keys.json`, `*.pem`); size caps; traversal-safe.
- Secrets write-only everywhere; upstream/CLI failures → 502 (`upstream_error`/`cli_error`); user tokens tier 1 only; commit style unchanged.

---

### Task 1: CliBridge + FakeCliBridge

**Files:** Create `packages/hermes-api/src/bridge/cli.ts`, `packages/hermes-api/src/bridge/fake.ts`, `packages/hermes-api/src/bridge/index.ts`; Test `packages/hermes-api/src/bridge/cli.test.ts`.

**Produces:**

```ts
export interface CliResultData { ok: boolean; exitCode: number; stdout: string; stderr: string; }
export interface CliBridge { run(argv: string[], options?: { timeoutMs?: number }): Promise<CliResultData>; }
export type SpawnLike = (argv: string[], timeoutMs: number) => Promise<{ exitCode: number; stdout: string; stderr: string }>;
export class HermesCliBridge implements CliBridge {
  constructor(options: { binary: string; spawn?: SpawnLike; timeoutMs?: number; maxConcurrent?: number });
}
export class FakeCliBridge implements CliBridge {
  constructor(responses?: Record<string, Partial<CliResultData> | (() => Partial<CliResultData>)>);
  readonly calls: string[][];
  on(argvPrefix: string, result: Partial<CliResultData>): void;   // longest-prefix match on argv.join(" ")
}
```

Default spawn wraps `Bun.spawn({ cmd: [binary, ...argv], stdout: "pipe", stderr: "pipe" })` with a kill-on-timeout race. Concurrency cap = simple promise-queue counter (default 4). `ok = exitCode === 0`.

- [ ] Failing tests: fake spawn asserting binary+argv, timeout kill path (spawn that never resolves until aborted — inject spawn returning a promise racing the timeout), concurrency cap (3 concurrent with cap 2: third waits), FakeCliBridge prefix matching + call recording, real default spawn once against `/usr/bin/true`-style (`["--version"]` with binary `echo`).
- [ ] Implement; green, 100%.
- [ ] Commit: `cli bridge`

### Task 2: FsBridge

**Files:** Create `packages/hermes-api/src/bridge/fs.ts`; Test `packages/hermes-api/src/bridge/fs.test.ts`; Modify `packages/hermes-api/src/bridge/index.ts`.

**Produces:**

```ts
export class BridgeDenied extends Error { constructor(readonly reason: string); }
export class FsBridge {
  constructor(options: { root: string; maxBytes?: number });        // default 2_000_000
  read(relPath: string): Promise<string | null>;                    // null when missing
  write(relPath: string, content: string): Promise<void>;           // mkdir -p, size-capped
  remove(relPath: string): Promise<boolean>;
  list(relDir: string): Promise<string[]>;                          // [] when missing
  resolve(relPath: string): string;                                 // throws BridgeDenied on traversal/denylist
}
```

Denylist (checked on every resolved path, case-insensitive basename): `.env`, `auth.json`, `keys.json`, endings `.pem`/`.key`, any segment `credentials`. Traversal: resolved absolute path must start with `root + sep`.

- [ ] Failing tests in a temp root: read/write/remove/list round trip incl. nested mkdir, missing→null/[]/false, size cap on read and write, traversal `../x` throws, each denylist pattern throws, `resolve` returns absolute path inside root.
- [ ] Implement; green, 100%.
- [ ] Commit: `fs bridge`

### Task 3: ProfileRegistry + profile middleware + key restriction + /v1/profiles

**Files:** Create `packages/hermes-api/src/profiles/registry.ts`, `packages/hermes-api/src/profiles/routes.ts`, `packages/hermes-api/src/profiles/index.ts`; Modify `src/auth/keys.ts` (`profile?: string` on `ApiKeyRecord` + `CreateKeyInput`), `src/http/app.ts` (`ManagementOptions`, profile middleware, mount), `src/http/middleware.ts`, `src/index.ts`, `packages/cli/src/commands/keys.ts` (`--profile` flag); Tests alongside each.

**Produces:**

```ts
export interface ProfileInfo { name: string; isDefault: boolean; model: string | null; gateway: string | null; alias: string | null; }
export class ProfileRegistry {
  constructor(options: { cli: CliBridge; homeFor: (name: string) => string; cacheMs?: number });
  list(): Promise<ProfileInfo[]>;        // parses `profile list` table; ◆ marks default; cached (default 15s)
  exists(name: string): Promise<boolean>;
  homeFor(name: string): string;
}
// app.ts
export interface ManagementOptions {
  cli: CliBridge;
  profiles: ProfileRegistry;
  homeFor: (profile: string | null) => string;   // null = default profile home
}
export interface AppOptions { /* existing */ management?: ManagementOptions; }
// ChatEnv Variables gains: profile: string | null
```

Profile middleware (in `http/middleware.ts`, registered right after auth when management present): reads `X-Hermes-Profile`; unknown profile → 404 `profile_not_found`; key with `record.profile` set and mismatched target → 403 `profile_forbidden`; sets `c.set("profile", name | null)`. `cliArgs(profile)` helper prepends `["-p", name]` when non-null.

Profile routes per spec table (list/show `status:read`; create/delete/patch/export/import/install/update `profiles:manage`), all via CLI templates; export streams stdout of `profile export` as `application/octet-stream` — implement as CLI run + return raw stdout with that content type.

Registry parser: skip 2 header lines; columns split on 2+ spaces; leading `◆` → default; `—` → null.

- [ ] Failing tests: parser against a verbatim transcript of this machine's `hermes profile list` output (5 profiles, indra default); cache behavior (second list() → one CLI call); middleware unknown-profile 404, restricted-key 403 + pass, header plumbed to `c.var.profile`; keys `--profile` persists and round-trips verifyToken; each profile route (scope denial, argv assertion via FakeCliBridge, 502 on `ok: false`).
- [ ] Implement; green, 100%.
- [ ] Commit: `profile registry and routes`

### Task 4: Management route catalog (Waves 2–4, CLI-backed)

**Files:** Create `packages/hermes-api/src/mgmt/catalog.ts`, `packages/hermes-api/src/mgmt/routes.ts`, `packages/hermes-api/src/mgmt/index.ts`; Modify `src/scopes/index.ts` (five new scopes in their tiers), `src/http/app.ts` (mount), `src/index.ts`; Test `packages/hermes-api/src/mgmt/mgmt.test.ts`.

**Produces:**

```ts
export interface RouteParam { name: string; from: "param" | "query" | "body"; required?: boolean; flag?: string; }
export interface CliRouteSpec {
  method: "get" | "post" | "put" | "patch" | "delete";
  path: string;                 // hono path
  scope: Scope;
  apiKeyOnly?: boolean;         // jobs-style guard
  argv: string[];               // template; "{name}" placeholders reference params
  params?: RouteParam[];
  timeoutMs?: number;
}
export const MGMT_ROUTES: CliRouteSpec[];
export function registerMgmtRoutes(app: Hono<ChatEnv>, options: ManagementOptions): void;
```

Handler behavior: resolve params (missing required → 400 `invalid_request`; any value starting with `-` → 400), build argv (`[-p profile] + template with placeholders substituted + flags appended`), run CLI, `ok` → `{ ok: true, raw: stdout }` (200), else 502 `cli_error` `{ error: { code: "cli_error", message: stderr-or-stdout tail, exitCode } }`.

Catalog entries: every row of the spec's Wave 2–4 tables. Exemplars establishing the pattern (the rest follow identically):

```ts
{ method: "get",  path: "/v1/config", scope: "config:read", argv: ["config", "show"] },
{ method: "put",  path: "/v1/config/:key", scope: "config:write", argv: ["config", "set", "{key}", "{value}"],
  params: [ { name: "key", from: "param", required: true }, { name: "value", from: "body", required: true } ] },
{ method: "post", path: "/v1/messages/send", scope: "messaging:send", apiKeyOnly: true,
  argv: ["send", "{message}"], params: [
    { name: "message", from: "body", required: true },
    { name: "platform", from: "body", flag: "--platform" },
    { name: "target", from: "body", flag: "--to" } ] },
```

Full row list (path → argv core, scope per spec): config get/set/unset/check/migrate; providers model (`model`/`model {name}`), fallbacks (`fallback list`/`fallback set {chain}`), moa (`moa show`/`moa set {slots}`), auth pools (`auth status`); agent status/doctor/prompt-size/security-audit (`security audit`)/insights (`--days` flag)/logs (`--tail`, `--source` flags)/pause/resume; skills pending (`skills pending|approve {id}|reject {id}`), hub search (`skills search {q}`, `--source` flag), install/update/uninstall/audit, taps (`skills tap list|add {url}|remove {name}`), curator (`curator status|run|pause`); bundles list/create/delete via CLI (`bundles list|create {name}|delete {name}`); jobs runs (`cron runs {id}`); checkpoints (`checkpoints list|prune`); approvals (`approvals history|propose`); hooks (`hooks list|test {event}|revoke {command}|doctor`); webhooks (`webhook list|add {url}|remove {id}`); gateway (`gateway status|start|stop|restart|enroll`); pairing (`pairing list|create|revoke {code}`); kanban (`kanban list|add {title}|update {id}|remove {id}`, comment/link via flags); projects (`project list|add {name}|update {name}|remove {name}`); toolsets put (`tools enable {name}`/`tools disable {name}` chosen by body `enabled`); mcp (`mcp list|add {name} {url}|remove {name}`); plugins (`plugins list|enable {name}|disable {name}|validate {name}`); backups (`backup` → stream stdout as octet-stream, `import {path}` → 400 unless server-local path allowed? no: import accepts an uploaded body written to a temp file then `import {tmp}`).

Tests: one table-driven loop over `MGMT_ROUTES`: (a) key without scope → 403, (b) happy path with FakeCliBridge asserting exact argv incl. profile prefix under `X-Hermes-Profile`, (c) `ok:false` → 502; plus specials: param starting with `-` → 400, missing required → 400, backup content-type, import temp-file flow, toolsets enable/disable switch.

- [ ] Failing tests (loop + specials); implement catalog + registrar; green, 100%.
- [ ] Commit: `management route catalog`

### Task 5: FS-backed features — memory, soul, skills files, bundles read, cron output, subagents

**Files:** Create `packages/hermes-api/src/mgmt/memory.ts`, `src/mgmt/soul.ts`, `src/mgmt/skill-files.ts`, `src/mgmt/fs-routes.ts` (registrar composing them + bundles read `skill-bundles/`, cron `cron/output/`, subagents `cache/delegation/live/`); Test `src/mgmt/fs-routes.test.ts`; Modify `src/mgmt/index.ts`, `src/http/app.ts`.

Behavior (paths relative to profile home via `FsBridge(new root = homeFor(profile))`):
- `GET /v1/memory` → `{ content, limit: 2200, chars }` from `memories/MEMORY.md` (missing → content ""); `PUT` writes body `{content}` (over-limit → 400 `memory_overflow`). `/v1/memory/user` same with `memories/USER.md`, limit 1375.
- `POST /v1/memory/entries` `{action: "add"|"replace"|"remove", text, from?}` — add appends line, replace substitutes exact `from`→`text` (missing → 404), remove deletes exact line (missing → 404); result returns new content + chars.
- `GET/PUT /v1/soul` → `SOUL.md`.
- `GET /v1/skills/:name{[A-Za-z0-9_-]+}` → `skills/{name}/SKILL.md` (404 when missing); `GET /v1/skills/:name/files/:path{.+}` → `skills/{name}/{path}`; `POST /v1/skills` `{name, content}` writes SKILL.md (409 if exists); `PATCH /v1/skills/:name` `{content}`; `DELETE` removes the file and returns `{deleted}`; `PUT .../files/:path` writes.
- `GET /v1/bundles` lists `skill-bundles/*.yaml` with contents; `GET /v1/bundles/:name` one; `PUT` writes; `DELETE` removes (CLI create/delete rows already exist in Task 4 — keep only FS GET/PUT here and drop the CLI `bundles create/delete` rows in favor of FS `PUT/DELETE`; adjust catalog).
- `GET /v1/jobs/:id/output` lists `cron/output/{id}/`; `GET .../output/:name` reads a file.
- `GET /v1/subagents` lists `cache/delegation/live/` transcripts with sizes.

BridgeDenied → 400 `path_denied`; scope guards per spec.

- [ ] Failing tests with temp profile homes seeded per feature (incl. overflow, entry replace/remove miss, skill 409, denylisted path attempt, subagents empty).
- [ ] Implement; green, 100%.
- [ ] Commit: `memory soul skills and fs routes`

### Task 6: Upstream sessions bridge + commands + goals + events

**Files:** Create `packages/hermes-api/src/upstream/sessions.ts` (extend `Upstream` with `sessions: UpstreamSessions`), `src/upstream/routes/agent-sessions.ts`, `src/mgmt/commands.ts` (catalog + relay), `src/mgmt/goals.ts` (`GoalStore` over state.db + routes), `src/events/bus.ts` + `src/events/routes.ts`; Modify `demo.ts`/`hermes.ts` (implement `sessions`), `routes/index.ts`, `app.ts`, `index.ts`; Tests alongside.

**Produces:**

```ts
export interface UpstreamSessions {
  list(): Promise<unknown>; create(body: unknown): Promise<unknown>; get(id: string): Promise<unknown>;
  update(id: string, body: unknown): Promise<unknown>; remove(id: string): Promise<unknown>;
  messages(id: string): Promise<unknown>; fork(id: string, body: unknown): Promise<unknown>;
  chat(id: string, body: unknown): Promise<unknown>;
  chatStream(id: string, body: unknown, signal?: AbortSignal): Promise<ReadableStream<Uint8Array>>;
  modelLock(id: string, body: unknown): Promise<unknown>;
}
export const COMMAND_SCOPES: Record<string, Scope>;   // "/goal"→goals:write, "/subgoal"→goals:write, "/title"→sessions:write-all, "/model"→providers:manage, "/busy"→chat:invoke, "/rollback"→checkpoints:rollback, "/context"→status:read, "/status"→status:read, "/journey"→memory:read, "/personality"→soul:write, "/skills"→skills:write, "/cron"→crons:write, "/hatch"→chat:invoke
export class EventBus { publish(event: { type: string; at: string; data: unknown }): void; subscribe(signal: AbortSignal): AsyncIterable<...>; }
export interface GoalState { text: string | null; contract: Record<string, unknown> | null; subgoals: string[]; gates: { command: string; passing: boolean | null }[]; turns: { used: number; max: number } | null; wait: Record<string, unknown> | null; verdict: string | null; raw: unknown; }
export class GoalStore { constructor(statePath: string); get(sessionId: string): GoalState | null; }
```

- Agent-session routes proxy per spec (scopes `sessions:read-all`/`write-all`, api-key only; chat/chatStream also `chat:invoke`); DemoUpstream gets an in-memory session store + canned stream.
- **Goals probe first** (implementation step, read-only): `sqlite3 ~/.hermes/profiles/indra/state.db "SELECT key FROM state_meta LIMIT 20"` and one `goal:%` value to fix the real JSON shape; map into `GoalState` defensively (unknown fields → `raw`). If no goal rows exist on the machine, derive the shape from the docs fields and keep every access defensive.
- `GET .../goal` reads via `GoalStore` on a read-only sqlite open of the profile's `state.db` (missing db/table/row → 404 `goal_not_found`). Goal/subgoal/gate mutations + `POST /v1/agent/sessions/:id/commands`: relay `{message: "<command text>"}` through `chatStream`, collecting until `run.completed`/stream end (timeout 60s) and returning `{ ok, events }`. **Interception check step:** run one live relay of `/goal status`; if the reply shows the model answered instead of the command layer, mutations return 501 `not_supported` (behind `commandRelay: boolean` management option, default decided by that check) while reads stay live — record the outcome in the code and docs.
- `GET /v1/commands` returns the catalog with scopes; `POST .../commands` validates against `COMMAND_SCOPES` (unknown → 400 `unknown_command`; scope enforced per entry; user tokens allowed only for tier-1 scoped commands).
- EventBus: publishers in chat sse (turn start/done), runs routes (created/stopped), jobs trigger, command relay; `GET /v1/events` streams `event: <type>` SSE with heartbeat every 15s, `events:subscribe` scope.

- [ ] Failing tests: DemoUpstream sessions round trip through routes; command catalog + scope enforcement + unknown rejection; relay against DemoUpstream stream; GoalStore against a fixture state.db built in-test with sqlite (insert `goal:<id>` row with the discovered/derived JSON); events bus fan-out + SSE route (subscribe, publish, read frames, abort).
- [ ] Implement (incl. the two live probe steps); green, 100%.
- [ ] Commit: `agent sessions commands goals and events`

### Task 7: Media, web, browser, passthrough

**Files:** Create `packages/hermes-api/src/upstream/routes/media.ts` (tts/images/web/browser/passthrough); Modify `types.ts` (+`raw(method, path, body, signal): Promise<Response>` on Upstream for passthrough + audio), `hermes.ts`, `demo.ts`, `routes/index.ts`; Test in `routes/media.test.ts`.

- `POST /v1/media/tts`: capabilities cached per app; `features.audio_api !== true` → 501 `not_supported` with the capability report; else `upstream.raw("POST", "/v1/audio/speech", body)` streamed back.
- Templated runs helper `toolRun(upstream, tool, instruction, timeoutMs)`: create run with `input` instructing a single tool call returning only the tool result; poll `runs.get` every 500ms (injectable clock) until `status` completed/failed or timeout → `{ output, raw }` (JSON-parsed output when possible). Routes: `/v1/media/images` (`image_gen`), `/v1/web/search` (`web_search`), `/v1/web/extract` (`web_extract`), `/v1/browser/tasks` (create run with browser instruction; reuse existing run routes for status/events — response returns `{ runId }`).
- Passthrough `POST /v1/chat/completions`, `POST /v1/responses`: api-key only + `chat:invoke`, body forwarded verbatim via `raw`, response (incl. SSE) streamed back.
- All new run-backed routes record ownership in `RunStore` and publish events.

- [ ] Failing tests: 501 path, audio proxy with fake raw, toolRun polling against DemoUpstream (extend demo run to complete with JSON output), parse fallback to raw text, browser task returns runId owned by caller, passthrough streams and is user-forbidden.
- [ ] Implement; green, 100%.
- [ ] Commit: `media web and passthrough`

### Task 8: CLI package wiring

**Files:** Modify `packages/cli/src/cli.ts` (build `HermesCliBridge` — binary from config `hermesBinary ?? "hermes"` —, `ProfileRegistry` with `homeFor` = `~/.hermes` default / `~/.hermes/profiles/<name>`, pass `management` into serve), `packages/cli/src/config.ts` (`hermesBinary?`, `profileHomes?: Record<string,string>`), `packages/cli/src/context.ts`; serve tests.

- [ ] Failing tests: serve passes management config through ctx.serve; keys `--profile` (if not already in Task 3); config fields load.
- [ ] Implement; green; commit: `cli management wiring`

### Task 9: Client completion (hermes-ts 1.2.0)

**Files:** Create `src/management.ts` (namespaces: `profiles`, `config`, `providers`, `agent`, `memory`, `soul`, `skills`, `bundles`, `checkpoints`, `approvals`, `hooks`, `webhooks`, `gateway`, `messaging`, `pairing`, `kanban`, `projects`, `toolsets`, `mcp`, `plugins`, `backups`, `subagents` — grouped as small classes in this file or split at ~100 lines each into `management-*.ts`), `src/agent-sessions.ts` (`agentSessions` incl. `chatStream` SSE), `src/commands.ts`, `src/goals.ts` (typed `GoalState`), `src/events.ts` (`events(signal?)` SSE iterable), `src/media.ts` (`media`, `web`, `browser`); Modify `client.ts` (instantiate; `withProfile(name): HermesClient`), `http.ts` (constructor `headers?: Record<string, string>` merged into every request), `index.ts`; Tests table-driven in `management.test.ts` + `agent-features.test.ts`.

Method → route mapping is 1:1 with the spec tables; every method `Promise<T = unknown>` except typed hermes-remote shapes (`GoalState`, `ProfileInfo[]`, `RemoteHealth`...). `withProfile` returns a new client sharing options with `X-Hermes-Profile` header set.

- [ ] Failing tests: one table asserting `${method} ${path}` and body for every new client method against a recording fetch; `withProfile` header on request and on stream; goal/events/agent-session stream iteration; build.
- [ ] Implement; green, 100%; commit: `client full coverage namespaces`

### Task 10: React completion (react-hermes 1.2.0)

**Files:** Create `src/use-resource.ts` (`useResource<T>(fetcher: () => Promise<T>, key: string)` → `{ data, loading, error, refresh }`; `useAction<A extends unknown[], R>(fn)` → `{ run, pending, error, result }`), `src/use-management.ts` (named wrappers: `useProfiles`, `useAgentStatus`, `useConfig`, `useMemory`, `useSoul`, `useSkills`, `useBundles`, `useCheckpoints`, `useHooksInfo`, `useGateway`, `useKanban`, `useProjects`, `useToolsets`, `useMcp`, `usePlugins`, `useAgentSessions`, `useCommands` — each `{ client }` structural), `src/use-goal.ts` (`useGoal({ client, sessionId })` with mutation actions), `src/use-events.ts` (`useEvents({ client, enabled? })` SSE collection with abort-on-unmount); Modify `index.ts`; Tests: `use-resource.test.ts` (full branch coverage of the generics), `use-management.test.ts` (loop over named hooks with stub clients), `use-goal.test.ts`, `use-events.test.ts`.

- [ ] Failing tests; implement; green, 100%; build; commit: `react full coverage hooks`

### Task 11: Docs + versions + verification

**Files:** Modify docs (`projects/server.md` full endpoint+scope tables, `projects/client.md` namespaces + withProfile, `projects/react.md` hooks, new `projects/management.md` if server.md exceeds ~250 lines), CHANGELOG, HANDOFF (bridges, mgmt catalog, profile model), four package.json versions (3.2.0 / 1.2.0, dep ranges), `integration/management.test.ts` (gated: profiles list, agent status, config get, memory read against live stack).

- [ ] Docs + snippets + landing build; versions; CHANGELOG/HANDOFF; full verification (`bun run test` 100%, typecheck ×4, snippets, builds); run gated integration against a locally started server wired to the live agent (start on a spare port with the indra upstream, run, stop).
- [ ] Commit: `full coverage docs and 3.2.0`

## Self-review

- Spec coverage: bridges→1–2, profiles→3, Waves 2–4 CLI→4, FS features→5, Wave 5→6, Wave 6→7, host wiring→8, client→9, react→10, docs/integration→11. Gateway platforms GET/PUT: GET composed in Task 4 (gateway status) + health platform data — add explicit `GET /v1/gateway/platforms` (HR: health platforms merge) and `PUT /v1/gateway/platforms/:name` (config set rows) to Task 4 catalog. ✔ (added)
- Placeholders: goal schema and command interception are explicit probe steps with defined fallbacks, not TBDs. ✔
- Type consistency: `ManagementOptions`, `CliBridge`, `FsBridge`, `ProfileRegistry`, `GoalState`, `EventBus`, `COMMAND_SCOPES`, `withProfile` used consistently across tasks. ✔
