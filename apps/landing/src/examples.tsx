import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { CodeCard, Comment, Page } from "./layout.tsx";

function ChatPreview() {
  return (
    <div className="bg-muted/40 flex justify-center border-b p-8">
      <Card className="w-full max-w-sm gap-0 overflow-hidden p-0">
        <div className="flex items-center gap-3 border-b p-3">
          <div className="bg-primary text-primary-foreground grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-semibold">
            H
          </div>
          <div>
            <p className="text-sm font-semibold">Hermes Agent</p>
            <p className="text-muted-foreground text-xs">typing…</p>
          </div>
        </div>
        <CardContent className="space-y-2 p-4 text-sm">
          <div className="flex justify-end">
            <div className="bg-primary text-primary-foreground max-w-[85%] rounded-xl rounded-br-sm px-3 py-2">
              Show me a markdown demo
              <div className="mt-1">
                <Badge variant="secondary">🔥 1</Badge>
              </div>
            </div>
          </div>
          <div className="flex justify-start">
            <div className="bg-muted max-w-[85%] rounded-xl rounded-bl-sm px-3 py-2">
              <b>Sure — here you go</b>
              <code className="bg-background mt-1 block rounded-md p-2 font-mono text-xs">
                console.log("Ready");
              </code>
            </div>
          </div>
          <div className="flex justify-start">
            <div className="bg-muted max-w-[85%] rounded-xl rounded-bl-sm px-3 py-2">
              Streaming token by token
              <span className="animate-pulse">▍</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Block({
  title,
  tag,
  description,
  children,
  preview,
}: {
  title: string;
  tag: string;
  description: string;
  children: React.ReactNode;
  preview?: React.ReactNode;
}) {
  return (
    <section className="mt-10 overflow-hidden rounded-xl border">
      <div className="flex items-baseline justify-between gap-4 border-b px-5 py-4">
        <h2 className="text-base font-semibold">{title}</h2>
        <span className="text-muted-foreground font-mono text-xs">{tag}</span>
      </div>
      {preview}
      <p className="text-muted-foreground px-5 pt-4 text-sm">{description}</p>
      <div className="p-5">{children}</div>
    </section>
  );
}

export function Examples() {
  return (
    <Page>
      <header className="pt-14 pb-2">
        <h1 className="text-3xl font-bold tracking-tight">Examples</h1>
        <p className="text-muted-foreground mt-2 max-w-2xl">
          Building blocks for putting a Hermes agent in front of users — each
          one runs against a real agent through{" "}
          <code className="font-mono text-sm">hermes-api</code>.
        </p>
      </header>

      <Block
        title="Anonymous chat"
        tag="apps/chat →"
        description="A chat with streaming replies, markdown rendering, image attachments, reactions, and message edits. Sessions persist and the agent never learns who the user is. The entire conversation state is one hook:"
        preview={<ChatPreview />}
      >
        <CodeCard title="chat.tsx">
          {'import { HermesClient, useChat } from "@in-th3-l00p/hermes-web-react";\n\n'}
          {'const client = new HermesClient({ baseUrl: "http://localhost:8643" });\n\n'}
          {"function Chat() {\n"}
          {"  const { messages, streaming, send, edit, react, open, reset } =\n"}
          {"    useChat({ client });\n\n"}
          {"  return (\n"}
          {"    <>\n"}
          {"      {messages.map((m) => (\n"}
          {"        <Bubble key={m.id} message={m}\n"}
          {"          onReact={(emoji) => react(m.id, emoji)}\n"}
          {'          onEdit={(text) => edit(m.id, text)} />\n'}
          {"      ))}\n"}
          {"      <Composer onSend={send} busy={streaming} />\n"}
          {"    </>\n"}
          {"  );\n"}
          {"}"}
        </CodeCard>
      </Block>

      <Block
        title="Run the API next to your agent"
        tag="hermes-api"
        description="The server proxies your local Hermes agent to the web. Every request requires authorization — Supabase user tokens or scoped API keys — and each turn tells the agent exactly who it is speaking with."
      >
        <CodeCard title="terminal">
          npm i -g @in-th3-l00p/hermes-web-api{"\n\n"}
          {"hermes-api serve \\\n"}
          {"  --cors http://localhost:5173 \\\n"}
          {"  --upstream http://127.0.0.1:8642 \\\n"}
          {"  --upstream-key $API_SERVER_KEY \\\n"}
          {"  --supabase-url https://your-project.supabase.co"}
        </CodeCard>
      </Block>

      <Block
        title="Sessions & authentication"
        tag="Supabase"
        description="Sign users in with Supabase (anonymous sign-in included) and their conversations persist server-side, scoped to their identity. Tokens are verified against the project's JWKS — no shared secret on the server."
      >
        <CodeCard title="auth.tsx">
          {'import { createClient } from "@supabase/supabase-js";\n\n'}
          {"const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);\n"}
          {"await supabase.auth.signInAnonymously();\n\n"}
          {"const client = new HermesClient({\n"}
          {'  baseUrl: "http://localhost:8643",\n'}
          {"  tokenProvider: async () =>\n"}
          {'    (await supabase.auth.getSession()).data.session?.access_token ?? "",\n'}
          {"});\n\n"}
          <Comment>// each user only ever sees their own conversations</Comment>
          {"\n"}
          {"const sessions = await client.listSessions();\n"}
          {"await client.deleteSession(sessions[0].id);"}
        </CodeCard>
      </Block>

      <Block
        title="Plain TypeScript"
        tag="no react"
        description="Stream straight from the typed client anywhere fetch runs."
      >
        <CodeCard title="stream.ts">
          {'import { HermesClient } from "@in-th3-l00p/hermes-web-ts";\n\n'}
          {'const client = new HermesClient({ baseUrl: "http://localhost:8643" });\n'}
          {"const session = await client.createSession();\n\n"}
          {"for await (const event of client.sendMessage(session.id, {\n"}
          {'  content: "hello!",\n'}
          {"})) {\n"}
          {'  if (event.event === "delta") process.stdout.write(event.data.text);\n'}
          {"}"}
        </CodeCard>
      </Block>
    </Page>
  );
}
