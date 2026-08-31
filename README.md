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

A Hermes agent ships an API server that must stay on localhost, guarded by a single all-powerful key. Hermes Remote is the layer that makes it safe to put on the web:

* **Authentication**: scoped API keys (argon2-hashed, CIDR pinning, expiry, rotation) and user JWTs verified through Supabase, Clerk, a generic JWKS/HS256 provider, or your own `AuthProvider`. Optional anonymous mode for demos.
* **Streaming chat** over SSE: token-by-token replies, edits with regeneration, reactions, image attachments, turn cancellation. Sessions persist in SQLite, owned per user.
* **The full agent surface**: discovery, runs, scheduled jobs, profiles, memory, SOUL.md, skills, bundles, goals, hooks, gateway, kanban, an events firehose, and raw OpenAI-compatible passthrough. CLI-backed routes return `{ok, raw}` and are best-effort against hermes 0.20.x.
* **Guardrails**: a closed four-tier scope catalog with no admin scope, per-principal rate limiting, and an append-only audit log. The agent's own key never leaves the server.
* **Identity injection**: every turn tells the agent exactly who it is speaking with, from verified claims only.

## The four packages

| Package | Purpose |
| ------- | ------- |
| [`@intheloop-studio/hermes-remote`](packages/hermes-api) | Server library (auth, scopes, sessions, the three bridges) |
| [`@intheloop-studio/hermes-remote-cli`](packages/cli) | Management CLI (`hermes-remote`: serve, keys, service, logs) |
| [`@intheloop-studio/hermes-remote-client`](packages/hermes-ts) | Isomorphic TypeScript client with SSE streaming |
| [`@intheloop-studio/hermes-remote-react`](packages/react-hermes) | React hooks (`useChat`, `useSessions`, and one hook per management surface) |

## Quick start

The packages are on npm under the `@intheloop-studio` scope. They are public, so no registry setup is needed.

On the machine running your Hermes agent:

```bash
npm i -g @intheloop-studio/hermes-remote-cli
hermes-remote keys create --name my-app --scope chat:invoke --scope sessions:read --scope sessions:write
hermes-remote serve --upstream http://127.0.0.1:8642 --upstream-key $API_SERVER_KEY
```

In your React app:

```tsx
import { HermesClient, useChat } from "@intheloop-studio/hermes-remote-react";

const client = new HermesClient({ baseUrl: "http://localhost:8643", token: "hk_..." });

function Chat() {
  const { messages, streaming, send } = useChat({ client });
  return <Messages items={messages} onSend={send} busy={streaming} />;
}
```

The [documentation](https://hermes-remote.tiscacatalin.com/docs/) covers installation, the CLI, configuration, the scope catalog, every endpoint group, auth providers, the clients, and deployment. The [examples](https://hermes-remote.tiscacatalin.com/examples/) are static demos running on built-in demo data, not a live agent.

Tarballs are attached to every [release](https://github.com/in-th3-l00p/hermes-remote/releases) for registry-free installs.

## Development

Bun everywhere, TypeScript strict everywhere. Two test tiers:

```bash
bun install
bun run test               # unit tests, no external deps, 100% line+function coverage enforced
bun run typecheck          # build the clients first; cross-package types resolve from dist
bun run test:integration   # needs a live Hermes agent; gated by HERMES_INTEGRATION=1
bun scripts/check-snippets.ts   # every ts/tsx fence in the docs must parse
```

Every feature ships with tests in the same commit. See [CONTRIBUTING.md](CONTRIBUTING.md) and the [engineering notes](https://hermes-remote.tiscacatalin.com/docs/internals/engineering.html).

## License

MIT © Tisca Catalin
