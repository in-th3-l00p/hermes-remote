# The TypeScript client

`@intheloop-studio/hermes-remote-client` is a zero-dependency, isomorphic client. It runs in browsers, Node 18+, and Bun, and ships full type declarations.

## Construction and auth

```ts
import { HermesClient } from "@intheloop-studio/hermes-remote-client";

// Backend: a static API key
const backend = new HermesClient({ baseUrl: "https://agent.example.com", token: "hk_..." });

// Browser: an async token provider (e.g. Supabase session)
const browser = new HermesClient({
  baseUrl: "https://agent.example.com",
  tokenProvider: async () => await getFreshToken(),
});

// Anonymous (only if the server runs with --anonymous)
const anonymous = new HermesClient({ baseUrl: "http://localhost:8643" });
```

With a `tokenProvider`, a 401 makes the client fetch a fresh token and retry once, so expired JWTs heal transparently. Extra `headers` can be passed in the options; `withProfile(name)` returns a client with `X-Hermes-Profile` set on every call.

## Chat methods

| Method | Returns |
| ------ | ------- |
| `status()` | `{ ok, version }` |
| `createSession()` | `ChatSession` |
| `listSessions(ids?)` | `ChatSessionMeta[]` (pass ids for anonymous principals) |
| `deleteSession(id)` | void |
| `listMessages(sessionId)` | `ChatMessage[]` |
| `sendMessage(sessionId, { content, attachments? }, { signal? })` | `AsyncIterable<ChatEvent>` |
| `editMessage(sessionId, messageId, content, { signal? })` | `AsyncIterable<ChatEvent>` |
| `react(sessionId, messageId, emoji)` | The updated `ChatMessage` |
| `stopTurn(sessionId)` | `{ stopped }` |
| `conversation(sessionId?)` | A `Conversation` handle |

## Streaming

Streaming methods return async iterables of typed `ChatEvent`s:

```ts
for await (const event of client.sendMessage(session.id, { content: "hi" })) {
  switch (event.event) {
    case "delta":
      process.stdout.write(event.data.text);
      break;
    case "done":
      console.log("final:", event.data.content);
      break;
    case "error":
      console.error(event.data.message);
      break;
  }
}
```

Pass an `AbortSignal` to cancel from the consumer side, or call `stopTurn(sessionId)` to abort server-side while keeping the partial reply.

## Conversations

`client.conversation()` wraps one conversation. Without an id it creates the session on the first `send`:

```ts
const conversation = client.conversation();
for await (const event of conversation.send("hello")) {
  if (event.event === "delta") process.stdout.write(event.data.text);
}
console.log(conversation.id);   // the session created on first send
await conversation.messages();  // ChatMessage[]
await conversation.stop();      // abort the in-flight turn
await conversation.remove();    // delete the session
```

## Discovery, runs, and jobs

```ts
const health = await client.discovery.health();
const caps = await client.discovery.capabilities();
await client.discovery.models();
await client.discovery.skills();
await client.discovery.toolsets();

const run = await client.runs.create<{ id: string }>({ input: "summarize my inbox" });
for await (const event of client.runs.events(run.id)) {
  console.log(event.event, event.data);
}
await client.runs.list();
await client.runs.steer(run.id, { text: "focus on unread" });
await client.runs.stop(run.id);

await client.jobs.list();            // requires crons:read (API key)
await client.jobs.trigger("job_id"); // requires crons:write
```

## Management namespaces

With an API key holding the right scopes, the entire agent is drivable from the client. One namespace per surface, mirroring the [management API](/api/management):

```ts
const ops = new HermesClient({ baseUrl: "https://agent.example.com", token: "hk_..." });

await ops.profiles.list();
const indra = ops.withProfile("indra");
await indra.agent.status();
await indra.config.set("model.name", "deepseek/deepseek-v4-flash");
await indra.memory.add("prefers concise answers");
await indra.soul.set("# Indra\nFirm intelligence agent.");
await indra.skills.hubSearch("pdf");
await indra.gateway.status();
await indra.kanban.tasks();
await indra.goals.set("sess_1", "ship the report", { draft: true });
await indra.commands.run("sess_1", "/goal status");
for await (const event of indra.events.subscribe()) {
  console.log(event.event, event.data);
}
```

Also available: `providers`, `bundles`, `checkpoints`, `approvals`, `hooks`, `webhooks`, `messaging`, `pairing`, `projects`, `toolsets`, `mcp`, `plugins`, `backups`, `subagents`, `agentSessions` (the agent's own session store, including `chatStream`), `media`, `web`, `browser`, and `passthrough`.

CLI-backed methods resolve to `{ ok, raw }`, exactly like the [routes behind them](/api/management), and are best-effort against hermes 0.20.x. Binary endpoints (`backups`, `profiles.exportArchive()`, `media.tts()`) return the raw `Response`. The generic `client.request(method, path, body?)` covers anything without a dedicated method.

## Errors

Failures throw `HermesApiError` with `status` and `code` (`unauthorized`, `missing_scope`, `session_not_found`, `rate_limited`, `payload_too_large`, `invalid_message`, and the rest of the [error codes](/api/#errors)), so handling is a switch on `error.code` rather than string matching.
