import { defineConfig } from "vitepress";

export default defineConfig({
  title: "hermes remote",
  description: "Your Hermes agent, anywhere.",
  base: "/docs/",
  outDir: "../dist/docs",
  head: [["link", { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" }]],
  themeConfig: {
    nav: [
      { text: "Site", link: "https://hermes-remote.tiscacatalin.com" },
      { text: "Examples", link: "https://hermes-remote.tiscacatalin.com/examples/" },
      { text: "GitHub", link: "https://github.com/in-th3-l00p/hermes-remote" },
    ],
    sidebar: [
      { text: "Overview", link: "/" },
      {
        text: "Getting started",
        items: [
          { text: "Installation", link: "/guide/installation" },
          { text: "Quick start", link: "/guide/quick-start" },
        ],
      },
      {
        text: "Server",
        items: [
          { text: "CLI reference", link: "/server/cli" },
          { text: "Configuration", link: "/server/config" },
          { text: "API keys and scopes", link: "/server/scopes" },
          { text: "Rate limits and audit log", link: "/server/operations" },
        ],
      },
      {
        text: "Authentication",
        items: [
          { text: "Overview", link: "/auth/" },
          { text: "Supabase provider", link: "/auth/supabase" },
          { text: "Clerk provider", link: "/auth/clerk" },
          { text: "Custom providers", link: "/auth/custom" },
        ],
      },
      {
        text: "HTTP API",
        items: [
          { text: "Conventions", link: "/api/" },
          { text: "Chat sessions and SSE", link: "/api/chat" },
          { text: "Discovery", link: "/api/discovery" },
          { text: "Runs", link: "/api/runs" },
          { text: "Jobs (cron)", link: "/api/jobs" },
          { text: "Profiles", link: "/api/profiles" },
          { text: "Management (CLI-backed)", link: "/api/management" },
          { text: "Files: memory, soul, skills", link: "/api/files" },
          { text: "Goals and slash commands", link: "/api/goals" },
          { text: "Events", link: "/api/events" },
          { text: "Tools and passthrough", link: "/api/passthrough" },
        ],
      },
      {
        text: "Clients",
        items: [
          { text: "TypeScript client", link: "/clients/typescript" },
          { text: "React hooks", link: "/clients/react" },
        ],
      },
      {
        text: "Tutorials",
        items: [
          { text: "A chat app in React", link: "/tutorials/react-chat" },
          { text: "Authentication with Supabase", link: "/tutorials/supabase-auth" },
          { text: "Authentication with Clerk", link: "/tutorials/clerk-auth" },
          { text: "Custom auth providers", link: "/tutorials/custom-auth" },
          { text: "Deploying", link: "/tutorials/deploying" },
          { text: "The raw API", link: "/tutorials/raw-api" },
        ],
      },
      {
        text: "How it was built",
        items: [
          { text: "Architecture", link: "/internals/architecture" },
          { text: "Security model", link: "/internals/security" },
          { text: "Engineering practices", link: "/internals/engineering" },
        ],
      },
    ],
    footer: {
      message: "MIT licensed",
      copyright: "✧ tiscacatalin.com",
    },
  },
});
