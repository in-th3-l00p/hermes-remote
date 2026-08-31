# Live Examples Platform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Six live example React apps + a sandbox hermes-remote backend on Vercel (Groq inference), a grid `/examples/` index, and an architecture article per example.

**Architecture:** `apps/examples-backend` composes `createApp` with a `SandboxUpstream` (Groq chat/runs, seeded demo everything-else), sandbox management (FakeCliBridge + temp-home FsBridge, three profiles), and pure-JS in-memory chat/run stores (no bun:sqlite → runtime-proof). A thin Vercel function in `apps/landing/api/hermes/` strips the `/api/hermes` prefix and forwards to `app.fetch`. Example apps are individual Vite projects built into the landing `dist` under `/examples/<name>/app/`; articles are React pages rendering markdown files that the snippet checker scans.

**Tech Stack:** Bun, Vite + React + Tailwind v4 (apps/chat conventions), Hono (via hermes-remote), Vercel Functions (`bunVersion: 1.x`, Node fallback), Groq `llama-3.1-8b-instant`.

**Spec:** docs/superpowers/specs/2026-08-29-live-examples-design.md

## Global Constraints

- `apps/examples-backend` joins the 100%-coverage unit gate (`bun test packages` becomes `bun test packages apps/examples-backend`? — no: keep gate as `packages`, add backend to it by moving coverage config… simplest: backend lives at `packages/examples-backend` so the existing gate covers it. Directory decision locked: **`packages/examples-backend`**, npm-private (`"private": true`, never published).
- Example UIs: typecheck + build in CI, no coverage gate (apps policy).
- Sandbox guardrails: anonymous per-IP, `rateLimit {limit: 30, windowSeconds: 60}`, `limits {maxMessageChars: 2000, maxAttachments: 1}`, Groq `max_tokens` 400, seeded state, keyless fallback to demo echo (`GROQ_API_KEY` absent ⇒ DemoAgent-style replies) so previews/CI work without secrets.
- Supabase anon key + URL are public values; committed in example env files.
- No code on `/examples/` index; articles carry the code as markdown fences (parse-checked).
- Commit style unchanged; no comments except non-obvious constraints.

---

### Task 0: Bun-on-Vercel spike (throwaway function, kept only as knowledge)

- [ ] Add `"bunVersion": "1.x"` to `apps/landing/vercel.json`; create `apps/landing/api/spike.ts`:

```ts
export default async function handler(request: Request): Promise<Response> {
  const info: Record<string, unknown> = {
    bun: typeof Bun !== "undefined" ? Bun.version : null,
    node: typeof process !== "undefined" ? process.version : null,
    url: request.url,
  };
  try {
    const { Database } = await import("bun:sqlite");
    const db = new Database(":memory:");
    db.run("CREATE TABLE t (x)");
    info["sqlite"] = "ok";
  } catch (cause) {
    info["sqlite"] = String(cause);
  }
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(info)}\n\n`));
      c.close();
    },
  });
  return new Response(stream, { headers: { "content-type": "text/event-stream" } });
}
```

- [ ] `cd apps/landing && bunx vercel deploy` (preview); curl `<preview>/api/spike`; record bun/sqlite/streaming outcome in the commit message. If the Bun runtime fails to build, drop `bunVersion` and re-verify on Node (the design needs only web-standard APIs + streaming).
- [ ] Delete `api/spike.ts`; keep the vercel.json runtime setting that worked. Commit: `vercel runtime spike` (message records findings).

### Task 1: packages/examples-backend — stores + sandbox home + CLI fixtures

**Files:** Create `packages/examples-backend/package.json` (private, deps: `@intheloop-studio/hermes-remote` `workspace:*`), `tsconfig.json` (copy pattern from hermes-api), `src/stores.ts`, `src/home.ts`, `src/cli.ts`, tests alongside.

**Produces:**

```ts
// stores.ts — pure-JS stand-ins, cast where ChatStore/RunStore concrete types are demanded
export class MemoryChatStore { /* mirrors the ChatStore methods used by chat routes:
  createSession(userId?: string | null), getSession(id), listSessions(filter),
  deleteSession(id), addMessage(sessionId, input), editMessage(sessionId, messageId, content),
  toggleReaction(sessionId, messageId, emoji) — exact signatures read from
  packages/hermes-api/src/chat/store before writing */ }
export class MemoryRunStore { record(id, principal): RunRecord; get(id): RunRecord | null; list(principal): RunRecord[]; }
// home.ts
export function seedSandboxHome(root: string, profile: "default" | "atlas" | "nova"): void;
// cli.ts
export function sandboxCli(): FakeCliBridge;   // profile list table (atlas/nova/default), status, config show/get,
                                               // doctor, insights, gateway status, kanban list, checkpoints list, …
```

Seeds: distinct SOUL.md/MEMORY.md/USER.md per profile, two skills (`web-research`, `daily-briefing`) with a reference file, one bundle, one cron output file.

- [ ] TDD each module (session lifecycle incl. edit truncation + reactions parity with real ChatStore semantics; seeding idempotent; cli fixtures parse through ProfileRegistry). 100% coverage. Commit: `examples backend stores and fixtures`

### Task 2: SandboxUpstream + createSandboxApp

**Files:** Create `src/upstream.ts`, `src/app.ts`, `src/index.ts`, tests.

**Produces:**

```ts
export interface SandboxOptions { groqKey?: string; fetch?: typeof fetch; now?: () => Date; }
export class SandboxUpstream implements Upstream { constructor(options: SandboxOptions); }
export function createSandboxApp(options: SandboxOptions): { fetch(request: Request, clientIp?: string): Response | Promise<Response> };
export function vercelHandler(options: SandboxOptions): (request: Request) => Promise<Response>;  // strips /api/hermes, derives ip from x-forwarded-for
```

- `chat`: with groqKey → `HermesAgent({ baseUrl: "https://api.groq.com/openai", apiKey, model: "llama-3.1-8b-instant" })` wrapped to append `max_tokens` — HermesAgent doesn't set max_tokens; wrap its stream? Simplest: own `AgentBackend` impl posting to Groq `/v1/chat/completions` with `max_tokens: 400`, reusing the SSE parsing pattern from HermesAgent (copy, ~60 lines, tested with fake fetch). Without groqKey → `DemoAgent`.
- `runs.create`: one Groq completion (non-streaming, `max_tokens: 400`) with the run input as user message; stores `{id, status, output}`; `events()` synthesizes started/delta/completed frames; get/stop/steer/approve over the in-memory map.
- `discovery`: fixtures naming the live model + sandbox capabilities (`audio_api: false`); `health` → `{status: "ok", platform: "hermes-remote-sandbox"}`.
- `sessions`: reuse `DemoUpstream`'s session behavior by embedding a `DemoUpstream` instance and delegating `sessions` (and `jobs`) to it, pre-seeded with two cron jobs and one session.
- `raw`: `/v1/chat/completions`+`/v1/responses` forwarded to Groq when keyed, demo JSON otherwise; other paths 404.
- `createSandboxApp`: `createApp({ version: "sandbox", anonymous: true, authProvider: new JwtAuthProvider({ jwksUrl: "https://jhvuzxmhyyyovzgtdwvl.supabase.co/auth/v1/.well-known/jwks.json" }), rateLimit: {30,60}, limits: {maxMessageChars: 2000, maxAttachments: 1}, chat: { store: new MemoryChatStore() as ChatStore, agent: upstream.chat, turns: new Map() }, upstream: { upstream, runStore: new MemoryRunStore() as RunStore, pollMs: 50 }, management: { cli: sandboxCli(), profiles: new ProfileRegistry({cli, homeFor}), homeFor: seeded-temp-home resolver }, commandRelay: false })`.

- [ ] TDD through `app.fetch`: streamed chat turn with fake Groq SSE, run round trip incl. events, discovery fixtures, memory/soul/profiles round trips against seeded home, `vercelHandler` prefix strip + x-forwarded-for, keyless demo fallback, rate limit fires. 100%. Commit: `sandbox upstream and app`

### Task 3: Vercel function + local dev harness

**Files:** Create `apps/landing/api/hermes/[[...route]].ts`:

```ts
import { vercelHandler } from "@intheloop-studio/hermes-remote-examples-backend";
const handler = vercelHandler({ groqKey: process.env["GROQ_API_KEY"] });
export default handler;
```

Modify `apps/landing/vercel.json` (runtime from spike; function maxDuration 60), `apps/landing/package.json` (dep on the backend package), `packages/examples-backend/package.json` name `@intheloop-studio/hermes-remote-examples-backend`. Add `scripts/dev-sandbox.ts` at repo root (Bun.serve wrapping `createSandboxApp` on :8644 for local example dev).

- [ ] Typecheck; `bun scripts/dev-sandbox.ts` + curl status/chat locally; commit: `sandbox vercel function`

### Task 4: chat example app

**Files:** Create `apps/examples/chat/` — `package.json` (react, react-dom, `@intheloop-studio/hermes-remote-client` + `-react` `workspace:*`, vite, @vitejs/plugin-react, tailwindcss + @tailwindcss/vite, typescript), `vite.config.ts` (`base: "/examples/chat/app/"`, dedupe react), `index.html`, `src/main.tsx`, `src/App.tsx`, `src/lib/client.ts`, `src/components/*` (message list with markdown-lite rendering, composer, sandbox banner, header linking to article + index). `src/lib/client.ts`:

```ts
import { HermesClient } from "@intheloop-studio/hermes-remote-client";
export const client = new HermesClient({
  baseUrl: import.meta.env["VITE_HERMES_API_URL"] ?? "/api/hermes",
});
```

Features: `useChat` (send/edit/react/stop/streaming indicator), `useSessions` with localStorage ids (anonymous pattern from apps/chat), zinc dark. `.env.development` sets `VITE_HERMES_API_URL=http://localhost:8644`.

- [ ] Build + typecheck green (`bun run --cwd apps/examples/chat build`); manual smoke against dev-sandbox. Commit: `chat example app`

### Task 5: /examples index + article system + chat article

**Files:** Rewrite `apps/landing/examples/index.html` + create `apps/landing/src/examples/Index.tsx` (grid of cards from `catalog.ts`), `apps/landing/src/examples/catalog.ts`:

```ts
export interface ExampleCard { slug: string; title: string; blurb: string; tags: string[]; }
export const EXAMPLES: ExampleCard[];   // chat, auth, configuration, runs, profiles, command-center
```

Article system: `apps/landing/examples/<slug>/index.html` entries mounting `src/examples/Article.tsx`, which renders `apps/landing/examples/articles/<slug>.md` (imported `?raw`, rendered with the same lightweight markdown renderer style as apps/chat — copy the component). Extend `scripts/check-snippets.ts` glob to include `apps/landing/examples/articles/*.md`. Add all new entries to `vite.config.ts` rollup inputs. Write `articles/chat.md` (architecture: useChat reducer, conversation handle, SSE event table, links to source on GitHub).

- [ ] Landing build renders index + chat article; snippets check green. Commit: `examples index and chat article`

### Task 6: auth + configuration examples (+articles)

- `apps/examples/auth/`: Supabase JS (anonymous + GitHub OAuth buttons, committed public env), `whoami` panel, scope-probe table (calls `/v1/memory`, `/v1/agent/status`, `/v1/jobs` and renders allow/deny per principal), token viewer (decoded claims only). Article `articles/auth.md`: principals, tokenProvider, providers module, why management calls 403 for users.
- `apps/examples/configuration/`: three tabs — config (`useConfig` + set/unset via `client.config`), memory (`useMemory` + entry add/replace/remove + char budget meters), soul (`useSoul` editor with save). Article `articles/configuration.md`: CLI vs FS bridges, `{ok, raw}` shape, hooks-over-generics (`useResource`).

- [ ] Both build; articles snippet-checked; commit each: `auth example app`, `configuration example app`

### Task 7: runs + profiles examples (+articles)

- `apps/examples/runs/`: task composer → `useRuns.create`, run list with ownership note, `useRunEvents` live event feed, stop button, output viewer. Article: run lifecycle, ownership store, SSE passthrough.
- `apps/examples/profiles/`: profile switcher (`useProfiles`) → rebuilds a `withProfile` client in state; panels for soul/memory/status re-render per profile (atlas vs nova visibly different). Article: `X-Hermes-Profile`, pinned keys, registry.

- [ ] Build + articles; commits: `runs example app`, `profiles example app`

### Task 8: command-center showcase (+article)

`apps/examples/command-center/`: dashboard grid — chat pane (`useChat`), run launcher + live events (`useRuns`/`useRunEvents`), health/capabilities/models (`useAgentInfo`), memory + soul editors, config viewer, jobs list, `/v1/events` ticker (`useEvents`), goal panel (`useGoal` against a demo agent-session id; mutations show the 501-relay-disabled response as a teaching moment). Article: composing every hook, the event bus, sandbox composition of `createApp`.

- [ ] Build + article; commit: `command center showcase`

### Task 9: build pipeline + CI

- `apps/landing/package.json` build → `bun run build:examples && vite build && vitepress build docs && bun scripts/copy-examples.ts` with `build:examples` looping `apps/examples/*` builds; create `apps/landing/scripts/copy-examples.ts` (cp each `apps/examples/<n>/dist` → `dist/examples/<n>/app`).
- Root `package.json`: `typecheck` filter already covers workspaces — ensure example apps + backend have `typecheck` scripts; add example builds to `.github/workflows/test.yml` (after client builds): backend tests are inside `bun test packages` already (backend is under packages/).
- [ ] Full local `bun run --cwd apps/landing build` produces index, six articles, six apps; CI file updated; `bun run test` still 100%. Commit: `examples build pipeline`

### Task 10: deploy + records

- [ ] `cd apps/landing && bunx vercel deploy` → verify live: `/v1/status` via `/api/hermes/v1/status`, streamed chat (keyless demo fallback), examples index + one app + one article render.
- [ ] Ask the user to add `GROQ_API_KEY` (dashboard or `! cd apps/landing && bunx vercel env add GROQ_API_KEY production`), then `bunx vercel deploy --prod` and re-verify with real inference.
- [ ] HANDOFF (examples platform section: sandbox architecture, env vars, reset semantics), CHANGELOG entry, `apps/landing/index.html` nav still points at /examples/. Commit: `live examples platform`

## Self-review

- Spec coverage: spike→T0, backend→T1–3, apps→T4,6,7,8, index/articles→T5–8, pipeline/CI→T9, deploy/env/records→T10. ✔
- Backend location changed to `packages/examples-backend` so the existing coverage gate applies — spec's `apps/examples-backend` superseded deliberately. ✔
- Names: `MemoryChatStore`, `MemoryRunStore`, `seedSandboxHome`, `sandboxCli`, `SandboxUpstream`, `createSandboxApp`, `vercelHandler`, `EXAMPLES` catalog. ✔
