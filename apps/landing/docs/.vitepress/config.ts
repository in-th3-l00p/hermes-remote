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
        text: "1. Projects",
        items: [
          { text: "1.1 Server & CLI", link: "/projects/server" },
          { text: "1.2 TypeScript client", link: "/projects/client" },
          { text: "1.3 React hooks", link: "/projects/react" },
          { text: "1.4 Management API", link: "/projects/management" },
        ],
      },
      {
        text: "2. Authentication",
        items: [
          { text: "2.1 Overview", link: "/auth/" },
          { text: "2.2 Supabase provider", link: "/auth/supabase" },
          { text: "2.3 Clerk provider", link: "/auth/clerk" },
          { text: "2.4 Custom providers", link: "/auth/custom" },
        ],
      },
      {
        text: "3. Tutorials",
        items: [
          { text: "3.1 A chat app in React", link: "/tutorials/react-chat" },
          { text: "3.2 Authentication with Supabase", link: "/tutorials/supabase-auth" },
          { text: "3.3 Authentication with Clerk", link: "/tutorials/clerk-auth" },
          { text: "3.4 Custom auth providers", link: "/tutorials/custom-auth" },
          { text: "3.5 Deploying", link: "/tutorials/deploying" },
          { text: "3.6 The raw API", link: "/tutorials/raw-api" },
        ],
      },
      {
        text: "4. How it was built",
        items: [
          { text: "4.1 Architecture", link: "/internals/architecture" },
          { text: "4.2 Security model", link: "/internals/security" },
          { text: "4.3 Engineering practices", link: "/internals/engineering" },
        ],
      },
    ],
    footer: {
      message: "MIT licensed",
      copyright: "✧ tiscacatalin.com",
    },
  },
});
