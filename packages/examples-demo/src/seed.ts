import type {
  DemoEvent,
  DemoJob,
  DemoProfileHome,
  DemoProfileInfo,
  DemoRun,
  DemoSession,
} from "./types.ts";

export const DEMO_VERSION = "1.0.0";

export const PROFILE_NAMES = ["default", "work", "research"] as const;
export type ProfileName = (typeof PROFILE_NAMES)[number];

export const PROFILES: DemoProfileInfo[] = [
  {
    name: "default",
    isDefault: true,
    model: "hermes-4-405b",
    gateway: "running",
    alias: null,
    distribution: null,
  },
  {
    name: "work",
    isDefault: false,
    model: "hermes-4-405b",
    gateway: "running",
    alias: "wrk",
    distribution: null,
  },
  {
    name: "research",
    isDefault: false,
    model: "hermes-4-70b",
    gateway: "stopped",
    alias: null,
    distribution: null,
  },
];

const DEFAULT_HOME: DemoProfileHome = {
  soul: `# Indra

You are Indra, Catalin's daily-driver agent. You live on his workstation with
terminal, files, and web access. Be direct, keep answers short, prefer showing
the command you ran over describing it. When something fails, paste the error
before theorizing. Never push to main.
`,
  memory: `Catalin ships hermes-web from this machine; deploys go out Friday mornings after the smoke suite passes.
Staging runs in eu-central-1, production in us-east-1; kubectl contexts are stg and prod.
Prefers Bun over Node for every new script, TypeScript strict mode always.
The flaky login spec traces back to a shared Redis fixture; workaround is FLUSHDB in beforeEach.
Postgres slow queries usually mean the sessions table again; check pg_stat_statements first.
Alert emails route to ops@ but he only reads the #alerts Slack channel.`,
  user: `Catalin. Backend-leaning full-stack developer, works from Cluj, usually online 09:00-18:00 EET.
Likes terse answers with commands he can paste. Reviews PRs in the morning.
Current focus: the hermes-web release and taming the staging cluster.`,
  status: `⚕ Hermes Status
profile: default
model: nous/hermes-4-405b (128k context)
gateway: running · api server on 127.0.0.1:8642
sessions: 214 stored · last activity 6 minutes ago
memory: MEMORY.md 41% · USER.md 22%
cron: 3 jobs scheduled · last run morning-briefing (ok)
`,
  config: {
    "model.provider": "nous",
    "model.name": "hermes-4-405b",
    "model.context_length": "128000",
    "terminal.backend": "local",
    "terminal.timeout": "120",
    "agent.max_turns": "30",
    "compression.enabled": "true",
    "memory.write_approval": "false",
    "gateway.api_server.enabled": "true",
  },
};

const WORK_HOME: DemoProfileHome = {
  soul: `# Foreman

You are Foreman, the work profile. You only touch the hermes-web monorepo and
its infrastructure. Review diffs ruthlessly, insist on tests, and refuse to
run anything against production without an explicit confirmation in the same
message.
`,
  memory: `CI is GitHub Actions; the release workflow publishes on v* tags, never from a branch.
Coverage threshold is 1.0 and it is not negotiable; add explicit constructors when Bun miscounts.
The Vercel project deploys from the repo root, root directory apps/landing.
Open thread: the sessions table index rebuild is scheduled for Saturday.`,
  user: `Same human as the default profile, wearing the maintainer hat.
Wants risk called out loud: schema changes, key rotation, anything touching auth.`,
  status: `⚕ Hermes Status
profile: work
model: nous/hermes-4-405b (128k context)
gateway: running · api server on 127.0.0.1:8642
sessions: 87 stored · last activity 2 hours ago
memory: MEMORY.md 33% · USER.md 15%
cron: 1 job scheduled · dependency-audit (ok)
`,
  config: {
    "model.provider": "nous",
    "model.name": "hermes-4-405b",
    "model.context_length": "128000",
    "terminal.backend": "docker",
    "terminal.timeout": "300",
    "agent.max_turns": "50",
    "compression.enabled": "true",
    "memory.write_approval": "true",
    "gateway.api_server.enabled": "true",
  },
};

const RESEARCH_HOME: DemoProfileHome = {
  soul: `# Archivist

You are Archivist, the research profile. You read papers, changelogs, and
long documents, then compress them without losing the load-bearing details.
Cite the section you took each claim from. Say "the paper does not address
this" instead of guessing.
`,
  memory: `Reading queue lives in ~/reading/queue.md; summaries go to ~/reading/notes/ one file per source.
Catalin cares about agent evaluation methods and SSE/streaming protocol design right now.
Summaries follow the format: three-line abstract, key claims with citations, open questions.`,
  user: `Catalin in reading mode, usually evenings and weekends.
Prefers summaries he can skim in two minutes, with links back to the source.`,
  status: `⚕ Hermes Status
profile: research
model: nous/hermes-4-70b (128k context)
gateway: stopped (started on demand)
sessions: 41 stored · last activity yesterday
memory: MEMORY.md 27% · USER.md 18%
cron: no jobs scheduled
`,
  config: {
    "model.provider": "nous",
    "model.name": "hermes-4-70b",
    "model.context_length": "128000",
    "terminal.backend": "local",
    "terminal.timeout": "120",
    "agent.max_turns": "20",
    "compression.enabled": "true",
    "memory.write_approval": "false",
    "gateway.api_server.enabled": "false",
  },
};

export const HOMES: Record<ProfileName, DemoProfileHome> = {
  default: DEFAULT_HOME,
  work: WORK_HOME,
  research: RESEARCH_HOME,
};

export const MODELS = {
  object: "list",
  data: [
    { id: "hermes-4-405b", object: "model", owned_by: "nous" },
    { id: "hermes-4-70b", object: "model", owned_by: "nous" },
    { id: "hermes-3-llama-3.1-70b", object: "model", owned_by: "nous" },
  ],
};

export const UPSTREAM_HEALTH = {
  status: "ok",
  platform: "hermes-gateway",
  version: "0.20.4",
  model: "hermes-4-405b",
};

export const UPSTREAM_CAPABILITIES = {
  object: "hermes.capabilities",
  platform: "hermes-gateway",
  version: "0.20.4",
  model: "hermes-4-405b",
  features: {
    chat_completions: true,
    run_submission: true,
    audio_api: false,
    sessions: true,
  },
};

export const JOBS: DemoJob[] = [
  {
    id: "job_morning",
    name: "morning-briefing",
    schedule: "0 7 * * *",
    prompt: "Summarize overnight sessions, alerts, and open runs in five bullets.",
    status: "active",
    last_run: "completed in 14s",
  },
  {
    id: "job_deps",
    name: "dependency-audit",
    schedule: "0 6 * * 1",
    prompt: "Audit lockfiles for new advisories and open an issue per finding.",
    status: "active",
    last_run: "completed in 41s",
  },
  {
    id: "job_inbox",
    name: "inbox-triage",
    schedule: "*/30 9-18 * * 1-5",
    prompt: "Label new GitHub notifications and flag anything blocking the release.",
    status: "paused",
    last_run: "completed in 9s",
  },
];

interface SessionSeed {
  id: string;
  title: string;
  minutesAgo: number;
  turns: [string, string][];
}

const SESSION_SEEDS: SessionSeed[] = [
  {
    id: "9f21c8a4d301",
    title: "Friday deploy checklist for staging",
    minutesAgo: 38,
    turns: [
      [
        "Run the Friday deploy checklist for staging.",
        "Checklist done:\n\n1. `bun test`: 457 pass, coverage 100%\n2. `git log origin/main..HEAD`: 3 commits, all reviewed\n3. Smoke suite against staging: 12/12 green\n4. Pending migrations: none\n\nStaging is clear to promote. Want me to tag the release?",
      ],
      [
        "Yes, tag it and watch the pipeline.",
        "Tagged v3.2.1 and pushed. The release workflow is running: tests passed, publish step in progress. I will ping you here if anything goes red; ETA about four minutes.",
      ],
    ],
  },
  {
    id: "b4e07d2f5c19",
    title: "Digging into the flaky login spec",
    minutesAgo: 190,
    turns: [
      [
        "The login spec failed again on CI but passes locally. Can you dig in?",
        "Pulled the last five CI runs. It only fails when `auth.spec.ts` runs after `rate-limit.spec.ts`. The rate limiter leaves a counter for the same test IP in Redis, and the login attempt hits 429.\n\nLocally you run specs in isolation, so the counter never carries over.",
      ],
      [
        "So the fixture is shared. What is the clean fix?",
        "Two options:\n\n1. Quick: `FLUSHDB` in a global `beforeEach`, one line, hides future leaks.\n2. Right: give each spec file its own Redis key prefix via the test worker id.\n\nI would do 2; I can push a branch with the prefix wired through the limiter config.",
      ],
      [
        "Push the branch, I will review after lunch.",
        "Pushed `fix/redis-prefix-per-worker` with the limiter change and a regression test that runs both specs back to back. CI is green across 3 retries. PR #214 is open with a summary of the root cause.",
      ],
    ],
  },
  {
    id: "77aa39e1f0b2",
    title: "Postgres slow query triage",
    minutesAgo: 1460,
    turns: [
      [
        "API latency spiked around 14:00. Check if it is the database again.",
        "It is. `pg_stat_statements` shows `SELECT ... FROM sessions WHERE user_id = $1 ORDER BY updated_at DESC` at 2.3s mean, up from 40ms. The partial index on `(user_id, updated_at)` was dropped by yesterday's migration and the planner fell back to a seq scan on 9M rows.",
      ],
      [
        "Recreate it concurrently and confirm.",
        "Done: `CREATE INDEX CONCURRENTLY sessions_user_updated_idx ...` finished in 3m41s. Mean query time is back to 38ms and p99 API latency dropped to 210ms. I added the index to the migration baseline so it cannot silently vanish again.",
      ],
    ],
  },
  {
    id: "e5d1a6b90c47",
    title: "Overnight error log summary",
    minutesAgo: 2900,
    turns: [
      [
        "Summarize last night's error logs from staging.",
        "312 errors between 00:00 and 08:00, three distinct causes:\n\n- 291 x `ECONNRESET` from the image proxy, an upstream CDN blip between 02:11 and 02:19, self-recovered\n- 19 x `429` from the auth rate limiter, one IP retrying a bad token in a loop\n- 2 x `TypeError` in the webhook signer, new, introduced by Tuesday's deploy\n\nOnly the webhook signer needs action; the stack points at a null `signing_key` when a hook has no secret configured.",
      ],
    ],
  },
];

function shift(base: Date, minutes: number): string {
  return new Date(base.getTime() - minutes * 60_000).toISOString();
}

export function seedSessions(now: Date): DemoSession[] {
  return SESSION_SEEDS.map((seed) => {
    const created = shift(now, seed.minutesAgo + seed.turns.length * 4);
    let minute = seed.minutesAgo + seed.turns.length * 4;
    const messages = seed.turns.flatMap(([user, assistant], index) => {
      minute -= 3;
      const userAt = shift(now, minute);
      minute -= 1;
      const assistantAt = shift(now, minute);
      return [
        {
          id: `${seed.id}${index}a`,
          role: "user" as const,
          content: user,
          attachments: [],
          reactions: {},
          createdAt: userAt,
          editedAt: null,
          status: "done" as const,
        },
        {
          id: `${seed.id}${index}b`,
          role: "assistant" as const,
          content: assistant,
          attachments: [],
          reactions: {},
          createdAt: assistantAt,
          editedAt: null,
          status: "done" as const,
        },
      ];
    });
    return {
      id: seed.id,
      userId: null,
      title: seed.title,
      createdAt: created,
      updatedAt: shift(now, seed.minutesAgo),
      messages,
    };
  });
}

interface RunSeed {
  run: Omit<DemoRun, "created_at">;
  minutesAgo: number;
}

const RUN_SEEDS: RunSeed[] = [
  {
    minutesAgo: 55,
    run: {
      id: "run_7f3a91",
      status: "completed",
      input: "Audit the repo's npm dependencies for known CVEs",
      output:
        "Audited 214 packages. 2 advisories:\n\n- undici 6.19.2 to 6.21.1 (moderate, header smuggling), a patch bump with no API change\n- vite 6.0.3 to 6.0.9 (low, dev-server path traversal), dev-only\n\nOpened PR #217 bumping both; CI is green.",
    },
  },
  {
    minutesAgo: 130,
    run: {
      id: "run_c25b04",
      status: "completed",
      input: "Rebuild the staging search index",
      output:
        "Reindexed 1.2M documents in 11m32s. Zero-downtime swap: built into search_v9, flipped the alias, dropped search_v8. Query smoke tests pass; p95 search latency 48ms.",
    },
  },
  {
    minutesAgo: 320,
    run: {
      id: "run_98d2e6",
      status: "failed",
      input: "Publish the docs site to production",
      output:
        "Build failed at the snippet check: docs/guide/streaming.md has a TypeScript fence that no longer compiles (`stopTurn` renamed). Fix the snippet and rerun; nothing was deployed.",
    },
  },
  {
    minutesAgo: 480,
    run: {
      id: "run_4b1c77",
      status: "stopped",
      input: "Migrate the analytics events table to the new schema",
      output:
        "Stopped at your request after the dry run. The dry run report is in ~/migrations/analytics-dryrun.md; no rows were modified.",
    },
  },
];

export function seedRuns(now: Date): DemoRun[] {
  return RUN_SEEDS.map((seed) => ({
    ...seed.run,
    created_at: shift(now, seed.minutesAgo),
  }));
}

const EVENT_SEEDS: [number, string, Record<string, unknown>][] = [
  [55, "run.created", { id: "run_7f3a91" }],
  [44, "run.completed", { id: "run_7f3a91" }],
  [38, "session.started", { session: "9f21c8a4d301" }],
  [36, "turn.completed", { session: "9f21c8a4d301" }],
  [33, "cron.completed", { job: "morning-briefing" }],
  [21, "memory.updated", { file: "memories/MEMORY.md" }],
];

export function seedEvents(now: Date): DemoEvent[] {
  return EVENT_SEEDS.map(([minutes, type, data]) => ({
    type,
    at: shift(now, minutes),
    data,
  }));
}

/** Renders a flat dotted-key config map the way `hermes config show` prints YAML. */
export function renderConfig(config: Record<string, string>): string {
  const groups = new Map<string, string[]>();
  for (const key of Object.keys(config).sort()) {
    const dot = key.indexOf(".");
    const head = dot === -1 ? key : key.slice(0, dot);
    const rest = dot === -1 ? null : key.slice(dot + 1);
    const lines = groups.get(head) ?? [];
    lines.push(rest === null ? `${head}: ${config[key]}` : `  ${rest}: ${config[key]}`);
    groups.set(head, lines);
  }
  const out: string[] = [];
  for (const [head, lines] of groups) {
    if (lines.length === 1 && !(lines[0] as string).startsWith("  ")) {
      out.push(lines[0] as string);
    } else {
      out.push(`${head}:`, ...lines);
    }
  }
  return `${out.join("\n")}\n`;
}
