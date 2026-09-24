import { defineConfig } from "vitepress";

export default defineConfig({
  title: "Hermes Remote",
  description: "Put your Hermes agent on the web: an authenticated API server, a typed client and React hooks.",
  base: "/docs/",
  outDir: "../dist/docs",
  head: [["link", { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" }]],
  themeConfig: {
    logo: "/star.svg",
    siteTitle: "hermes remote",
    search: { provider: "local" },
    editLink: {
      pattern: "https://github.com/in-th3-l00p/hermes-remote/edit/main/apps/landing/docs/:path",
      text: "Edit this page on GitHub",
    },
    outline: { level: [2, 3] },
    nav: [
      { text: "Home", link: "https://hermes-remote.tiscacatalin.com" },
      { text: "Examples", link: "https://hermes-remote.tiscacatalin.com/examples/" },
      { text: "GitHub", link: "https://github.com/in-th3-l00p/hermes-remote" },
    ],
    sidebar: [
      {
        text: "Start",
        items: [
          { text: "What Hermes Remote is", link: "/" },
          { text: "Installation", link: "/guide/installation" },
          { text: "Quick start", link: "/guide/quick-start" },
          { text: "Compatibility", link: "/guide/compatibility" },
        ],
      },
      {
        text: "Secure it",
        items: [
          { text: "API keys and scopes", link: "/server/scopes" },
          { text: "Signing users in", link: "/auth/" },
          { text: "Supabase", link: "/auth/supabase" },
          { text: "Clerk", link: "/auth/clerk" },
          { text: "Any JWT issuer", link: "/auth/custom" },
          { text: "Token exchange", link: "/auth/token-exchange" },
        ],
      },
      {
        text: "Build with it",
        items: [
          { text: "TypeScript client", link: "/clients/typescript" },
          { text: "React hooks", link: "/clients/react" },
          { text: "A chat app in React", link: "/tutorials/react-chat" },
          { text: "From any language (HTTP API)", link: "/tutorials/raw-api" },
        ],
      },
      {
        text: "Deploy and operate",
        items: [
          { text: "Deploying", link: "/tutorials/deploying" },
          { text: "Configuration", link: "/server/config" },
          { text: "CLI reference", link: "/server/cli" },
          { text: "Limits, audit log and metrics", link: "/server/operations" },
          { text: "Hardening checklist", link: "/server/hardening" },
          { text: "Troubleshooting", link: "/guide/troubleshooting" },
        ],
      },
      {
        text: "API reference",
        collapsed: false,
        items: [
          { text: "Conventions, errors and OpenAPI", link: "/api/" },
          { text: "Chat sessions and SSE", link: "/api/chat" },
          { text: "Discovery", link: "/api/discovery" },
          { text: "Runs", link: "/api/runs" },
          { text: "Scheduled jobs", link: "/api/jobs" },
          { text: "Profiles", link: "/api/profiles" },
          { text: "Agent management", link: "/api/management" },
          { text: "Memory, soul and skills", link: "/api/files" },
          { text: "Goals and slash commands", link: "/api/goals" },
          { text: "Events", link: "/api/events" },
          { text: "Tools and passthrough", link: "/api/passthrough" },
        ],
      },
      {
        text: "Step-by-step guides",
        collapsed: true,
        items: [
          { text: "Supabase sign-in", link: "/tutorials/supabase-auth" },
          { text: "Clerk sign-in", link: "/tutorials/clerk-auth" },
          { text: "A custom auth provider", link: "/tutorials/custom-auth" },
        ],
      },
      {
        text: "How it's built",
        collapsed: true,
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
