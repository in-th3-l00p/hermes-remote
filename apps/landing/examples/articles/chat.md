# Chat architecture

The chat example is the smallest complete hermes-remote integration: one
client, two hooks, and a streaming protocol. Everything on screen is driven by
`useChat` and `useSessions` from `@intheloop-studio/hermes-remote-react`.

## The client

The app creates a single anonymous `HermesClient`. Against a real deployment
that is one line. Point `baseUrl` at your server:

```ts
import { HermesClient } from "@intheloop-studio/hermes-remote-client";

export const client = new HermesClient({ baseUrl: "https://agent.example.com" });
```

The hosted example has no server behind it: it passes the client a custom
`fetch` implementation that answers every request from built-in demo data,
entirely in your browser. The client cannot tell the difference, which is the
point: `fetch` is an injectable seam in `HermesClientOptions`.

Anonymous mode means the server assigns the visitor a per-IP principal.
Sessions created here are addressable by id only, which is why the app keeps
its session ids in `localStorage` and passes them to `useSessions`.

## useChat drives the conversation

```tsx
const chat = useChat({ client });

await chat.send("hello");     // POST /v1/sessions/:id/messages → SSE stream
await chat.edit(id, "fixed"); // PATCH …/messages/:id → truncate + regenerate
await chat.react(id, "🔥");   // POST …/reactions
await chat.stop();            // POST …/stop, keeps the partial reply
await chat.open(otherId);     // load a previous session's history
chat.reset();                 // next send creates a fresh session
```

`useChat` holds the message list and a `streaming` flag. Internally it feeds
every server-sent event through a pure reducer (`chat-events.ts` in the
package): `user` events append the echoed message, `assistant` opens a
placeholder, `delta` appends token text to it, `done` finalizes, `error` marks
the message failed. Because the reducer is pure, the whole streaming lifecycle
is unit-testable without a browser or a server.

## The SSE protocol underneath

One turn is a single HTTP response with five event types:

| event | payload | UI effect |
| ----- | ------- | --------- |
| `user` | the persisted user message | render immediately |
| `assistant` | `{ id }` | open a streaming bubble |
| `delta` | `{ id, text }` | append to the bubble |
| `done` | the final message | swap in the complete message |
| `error` | `{ id, message }` | mark the bubble failed |

The cursor you see mid-reply is just `message.status === "streaming"`, no
extra state.

## Sessions for anonymous visitors

`useSessions({ client, ids })` lists sessions. Signed-in users get their own
sessions automatically; anonymous visitors must present ids, so the app
remembers every session it creates:

```ts
const ids = JSON.parse(localStorage.getItem("sessions") ?? "[]") as string[];
const sessions = useSessions({ client, ids });
```

The hook deliberately keys its refresh on `ids.join(",")` rather than the
array identity, so you can pass a fresh array literal on every render without
causing an effect loop.

## What the server adds

Each turn the server prepends a verified identity line for the agent (an
anonymous visitor is introduced as exactly that), persists both sides of the
conversation in SQLite, enforces message-size limits and per-principal rate
limits, and proxies the model stream from the inference provider. The
upstream API key never reaches this page.
