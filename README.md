<p align="center">
  <img src="assets/wordmark.svg" alt="hermes remote" width="360">
</p>

<p align="center">
  <b>Your Hermes agent, anywhere.</b><br>
  An authenticated API, a typed TypeScript client, and React hooks that turn a local
  <a href="https://hermes-agent.nousresearch.com">Hermes agent</a> into a product you can ship.
</p>

<p align="center">
  <a href="https://hermes-remote.tiscacatalin.com">Site</a> ·
  <a href="https://hermes-remote.tiscacatalin.com/docs/">Docs</a> ·
  <a href="https://hermes-remote.tiscacatalin.com/examples/">Examples</a>
</p>

## What it does

* **Secure web API** in front of a local Hermes agent: scoped API keys, Supabase user tokens (verified via JWKS), optional anonymous mode, rate limiting, audit log, CIDR pinning.
* **Streaming chat** over SSE: token by token replies, message edits with regeneration, reactions, image attachments, turn cancellation.
* **Persistent sessions** in SQLite, owned per user, listed and resumable.
* **Identity aware agent**: every turn tells the agent exactly who it is speaking with, and nothing else.
* **Typed client and React hooks**: a full chat UI is `useChat()`, the session list is `useSessions()`.

## Quick start

Packages live on GitHub Packages; point the scope at it once (a GitHub token with `read:packages` is required):

```bash
echo "@in-th3-l00p:registry=https://npm.pkg.github.com" >> ~/.npmrc
echo "//npm.pkg.github.com/:_authToken=YOUR_GITHUB_TOKEN" >> ~/.npmrc
```

On the machine running your Hermes agent:

```bash
npm i -g @in-th3-l00p/hermes-remote-cli
hermes-remote keys create --name my-app --scope chat:invoke --scope sessions:read --scope sessions:write
hermes-remote serve --upstream http://127.0.0.1:8642 --upstream-key $API_SERVER_KEY
```

In your React app:

```tsx
import { HermesClient, useChat } from "@in-th3-l00p/hermes-remote-react";

const client = new HermesClient({ baseUrl: "http://localhost:8643", token: "hk_..." });

function Chat() {
  const { messages, streaming, send } = useChat({ client });
  return <Messages items={messages} onSend={send} busy={streaming} />;
}
```

Full guides, tutorials (Supabase auth, custom auth providers, deployment), and the technical write up live in the [documentation](https://hermes-remote.tiscacatalin.com/docs/).

## Packages

| Package | Purpose |
| ------- | ------- |
| [`@in-th3-l00p/hermes-remote`](packages/hermes-api) | Server library (auth, sessions, streaming facade) |
| [`@in-th3-l00p/hermes-remote-cli`](packages/cli) | Management CLI (`hermes-remote`: serve, keys, config, service) |
| [`@in-th3-l00p/hermes-remote-client`](packages/hermes-ts) | Isomorphic TypeScript client |
| [`@in-th3-l00p/hermes-remote-react`](packages/react-hermes) | React hooks |

Tarballs are attached to every [release](https://github.com/in-th3-l00p/hermes-remote/releases) for registry free installs.

## Development

```bash
bun install
bun run test          # unit tests, 100% coverage enforced
bun run typecheck
bun run test:integration   # needs a live agent, see integration/chat.test.ts
```

See [CONTRIBUTING.md](CONTRIBUTING.md) and the [engineering notes](https://hermes-remote.tiscacatalin.com/docs/internals/engineering.html).

## License

MIT © Tisca Catalin
