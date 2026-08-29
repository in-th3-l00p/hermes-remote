import { FakeCliBridge } from "@in-th3-l00p/hermes-remote";

const PROFILE_TABLE = ` Profile   Model                     Gateway    Alias    Distribution
 ─────────   ───────────────────────    ─────────    ──────    ────────────
 ◆default   groq/llama-3.1-8b         running    —        —
  atlas     groq/llama-3.1-8b         running    atlas    —
  nova      groq/llama-3.1-8b         running    nova     —
`;

const STATUS = `⚕ Hermes Sandbox Status
model: groq/llama-3.1-8b-instant
gateway: running (sandbox)
sessions: in-memory, resets on recycle
`;

const CONFIG_SHOW = `model:
  provider: groq
  name: llama-3.1-8b-instant
terminal:
  backend: disabled (sandbox)
agent:
  max_turns: 4
goals:
  max_turns: 6
`;

const RESPONSES: Record<string, { stdout: string } | { exitCode: number; stderr: string }> = {
  "profile list": { stdout: PROFILE_TABLE },
  status: { stdout: STATUS },
  doctor: { stdout: "sandbox: all checks pass (nothing real to break)" },
  "prompt-size": { stdout: "system prompt: 2.1 KB · tools: 3.4 KB (sandbox estimate)" },
  "config show": { stdout: CONFIG_SHOW },
  "config get model": { stdout: "groq/llama-3.1-8b-instant" },
  "config get": { stdout: "sandbox-value" },
  "config set": { stdout: "set (sandbox: not persisted across recycles)" },
  "config unset": { stdout: "unset (sandbox)" },
  "config check": { stdout: "config ok" },
  insights: {
    stdout:
      "last 7 days (sandbox): 128 turns · 41k input tokens · 9k output tokens · $0.00 (free tier)",
  },
  logs: { stdout: "2026-08-29 sandbox: gateway started\n2026-08-29 sandbox: examples deployed" },
  "gateway status": { stdout: "gateway: running (sandbox)\nplatforms: none connected" },
  "gateway list": { stdout: "default: running · atlas: running · nova: running" },
  "fallback list": { stdout: "1. groq/llama-3.1-8b-instant (primary, free)" },
  "moa show": { stdout: "moa: disabled in the sandbox" },
  "auth status": { stdout: "credential pools: 1 provider (groq), 1 key, healthy" },
  journey: { stdout: "2026-08-29 learned skill web-research\n2026-08-29 memory updated" },
  "memory status": { stdout: "external memory provider: none (file-based)" },
  "skin list": { stdout: "zinc (active) · aurora · terminal" },
  "checkpoints list": { stdout: "no checkpoints (sandbox has no workspace writes)" },
  "approvals history": { stdout: "no approval prompts recorded in the sandbox" },
  "hooks list": { stdout: "no hooks configured (sandbox)" },
  "hooks doctor": { stdout: "hooks: healthy (none configured)" },
  "webhook list": { stdout: "no webhook subscriptions" },
  "kanban list": {
    stdout: "#1 [doing] polish live examples (nova)\n#2 [todo] write launch thread (atlas)",
  },
  "project list": { stdout: "examples — /workspace/examples (sandbox)" },
  "mcp list": { stdout: "no mcp servers (sandbox)" },
  "plugins list": { stdout: "no plugins installed (sandbox)" },
  "pairing list": { stdout: "no pairing codes (sandbox)" },
  "skills pending": { stdout: "no pending skill writes" },
  "skills search": { stdout: "pdf — extract and summarize PDFs (official)\nsql — query databases (official)" },
  "curator status": { stdout: "curator: idle (sandbox)" },
  "cron runs": { stdout: "morning-briefing: completed 2026-08-29 07:00 (12s)" },
};

/** The sandbox CLI: canned hermes output, mutations acknowledged not executed. */
export function sandboxCli(): FakeCliBridge {
  const cli = new FakeCliBridge();
  for (const [prefix, result] of Object.entries(RESPONSES)) {
    cli.on(prefix, result);
    for (const profile of ["atlas", "nova", "default"]) {
      cli.on(`-p ${profile} ${prefix}`, result);
    }
  }
  return cli;
}
