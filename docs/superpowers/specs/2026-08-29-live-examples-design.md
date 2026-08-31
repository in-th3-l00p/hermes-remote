# Live examples platform — design

Date: 2026-08-29
Status: approved

## Goal

Replace the static examples page with a live examples platform: one React
app per major feature plus a full showcase, hosted on Vercel inside the
existing landing project, running against a hermes-remote sandbox backend
with real free-model inference (Groq `llama-3.1-8b-instant`). `/examples/` is
a grid index of cards; each example has a live app at
`/examples/<name>/app/` and an architecture article at `/examples/<name>/`.

## Architecture

One Vercel project (the existing landing deployment, domain
`hermes-remote.tiscacatalin.com`):

- `apps/landing/api/[[...route]].ts` — hermes-remote as a Vercel Function:
  `createApp` from `@intheloop-studio/hermes-remote` exported as the fetch
  handler. Anonymous mode, per-IP rate limits, sandbox upstream + sandbox
  management. Same-origin `/api/*`... the function serves `/api/hermes/*`
  and the example clients use `baseUrl: "/api/hermes"` (a path-prefix strip
  wrapper around `app.fetch`).
- `apps/examples-backend/` — the sandbox package (unit-tested at 100% like
  all packages): `SandboxUpstream` (chat + runs backed by real Groq
  completions; discovery/sessions/jobs from seeded in-memory data),
  `sandboxManagement()` (FakeCliBridge preloaded with realistic CLI
  transcripts + FsBridge rooted in a per-instance temp dir seeded with demo
  SOUL.md/MEMORY.md/USER.md/skills/bundles), in-memory stores if the Bun
  runtime spike fails (see below).
- `apps/examples/<name>/` — six Vite + React apps (shadcn conventions like
  apps/chat, zinc dark), each built with `base: /examples/<name>/app/` and
  copied into the landing `dist` by the landing build script.
- `apps/landing/examples/` — the grid index page (React, no code samples)
  plus one article page per example.

### Spike (Task 0, decides one fork)

Deploy a minimal Bun-runtime function to a Vercel preview and verify:
(a) the function runs on Vercel's Bun runtime, (b) `bun:sqlite` works,
(c) streamed SSE responses flow. Outcomes:
- Bun + sqlite OK → backend uses real `ChatStore(":memory:")`/`RunStore()`.
- Bun OK, sqlite not → pure-JS in-memory stores implementing the same
  surfaces (cast where the types demand the concrete class).
- Bun runtime unavailable → same pure-JS stores on the Node runtime with
  Hono's fetch handler; `Bun.password`/`Bun.spawn` are never used by the
  sandbox (no KeyStore, FakeCliBridge only), so nothing else is Bun-bound.

## Sandbox backend behavior

- Principals: anonymous (per-IP) + Supabase user tokens (existing project
  `jhvuzxmhyyyovzgtdwvl`, `jwt` JWKS provider — serverless-safe). No API
  keys minted; the auth example demonstrates scopes with the anonymous +
  user tiers and a read-only "pretend key" explainer.
- `SandboxUpstream.chat` = `HermesAgent({ baseUrl: "https://api.groq.com/openai",
  apiKey: GROQ_API_KEY, model: "llama-3.1-8b-instant" })`.
- `SandboxUpstream.runs.create` executes one real Groq completion for the
  run input (capped tokens), stores status/output in memory, synthesizes
  `run.started/message.delta/run.completed` SSE for `events()`.
- discovery: capabilities/models/skills/toolsets return seeded sandbox
  fixtures naming the real model; health reports the sandbox.
- sessions/jobs: seeded in-memory demo data (a few realistic cron jobs).
- Management: config/memory/soul/profiles fully interactive against the
  seeded temp home; two profiles ("atlas", "nova") with distinct souls and
  memories so profile switching is visible. `commandRelay: false`.
- Guardrails: body/message caps tightened, per-IP rate limit (30/min),
  runs capped (~400 output tokens), `X-Sandbox: true` header note in docs,
  state resets whenever the function instance recycles (stated in the UI).

## The examples

| name | live behavior | article focus |
|---|---|---|
| `chat` | streaming chat, edit/regenerate, reactions, stop | `useChat` reducer flow, `client.conversation()`, SSE protocol |
| `auth` | Supabase anonymous/GitHub sign-in, whoami, live scope allow/deny table | tokenProvider, auth providers, principal model |
| `configuration` | config explorer/editor, MEMORY/USER editors with char budgets, SOUL editor | `useConfig`/`useMemory`/`useSoul`, CLI/FS bridges |
| `runs` | submit task, live event stream, run list, stop | `useRuns`/`useRunEvents`, run ownership |
| `profiles` | switch atlas/nova, watch soul/memory/config retarget | `useProfiles`, `withProfile`, X-Hermes-Profile |
| `command-center` | all panels at once + `/v1/events` ticker + goal panel (sandbox) + health/capabilities | composition of everything; `useEvents`, `useGoal`, `useAgentInfo` |

Every app: Vite + React + Tailwind v4 + shadcn-style components (copied
minimal primitives, no new UI kit), a shared banner ("live sandbox — free
model, state resets"), link back to its article and to `/examples/`.

## Index and articles

- `/examples/` — React grid: card per example with title, one-liner,
  feature tags, two actions ("Open live demo", "Read the architecture").
  No code on this page.
- `/examples/<name>/` — article pages (static HTML entries in the landing
  Vite build, same shell/nav as the site): the app's architecture,
  which hooks drive which panel, data flow, and short code excerpts with
  links to the source on GitHub. Snippets are parse-checked by the existing
  scripts/check-snippets.ts (extended to scan these articles).

## Build & deploy

- `apps/landing/package.json` build becomes: build example apps (loop) →
  vite build (landing incl. index + articles) → vitepress docs → copy
  example dists into `dist/examples/<name>/app/`.
- Example apps consume the workspace client/react packages
  (`workspace:*` links like apps/chat).
- CI (`test.yml`): typecheck + build examples; backend package joins the
  100%-coverage unit gate.
- Deploy: `bunx vercel deploy` preview for the spike + final
  `--prod` once `GROQ_API_KEY` is set (user adds it; SUPABASE_URL/anon key
  are public values wired into the auth example env).
- vercel.json gains the function config (runtime per spike outcome) and a
  route so `/api/hermes/*` reaches the function.

## Testing

- `apps/examples-backend`: unit tests, 100% coverage (Groq fetch faked).
- Example apps + index: typecheck + build in CI; the chat/auth flows also
  get a smoke test via the sandbox backend run locally under `bun test`
  (app.fetch against the sandbox composition, not browser tests).
- Live verification after deploy: curl the preview URL for status/chat SSE.

## Delivery

Spike → backend package → function + vercel config → chat example →
index + chat article → auth, configuration, runs, profiles (+articles) →
command-center (+article) → build pipeline + CI → deploy + env handoff →
HANDOFF/CHANGELOG.
