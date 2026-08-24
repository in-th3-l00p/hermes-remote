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
        ],
      },
      {
        text: "2. Tutorials",
        items: [
          { text: "2.1 A chat app in React", link: "/tutorials/react-chat" },
          { text: "2.2 Authentication with Supabase", link: "/tutorials/supabase-auth" },
          { text: "2.3 Custom auth providers", link: "/tutorials/custom-auth" },
          { text: "2.4 Deploying", link: "/tutorials/deploying" },
          { text: "2.5 The raw API", link: "/tutorials/raw-api" },
        ],
      },
      {
        text: "3. How it was built",
        items: [
          { text: "3.1 Architecture", link: "/internals/architecture" },
          { text: "3.2 Security model", link: "/internals/security" },
          { text: "3.3 Engineering practices", link: "/internals/engineering" },
        ],
      },
    ],
    footer: {
      message: "MIT licensed",
      copyright: "✧ tiscacatalin.com",
    },
  },
});
