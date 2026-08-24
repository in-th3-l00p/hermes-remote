import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CodeCard, Comment, Page } from "./layout.tsx";

const FEATURES = [
  {
    title: "Authenticated web API",
    description:
      "Exposes a local Hermes agent over HTTP with scoped API keys, Supabase user tokens, and anonymous sessions — restrictive by default.",
  },
  {
    title: "Streaming conversations",
    description:
      "Server-sent events for token-by-token replies, message edits with regeneration, reactions, and image attachments.",
  },
  {
    title: "Persistent sessions",
    description:
      "Conversations are stored in SQLite, scoped per user, listed and resumable — your users pick up where they left off.",
  },
  {
    title: "Typed client & hooks",
    description:
      "A zero-dependency TypeScript client and React hooks with SSE streaming, kept at 100% test coverage.",
  },
];

const PACKAGES = [
  {
    name: "@in-th3-l00p/hermes-remote",
    href: "https://github.com/in-th3-l00p/hermes-remote/packages",
    description: "API server & management CLI — keys, permissions, logs, serve.",
  },
  {
    name: "@in-th3-l00p/hermes-remote-client",
    href: "https://github.com/in-th3-l00p/hermes-remote/packages",
    description: "Isomorphic TypeScript client with SSE streaming.",
  },
  {
    name: "@in-th3-l00p/hermes-remote-react",
    href: "https://github.com/in-th3-l00p/hermes-remote/packages",
    description: "React hooks — a full chat is one useChat().",
  },
  {
    name: "releases →",
    href: "https://github.com/in-th3-l00p/hermes-remote/releases",
    description: "Tarballs attached to every GitHub release for registry-free installs.",
  },
];

export function Home() {
  return (
    <Page>
      <section className="py-20 text-center">
        <p className="text-muted-foreground mb-4 text-xl tracking-[0.4em]">✧</p>
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          Your Hermes agent,
          <br />
          anywhere.
        </h1>
        <p className="text-muted-foreground mx-auto mt-4 max-w-xl text-lg">
          An authenticated API, a typed TypeScript client, and React hooks that
          turn a local Hermes agent into a product you can ship.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Button asChild>
            <a href="/examples/">View examples</a>
          </Button>
          <Button variant="outline" asChild>
            <a href="https://github.com/in-th3-l00p/hermes-remote">GitHub</a>
          </Button>
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-semibold tracking-tight">What it does</h2>
        <p className="text-muted-foreground mt-1 mb-6">
          Everything between your agent and your users.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          {FEATURES.map((feature) => (
            <Card key={feature.title}>
              <CardHeader>
                <CardTitle className="text-base">{feature.title}</CardTitle>
                <CardDescription>{feature.description}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mt-14 text-2xl font-semibold tracking-tight">Packages</h2>
        <p className="text-muted-foreground mt-1 mb-6">
          Published to GitHub Packages under the{" "}
          <code className="font-mono text-sm">@in-th3-l00p</code> scope.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          {PACKAGES.map((pkg) => (
            <Card key={pkg.name}>
              <CardHeader>
                <CardTitle className="font-mono text-sm font-medium">
                  <a href={pkg.href} className="hover:underline">
                    {pkg.name}
                  </a>
                </CardTitle>
                <CardDescription>{pkg.description}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mt-14 text-2xl font-semibold tracking-tight">
          Quick start
        </h2>
        <p className="text-muted-foreground mt-1 mb-6">
          On the machine running your Hermes agent.
        </p>
        <CodeCard title="terminal">
          <Comment>
            # packages live on GitHub Packages — point the scope at it once
          </Comment>
          {"\n"}
          {'echo "@in-th3-l00p:registry=https://npm.pkg.github.com" >> ~/.npmrc'}
          {"\n\n"}
          npm i -g @in-th3-l00p/hermes-remote{"\n"}
          hermes-remote keys create --name my-app --scope chat:invoke --scope
          sessions:read{"\n"}
          hermes-remote serve
        </CodeCard>
      </section>

      <section>
        <h2 className="mt-14 text-2xl font-semibold tracking-tight">
          React hooks
        </h2>
        <p className="text-muted-foreground mt-1 mb-6">
          A full chat with your agent is one hook.
        </p>
        <CodeCard title="chat.tsx">
          {'import { HermesClient, useChat } from "@in-th3-l00p/hermes-remote-react";\n\n'}
          {'const client = new HermesClient({ baseUrl: "https://agent.example.com" });\n\n'}
          {"function Chat() {\n"}
          {"  const { messages, streaming, send, edit, react } = useChat({ client });\n"}
          {"  return <Messages items={messages} onSend={send} />;\n"}
          {"}"}
        </CodeCard>
      </section>
    </Page>
  );
}
