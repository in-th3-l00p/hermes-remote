# Hermes Remote

Hermes Remote turns a local [Hermes agent](https://hermes-agent.nousresearch.com) into a secure web product: an authenticated HTTP API, a typed TypeScript client, and React hooks, with streaming chat, persistent sessions, and user identity built in.

## The three packages

| Package | What it is |
| ------- | ---------- |
| `@in-th3-l00p/hermes-remote` | The server and management CLI. Runs next to your agent, exposes it over HTTP, owns keys, sessions, and auth. |
| `@in-th3-l00p/hermes-remote-client` | An isomorphic TypeScript client with SSE streaming. Works in browsers, Node 18+, and Bun. |
| `@in-th3-l00p/hermes-remote-react` | React hooks. A complete chat is `useChat()`, a session list is `useSessions()`. |

## Sixty second start

Packages are published to GitHub Packages, so point the scope at it once (a GitHub token with `read:packages` is required):

```bash
echo "@in-th3-l00p:registry=https://npm.pkg.github.com" >> ~/.npmrc
echo "//npm.pkg.github.com/:_authToken=YOUR_GITHUB_TOKEN" >> ~/.npmrc
```

On the machine running your Hermes agent (with its API server enabled, see [2.4 Deploying](/tutorials/deploying)):

```bash
npm i -g @in-th3-l00p/hermes-remote
hermes-remote keys create --name my-app --scope chat:invoke --scope sessions:read --scope sessions:write
hermes-remote serve --upstream http://127.0.0.1:8642 --upstream-key $API_SERVER_KEY
```

In your app:

```ts
import { HermesClient } from "@in-th3-l00p/hermes-remote-client";

const client = new HermesClient({
  baseUrl: "http://localhost:8643",
  token: "hk_...",
});

const session = await client.createSession();
for await (const event of client.sendMessage(session.id, { content: "hello" })) {
  if (event.event === "delta") process.stdout.write(event.data.text);
}
```

## How it fits together

```
Browser or backend
      | bearer token (Supabase JWT or hk_ API key)
      v
hermes-remote server  (SQLite sessions, scopes, rate limits, audit log)
      | OpenAI-compatible streaming + identity context
      v
Hermes agent API server  (127.0.0.1:8642, key held server-side)
```

Every request is authorized, every session is owned, and every agent turn carries a system message telling the agent exactly who it is speaking with.
