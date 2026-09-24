import { Inspector } from "./inspector.tsx";
import { SitePage } from "./site.tsx";

const PACKAGES = [
  {
    name: "@intheloop-studio/hermes-remote-cli",
    text: "Runs the server on the agent's machine, and manages API keys, users, logs and the service.",
  },
  {
    name: "@intheloop-studio/hermes-remote-client",
    text: "A typed client for browsers and servers, with streaming, retries and token refresh.",
  },
  {
    name: "@intheloop-studio/hermes-remote-react",
    text: "Hooks for chat, sessions, runs and every management surface. A working chat is one useChat().",
  },
  {
    name: "@intheloop-studio/hermes-remote",
    text: "The server as a library, for embedding it in your own Bun process.",
  },
];

const COVERAGE = [
  {
    area: "Chat",
    href: "/docs/api/chat.html",
    text: "Streaming replies, edits, reactions, image attachments and stop, in sessions each user owns. Rename, archive, fork, search and export them.",
  },
  {
    area: "Runs and scheduled jobs",
    href: "/docs/api/runs.html",
    text: "Long-running agent tasks with live event streams, and the agent's cron jobs.",
  },
  {
    area: "Your own users",
    href: "/docs/auth/token-exchange.html",
    text: "Sign people in with Supabase, Clerk or any JWT issuer, or have your backend exchange its own logins for short-lived tokens. You decide how much the agent learns about them.",
  },
  {
    area: "The agent itself",
    href: "/docs/api/management.html",
    text: "Config, providers, memory, SOUL.md, skills, profiles, hooks, kanban and backups, for API keys you grant them to. CLI output has its secrets masked.",
  },
  {
    area: "Running it",
    href: "/docs/server/operations.html",
    text: "An append-only audit log, Prometheus metrics, rate limits, an OpenAPI document of every route, a Docker image, and hermes-remote doctor.",
  },
];

export function Home() {
  return (
    <SitePage>
      <section className="wrap hero">
        <div>
          <h1 className="display">Put your Hermes agent on the web</h1>
          <p className="lede">
            Hermes Remote is the server between the internet and the Hermes agent on your machine.
            Every request needs a key or a signed-in user, can use only the routes it was granted, sees
            only its own chats, and the agent is told exactly who is asking.
          </p>
          <div className="actions">
            <a className="button primary" href="/docs/guide/quick-start.html">
              Set it up
            </a>
            <a className="button" href="/docs/">
              Read the docs
            </a>
          </div>
        </div>
        <div>
          <Inspector />
          <p className="caption">
            Pick a caller and a request. These are the answers the server really gives.
          </p>
        </div>
      </section>

      <section className="wrap section" aria-labelledby="start">
        <div className="section-head">
          <h2 className="display" id="start">
            Three commands on the agent's machine
          </h2>
          <p>
            Install the CLI next to your Hermes agent, mint a key with only the scopes your app
            needs, and start the server. It listens on localhost until you put a proxy in front.
          </p>
        </div>
        <div className="two-up">
          <div>
            <pre className="code">
              <span className="cmd">npm i -g @intheloop-studio/hermes-remote-cli</span>
              {"\n"}
              <span className="cmd">
                {"hermes-remote keys create --name web \\\n    --scope chat:invoke --scope sessions:read --scope sessions:write"}
              </span>
              {"\n"}
              <span className="dim">{"created key k7f2qw (web)\n  hk_k7f2qw.mR4tYc0jyc9…"}</span>
              {"\n"}
              <span className="cmd">hermes-remote serve --upstream http://127.0.0.1:8642</span>
              {"\n"}
              <span className="dim">hermes-remote listening on 127.0.0.1:8643</span>
            </pre>
            <p className="caption">On the machine running the agent.</p>
          </div>
          <div>
            <pre className="code">
              {'import { HermesClient, useChat } from "@intheloop-studio/hermes-remote-react";\n\n'}
              {'const client = new HermesClient({\n  baseUrl: "https://agent.example.com",\n  tokenProvider: getUserToken,\n});\n\n'}
              {"function Chat() {\n  const { messages, streaming, send, stop } = useChat({ client });\n  return <Thread messages={messages} onSend={send} onStop={stop} />;\n}"}
            </pre>
            <p className="caption">In your app, with the signed-in user's token.</p>
          </div>
        </div>
      </section>

      <section className="wrap section" aria-labelledby="packages">
        <div className="section-head">
          <h2 className="display" id="packages">
            What you install
          </h2>
          <p>Four packages on npm, released together. Each GitHub release also carries the tarballs.</p>
        </div>
        <dl className="defs">
          {PACKAGES.map((pkg) => (
            <div key={pkg.name}>
              <dt>
                <a href={`https://www.npmjs.com/package/${pkg.name}`}>
                  <code>{pkg.name}</code>
                </a>
              </dt>
              <dd>{pkg.text}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="wrap section" aria-labelledby="coverage">
        <div className="section-head">
          <h2 className="display" id="coverage">
            Everything the agent does, behind the same checks
          </h2>
          <p>
            Every surface goes through the checkpoints above, and a test calls every route as every
            kind of caller to keep it that way.
          </p>
        </div>
        <dl className="defs">
          {COVERAGE.map((item) => (
            <div key={item.area}>
              <dt>
                <a href={item.href}>{item.area}</a>
              </dt>
              <dd>{item.text}</dd>
            </div>
          ))}
        </dl>
      </section>
    </SitePage>
  );
}
