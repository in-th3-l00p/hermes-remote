export interface ExampleCard {
  slug: string;
  title: string;
  blurb: string;
  tags: string[];
}

export const EXAMPLES: ExampleCard[] = [
  {
    slug: "chat",
    title: "Chat",
    blurb:
      "Streaming conversations: edit, react, regenerate, and stop mid-stream.",
    tags: ["useChat", "useSessions", "SSE"],
  },
  {
    slug: "auth",
    title: "Auth",
    blurb:
      "Sign in with Supabase, inspect your principal, and watch scopes allow and deny in real time.",
    tags: ["tokenProvider", "auth providers", "scopes"],
  },
  {
    slug: "configuration",
    title: "Configuration",
    blurb:
      "Edit the agent's config, memory files, and SOUL.md through the CLI and filesystem bridges.",
    tags: ["useConfig", "useMemory", "useSoul"],
  },
  {
    slug: "runs",
    title: "Runs",
    blurb:
      "Submit long-running agent tasks, stream their event feeds, and stop them, with per-visitor ownership.",
    tags: ["useRuns", "useRunEvents"],
  },
  {
    slug: "profiles",
    title: "Profiles",
    blurb:
      "Switch between isolated agent profiles and watch every panel retarget through one header.",
    tags: ["useProfiles", "withProfile"],
  },
  {
    slug: "command-center",
    title: "Command center",
    blurb:
      "The full agentic integration: chat, runs, memory, soul, config, health, and a live event ticker on one screen.",
    tags: ["everything", "useEvents", "useAgentInfo"],
  },
];
