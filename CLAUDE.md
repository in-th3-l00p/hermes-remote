# CLAUDE.md — hermes-web

## What this project is

**hermes-web** makes it easy to put a [Hermes agent](https://hermes-agent.nousresearch.com) on the web. It has three deliverables, all TypeScript:

1. **`hermes-api`** — a Bun HTTP server that connects to a local Hermes agent instance and exposes it to the web with authentication and authorization. It is a secure facade over *everything* Hermes can do (see the feature catalog below), not just chat.
2. **`hermes.ts`** — a TypeScript client library for consuming the hermes-api.
3. **`react-hermes`** — React hooks that make integrating the hermes-api automatic.

See `ARCHITECTURE.md` for the package layout, the full API endpoint map, and how the server bridges to the local Hermes instance.

**Start with `HANDOFF.md`** — it records the actual state of the project as shipped (v1.0.0, released as "Hermes Remote"), where it diverges from ARCHITECTURE.md, all external infrastructure (GitHub, Vercel, Supabase, GitHub Packages), the release process, known pitfalls, and the roadmap.

## Project conventions

- **Runtime/tooling:** Bun everywhere (`bun install`, `bun test`, `bun run`). TypeScript across all packages, strict mode.
- **Testing:** 100% test coverage is mandatory at all times. Two tiers:
  - **Unit tests** — no external dependencies; the Hermes backend is mocked/faked.
  - **Integration tests** — require a running Hermes agent instance (its gateway/API server); kept in separate files (`*.integration.test.ts`) so they can be skipped when no instance is available.
- Every feature of the Hermes agent must have a corresponding API surface in `hermes-api`, a typed client method in `hermes.ts`, and (where it makes sense for UI) a hook in `react-hermes`.

---

# The Hermes Agent — feature reference

Everything below is distilled from the official wiki (`hermes-agent.nousresearch.com/docs`). This is the feature surface the hermes-api must cover.

## What Hermes is

Hermes Agent is Nous Research's open-source AI CLI agent: chat with LLMs, automate workflows, and connect messaging platforms (Telegram, Discord, Slack, WhatsApp, Teams). It has access to terminal, files, web search, browser automation, and many other tools while maintaining conversation context. Runs on Linux, macOS, WSL2, Windows, and Android (Termux). Entry points: `hermes` (classic CLI), `hermes --tui`, `hermes desktop` (Electron GUI), `hermes dashboard` (browser UI), `hermes gateway` (messaging + API service), `hermes serve` (headless backend for remote clients).

## Local layout (`~/.hermes/`)

| Path | Purpose |
|---|---|
| `config.yaml` | All non-secret settings |
| `.env` | API keys and secrets (e.g. `API_SERVER_KEY`) |
| `auth.json` | OAuth provider credentials |
| `SOUL.md` | Agent identity / personality (system prompt) |
| `memories/` | `MEMORY.md` + `USER.md` persistent memory files |
| `skills/` | Skill folders (`SKILL.md` + `references/`, `scripts/`, …) |
| `skill-bundles/` | Bundle YAML files |
| `sessions/`, `state.db` | Session transcripts + SQLite session DB (FTS5 search, goal state in `state_meta`) |
| `cron/jobs.json`, `cron/executions.db`, `cron/output/` | Cron job definitions, run history, outputs |
| `hooks/` | Gateway event-hook directories (`HOOK.yaml` + `handler.py`) |
| `shell-hooks-allowlist.json` | Consent decisions for shell hooks |
| `logs/` | Agent/gateway/error logs |

Profiles (`hermes profile create/use/delete`, `-p <name>`) give fully isolated instances, each with its own `~/.hermes-<profile>/` directory.

## Configuration

- Managed via `hermes config show|edit|get|set|unset|check|migrate`. `set` routes secrets to `.env` and everything else to `config.yaml`.
- Precedence: CLI args → `config.yaml` → `.env` → built-in defaults. `${VAR_NAME}` env substitution supported in YAML.
- Major sections: `model` (provider/name/context_length), `terminal` (backend: local|docker|ssh|modal|daytona|vercel_sandbox|singularity, timeout, cwd), `agent` (max_turns, api_max_retries, run_budget_seconds, verify_on_stop), `compression` (enabled, threshold, target_ratio, protect_last_n), `tool_output` limits, `memory`, `skills`, `delegation`, `goals`, `hooks`, `gateway.api_server`, `auxiliary` (separate models for vision/compression/goal_judge etc.).
- Provider features: provider routing, fallback provider chains (`hermes fallback`), credential pools with rotation (`hermes auth`), prompt caching (1h prefix cache for Claude), Mixture-of-Agents presets (`hermes moa`), model selection (`hermes model`, `/model` in-session).

## Tools & toolsets

Tools are grouped into toolsets, enabled per platform (`hermes tools`, `hermes chat --toolsets "web,terminal"`). Toolsets: `web`/`search`, `terminal`/`file`, `browser`, `vision`, `image_gen`, `tts`, `todo`, `clarify`, `code_execution`, `delegation`, `memory`, `session_search`, `cronjob`, integrations (`homeassistant`, `spotify`, `discord`), and dynamic `mcp-<server>` toolsets. MCP servers connect via stdio or HTTP (`hermes mcp`).

## Skills system

On-demand knowledge documents with progressive disclosure (agentskills.io standard). Stored in `~/.hermes/skills/` as folders with `SKILL.md` (YAML frontmatter: name, description, version, platforms, `metadata.hermes` with tags/category/requires_toolsets/fallback_for_toolsets/config, `required_environment_variables`).

- **Loading tiers:** `skills_list()` (metadata) → `skill_view(name)` (full content) → `skill_view(name, path)` (reference files).
- **Invocation:** slash commands (`/skill-name args`, chainable up to 5), natural conversation, `/learn <path|url|pdf>` to auto-author skills from sources.
- **Agent-managed:** `skill_manage` tool with actions `create|patch|edit|delete|write_file|remove_file`; optional approval gating (`skills.write_approval`) with `/skills pending|approve|reject`.
- **Hub:** `hermes skills browse|search|inspect|install|check|update|audit|uninstall|reset|trust|untrust|opt-out|opt-in`; sources: `official`, `skills-sh`, `well-known`, GitHub repos/taps (`hermes skills tap add`), direct URLs. All hub installs get security scanning; trust levels: builtin → official → trusted → community.
- **Bundles:** group skills under one slash command; YAML in `~/.hermes/skill-bundles/`; `hermes bundles create|list|delete`, `/bundles list|show`.
- **Project-local skills** in `.hermes/skills/` or `.agents/skills/`, gated by per-repo trust. External dirs configurable via `skills.external_dirs`.
- **Curator:** `hermes curator` does background skill maintenance (review, prune, archive).

## Memory

- Two bounded files injected into the system prompt as a frozen snapshot at session start: `MEMORY.md` (2,200 chars, agent notes) and `USER.md` (1,375 chars, user profile).
- `memory` tool actions: `add`, `replace`, `remove` (no `read` — content is in the prompt). Overflow returns an error; the agent must consolidate.
- Config: `memory_enabled`, `user_profile_enabled`, `write_approval`, `memory_char_limit`, `user_char_limit`.
- `session_search` tool: FTS5 full-text search over all past sessions (unlimited, zero token cost).
- Learning Journey: `hermes journey` / `/journey` timeline of skills + memory entries with edit/delete.
- Background review: automatic post-turn self-improvement that can save learnings.
- External memory providers: Honcho, Mem0, Hindsight, etc. (`hermes memory`), as memory-provider plugins.

## Sessions & checkpoints

- Stored in SQLite (`~/.hermes/state.db`): metadata (ID, title, timestamps, token counters), full message history, lineage across compression/resume, FTS index.
- Resume: `--continue`/`-c [name]`, `--resume <id|title|latest>`, `--in <dir>` for per-workspace latest. Full history is restored.
- Management: `hermes sessions list|export|delete|prune|archive|rename`; in-session `/title`, `/sessions`, `/status`, `/context`, `/busy [queue|steer|interrupt|status]`.
- Compression: auto-summarizes middle turns near the context limit (first 3 + last 20 turns preserved), configurable.
- Checkpoints: automatic working-directory snapshots (shadow git store) before file changes; `/rollback` to revert; `hermes checkpoints` to inspect/prune.

## Persistent goals (`/goal`)

Standing objective that survives across turns ("Ralph loop"): after every turn a lightweight judge model (auxiliary `goal_judge`) returns `{"verdict": "done"|"continue"|"wait"}` and the loop auto-continues until done, paused, or budget exhausted (`goals.max_turns`, default 20).

- Commands: `/goal <text>`, `/goal draft <text>` (auto-expand into a contract), `/goal show`, `/goal pause|resume|clear`, `/goal gate add <command>`, `/goal wait <pid>`, `/goal unwait`.
- Completion contracts: optional fields `outcome`, `verification`, `constraints`, `boundaries`, `stop_when`.
- Quality gates: deterministic shell commands that must pass before completion (retries, timeouts, git-fingerprint skip, auto-pause on exhaustion).
- `wait` verdict parks the loop on background processes (`wait_on_pid`, `wait_on_session`, `wait_for_seconds`).
- Goal state persists in `SessionDB.state_meta` keyed by session — resuming a session restores its goal.

## Scheduled tasks (cron)

Unified `cronjob` tool + `hermes cron` CLI + `/cron add` in chat.

- Schedules: relative one-shots (`30m`), intervals (`every 2h`), cron expressions (`0 9 * * *`), ISO timestamps.
- Options: pinned model/provider and reasoning effort per job, attached skills, `--workdir`, `--no-agent` (script-only), `continuity` (inject previous output), `context_from` (chain job outputs), pre-check `script=` that can emit `{"wakeAgent": false}` to skip the LLM.
- Delivery: `origin`, `local` (`~/.hermes/cron/output/`), platform targets (`telegram,discord,...`), `all`, `bot-chat`; `[SILENT]` suppresses delivery; `mirror_delivery` makes jobs continuable in chat.
- Lifecycle: `hermes cron create|list|pause|resume|run|remove|edit|runs`. Gateway scheduler ticks every 60s from `jobs.json`; execution history in `executions.db` (states: claimed, running, completed, failed, unknown; `blocked_config` on validation failure).
- Safety: prompt injection/exfiltration scanning at creation, model-drift guard for unpinned jobs, `allow_agent_scheduling` opt-in for agent-managed jobs.

## Event hooks

Four systems:

1. **Gateway event hooks** — Python dirs under `~/.hermes/hooks/` (`HOOK.yaml` + `handler.py`); events: `gateway:startup`, `session:start`, `session:end`, compression, `agent:start|step|end`, emoji reactions, slash commands.
2. **Plugin hooks** — registered via `ctx.register_hook()`; key events: `pre_tool_call` (block/approve/modify), `post_tool_call`, `pre_llm_call` (inject context), `transform_llm_output`, `pre_verify`, `pre_gateway_dispatch`, kanban lifecycle (`kanban_task_claimed|completed|blocked`), `subagent_start|stop`.
3. **Shell hooks** — declared under `hooks:` in `config.yaml` (matcher, command, timeout, `fail_closed`); JSON over stdin/stdout; exit code 2 blocks a tool call. Consent model: first-use prompt per `(event, command)` pair persisted to `shell-hooks-allowlist.json`; bypass via `--accept-hooks` / `HERMES_ACCEPT_HOOKS=1` / `hooks_auto_accept`.
4. **Outbound webhooks** — `hooks.outbound:` list pushes signed lifecycle events (POST + cryptographic signature) to external HTTP endpoints.

Management: `hermes hooks list|test <event>|revoke <command>|doctor`. Also `hermes webhook` for dynamic event-driven activation subscriptions.

## Subagent delegation

`delegate_task(goal, context)` spawns isolated children (fresh context, inherited toolsets minus `delegate_task`/`clarify`/`memory`/`send_message`/`cronjob`); parallel batches (default 3 concurrent, 50 iterations/child); background execution with results posted back; `role="orchestrator"` + `max_spawn_depth` for nesting; steer/stop running children; `/agents` monitor with cost rollups; live transcripts under `~/.hermes/cache/delegation/live/`; optional per-child git worktree isolation; per-delegation model override for cost control. Related: `execute_code` (agent-written Python calling Hermes tools over sandboxed RPC) and batch processing (hundreds/thousands of prompts in parallel producing trajectory data).

## Built-in API server (the integration point for this project)

Enable with `API_SERVER_ENABLED=true` + `API_SERVER_KEY=...` in `~/.hermes/.env`, then run `hermes gateway`. Listens on `http://127.0.0.1:8642`. Bearer-token auth on every request; optional `API_SERVER_CORS_ORIGINS`. Config also under `gateway.api_server:` in config.yaml; per-profile keys.

Endpoints:
- `POST /v1/chat/completions` — OpenAI-compatible, streaming SSE with custom `hermes.tool.progress` events, inline images (no file uploads).
- `POST /v1/responses` — server-side conversation state via `previous_response_id` (max 100 stored, LRU).
- `POST /v1/runs` — long-running agent tasks; `run_id` + SSE event subscription, status polling, stop, approval handling; default 10 concurrent (`max_concurrent_runs`).
- `GET /v1/models`, `GET /api/model/options` — model discovery.
- `GET /v1/capabilities` — machine-readable feature set.
- `/api/sessions/*` — create, list, read metadata, update titles, fork branches, run individual turns.
- `/api/jobs` — schedule/manage background runs (pause/resume/trigger).
- `GET /v1/skills`, `GET /v1/toolsets` — capability enumeration.

Security note: the API grants full access to the agent's toolset including terminal — the bearer key is mandatory and hermes-api must never expose it to browsers.

## Other features (secondary for this project)

- **Messaging platforms:** `hermes gateway` connects Telegram, Discord, Slack, WhatsApp (incl. Business Cloud), Teams; `hermes send` (one-shot delivery), `hermes pairing` (access codes), `hermes peer` (bot-to-bot DMs).
- **Kanban:** `hermes kanban` multi-profile collaboration board with task dispatch and lifecycle hooks.
- **Media/web:** voice mode, wake word ("Hey Hermes"), TTS (10 providers), vision/image paste, image generation (FAL.ai, 11 models), browser automation (Browserbase, Browser Use, local Chrome/Chromium).
- **Customization:** SOUL.md personality + `/personality` presets, skins/themes, plugins (general, memory provider, context engine), pets (`hermes pets`, `/hatch`).
- **Dev/ops:** `hermes status`, `doctor`, `dump`, `insights` (token/cost analytics), `logs`, `backup`/`import`, `security audit`, `approvals`, `lsp`, `acp` (IDE integration), `proxy`, `egress`, `prompt-size`, context files (AGENTS.md, .hermes.md, .cursorrules) and `@` context references (files, folders, git diffs, URLs).
