# Hermes Remote

Hermes Remote turns a local [Hermes agent](https://hermes-agent.nousresearch.com) into a web API you can build products on. It adds what the agent's built-in API server lacks: user authentication, scoped API keys, per-user chat sessions, rate limiting, and an audit log. The agent's own bearer key never leaves your server.

## The four packages

| Package | What it is |
| ------- | ---------- |
| `@intheloop-studio/hermes-remote` | The server library. Runs next to your agent, exposes it over HTTP, owns keys, sessions, and auth. |
| `@intheloop-studio/hermes-remote-cli` | The management CLI (`hermes-remote`): serve, keys, config, service install. |
| `@intheloop-studio/hermes-remote-client` | An isomorphic TypeScript client with SSE streaming. Works in browsers, Node 18+, and Bun. |
| `@intheloop-studio/hermes-remote-react` | React hooks. A complete chat is `useChat()`, a session list is `useSessions()`. |

## How it fits together

```
Browser or backend
      | bearer token (user JWT or hk_ API key)
      v
hermes-remote server  (SQLite sessions, scopes, rate limits, audit log)
      | HTTP proxy + CLI bridge + filesystem bridge
      v
Hermes agent  (API server on 127.0.0.1:8642, key held server-side)
```

Three bridges cover the agent's full surface:

* An HTTP proxy for chat, runs, jobs, models, and the agent's own session store.
* A CLI bridge for everything the `hermes` binary manages: config, skills hub, cron, gateway, kanban, and more.
* A filesystem bridge for the agent's documents: SOUL.md, memory files, skill files, cron outputs.

Every request is authorized, every session is owned by its user, and every agent turn starts with a system message telling the agent exactly who it is speaking with.

## Where to go

* New here: [Installation](/guide/installation), then the [quick start](/guide/quick-start).
* Running a server: [CLI reference](/server/cli), [configuration](/server/config), [API keys and scopes](/server/scopes).
* Signing users in: [Authentication](/auth/).
* Calling the API directly: [HTTP API conventions](/api/) and the endpoint pages that follow it.
* Building a UI: the [TypeScript client](/clients/typescript) and the [React hooks](/clients/react).

The [live examples](https://hermes-remote.tiscacatalin.com/examples/) show the client and hooks in action. They are static demos running on built-in demo data, not a live agent.
