import { Code, Comment, Out, Page, Prompt } from "./layout.tsx";

const FEATURES = [
  {
    term: "auth",
    text: "Scoped API keys for servers, user tokens through Supabase, Clerk, or any JWT issuer, and optional anonymous access. User tokens only ever see their own sessions.",
  },
  {
    term: "streaming chat",
    text: "Token-by-token replies over server-sent events, with edits, regeneration, reactions, image attachments, and a stop that actually cancels the turn.",
  },
  {
    term: "sessions",
    text: "Conversations persist in SQLite on the host, scoped per user, listable and resumable. Your users pick up where they left off.",
  },
  {
    term: "the whole agent",
    text: "Runs, jobs, profiles, config, memory, skills, cron, goals, and a live event stream. If the agent can do it, there is an authenticated endpoint for it.",
  },
];

const PACKAGES = [
  {
    name: "hermes-remote",
    text: "the API server: auth, sessions, streaming, rate limits",
  },
  {
    name: "hermes-remote-cli",
    text: "keys, config, logs, and serving, from the host machine only",
  },
  {
    name: "hermes-remote-client",
    text: "a typed client for browsers and servers, streaming included",
  },
  {
    name: "hermes-remote-react",
    text: "hooks; a working chat is one useChat()",
  },
];

export function Home() {
  return (
    <Page>
      <section className="pt-24">
        <h1 className="max-w-xl text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          Put your Hermes agent on the web.
        </h1>
        <p className="text-muted-foreground mt-5 max-w-xl leading-relaxed">
          An authenticated HTTP server, a typed TypeScript client, and React
          hooks for a{" "}
          <a
            href="https://hermes-agent.nousresearch.com"
            className="text-foreground underline decoration-brand/50 underline-offset-4 hover:decoration-brand"
          >
            Hermes agent
          </a>{" "}
          running on your own machine. Mint a key, start the server, and the
          agent is reachable from anything you build.
        </p>

        <div className="mt-10">
          <Code>
            <Comment># on the machine running your Hermes agent</Comment>
            {"\n"}
            <Prompt>npm i -g @intheloop-studio/hermes-remote-cli</Prompt>
            {"\n"}
            <Prompt>
              {"hermes-remote keys create --name web \\\n"}
              {"    --scope chat:invoke --scope sessions:read"}
            </Prompt>
            {"\n"}
            <Out>created key k7f2qw (web)</Out>
            {"\n"}
            <Out>{"  "}hk_k7f2qw.mR4tYc0jyc9…</Out>
            {"\n"}
            <Prompt>hermes-remote serve</Prompt>
            {"\n"}
            <Out>hermes-remote listening on port 8643</Out>
          </Code>
        </div>

        <p className="mt-8 flex gap-6 font-mono text-sm">
          <a href="/docs/" className="text-brand hover:underline underline-offset-4">
            read the docs
          </a>
          <a
            href="/examples/"
            className="text-brand hover:underline underline-offset-4"
          >
            browse the examples
          </a>
        </p>
      </section>

      <section className="mt-24">
        <h2 className="font-mono text-sm text-muted-foreground">what you get</h2>
        <div className="mt-6 space-y-6">
          {FEATURES.map((feature) => (
            <p key={feature.term} className="max-w-xl leading-relaxed">
              <span className="text-foreground font-medium">
                {feature.term}.
              </span>{" "}
              <span className="text-muted-foreground">{feature.text}</span>
            </p>
          ))}
        </div>
      </section>

      <section className="mt-24">
        <h2 className="font-mono text-sm text-muted-foreground">
          in the browser
        </h2>
        <div className="mt-6">
          <Code>
            {'import { HermesClient } from "@intheloop-studio/hermes-remote-client";\n'}
            {'import { useChat } from "@intheloop-studio/hermes-remote-react";\n\n'}
            {'const client = new HermesClient({ baseUrl: "https://agent.example.com" });\n\n'}
            {"function Chat() {\n"}
            {"  const { messages, streaming, send, stop } = useChat({ client });\n"}
            {"  return <Messages items={messages} onSend={send} />;\n"}
            {"}"}
          </Code>
        </div>
      </section>

      <section className="mt-24">
        <h2 className="font-mono text-sm text-muted-foreground">packages</h2>
        <ul className="mt-6 space-y-4">
          {PACKAGES.map((pkg) => (
            <li key={pkg.name} className="max-w-xl leading-relaxed">
              <a
                href="https://github.com/in-th3-l00p/hermes-remote/packages"
                className="font-mono text-sm text-foreground hover:underline underline-offset-4"
              >
                @intheloop-studio/{pkg.name}
              </a>
              <span className="text-muted-foreground"> {pkg.text}</span>
            </li>
          ))}
        </ul>
        <p className="text-muted-foreground mt-6 max-w-xl text-sm leading-relaxed">
          Tarballs are attached to every{" "}
          <a
            href="https://github.com/in-th3-l00p/hermes-remote/releases"
            className="text-foreground underline decoration-brand/50 underline-offset-4 hover:decoration-brand"
          >
            GitHub release
          </a>{" "}
          if you would rather not touch a registry.
        </p>
      </section>
    </Page>
  );
}
