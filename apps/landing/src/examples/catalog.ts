export interface ExampleCard {
  slug: string;
  title: string;
  blurb: string;
  /** Hooks and client methods the example is about. */
  tags: string[];
  /** Has a runnable app at /examples/<slug>/app/. */
  live?: boolean;
}

/** The showcase comes first; the rest are written recipes. */
export const EXAMPLES: ExampleCard[] = [
  {
    slug: "chat",
    title: "The reference chat app",
    blurb:
      "Streaming replies, image attachments, reactions, editing, stop, and a chat list you can search, rename and archive. Works on phones and with screen readers.",
    tags: ["useChat", "searchSessions", "tokenProvider"],
    live: true,
  },
  {
    slug: "auth",
    title: "Signing users in",
    blurb: "Hand the client a token provider, check who the server thinks you are, and see which routes a user may reach.",
    tags: ["tokenProvider", "whoami", "scopes"],
  },
  {
    slug: "runs",
    title: "Long-running tasks",
    blurb: "Start agent runs, follow their event streams, and stop them, with each visitor seeing only their own.",
    tags: ["useRuns", "useRunEvents"],
  },
  {
    slug: "configuration",
    title: "Agent settings from a dashboard",
    blurb: "Read and change the agent's config, memory and SOUL.md with an API key that holds exactly those scopes.",
    tags: ["useConfig", "useMemory", "useSoul"],
  },
  {
    slug: "profiles",
    title: "Several agents in one app",
    blurb: "Point every call at a different Hermes profile with one header, and pin keys to a profile.",
    tags: ["useProfiles", "withProfile"],
  },
  {
    slug: "command-center",
    title: "An operator console",
    blurb: "Chat, runs, memory, config, health and the live event stream together, for the person running the agent.",
    tags: ["useEvents", "useAgentInfo", "useAgentStatus"],
  },
];
