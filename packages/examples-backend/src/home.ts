import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const SANDBOX_PROFILES = ["default", "atlas", "nova"] as const;
export type SandboxProfile = (typeof SANDBOX_PROFILES)[number];

interface ProfileSeed {
  soul: string;
  memory: string;
  user: string;
}

const SEEDS: Record<SandboxProfile, ProfileSeed> = {
  default: {
    soul: "# Hermes Sandbox\n\nYou are the hermes-remote live sandbox agent: helpful, brief, and honest about being a demo.\n",
    memory:
      "This is the shared sandbox profile.\nVisitors may edit this memory; it resets when the sandbox recycles.",
    user: "A visitor exploring the hermes-remote live examples.",
  },
  atlas: {
    soul: "# Atlas\n\nYou are Atlas, a meticulous research agent. You cite what you know and flag what you don't.\n",
    memory:
      "Atlas tracks long-running research threads.\nCurrent thread: mapping the hermes-remote API surface.",
    user: "Atlas reports to the platform team.",
  },
  nova: {
    soul: "# Nova\n\nYou are Nova, a fast creative sidekick. Short sentences. Bold ideas.\n",
    memory: "Nova keeps a scratchpad of campaign ideas.\nLatest: launch teaser for the live examples.",
    user: "Nova pairs with the design team.",
  },
};

const SKILL_WEB_RESEARCH = `---
name: web-research
description: Structured web research with source tracking
---

# Web research

1. Search broadly, then narrow.
2. Extract only from primary sources.
3. Record every source in references/sources.md.
`;

const SKILL_DAILY_BRIEFING = `---
name: daily-briefing
description: Compose the morning briefing from overnight activity
---

# Daily briefing

Summarize overnight sessions, open runs, and cron outcomes in five bullets.
`;

const BUNDLE_RESEARCH = `name: research
description: Research toolkit
skills:
  - web-research
  - daily-briefing
`;

/** Seeds a sandbox profile home; safe to call repeatedly. */
export function seedSandboxHome(root: string, profile: SandboxProfile): string {
  const seed = SEEDS[profile];
  const write = (rel: string, content: string): void => {
    const path = join(root, rel);
    mkdirSync(join(path, ".."), { recursive: true });
    writeFileSync(path, content);
  };
  write("SOUL.md", seed.soul);
  write("memories/MEMORY.md", seed.memory);
  write("memories/USER.md", seed.user);
  write("skills/web-research/SKILL.md", SKILL_WEB_RESEARCH);
  write(
    "skills/web-research/references/sources.md",
    "# Sources\n\n- hermes-agent.nousresearch.com/docs\n",
  );
  write("skills/daily-briefing/SKILL.md", SKILL_DAILY_BRIEFING);
  write("skill-bundles/research.yaml", BUNDLE_RESEARCH);
  write(
    "cron/output/morning-briefing/2026-08-29.md",
    "Sandbox briefing: all systems nominal; 2 demo sessions overnight.\n",
  );
  return root;
}
