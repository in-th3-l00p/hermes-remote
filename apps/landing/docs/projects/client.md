# 1.2 The TypeScript client

`@in-th3-l00p/hermes-remote-client` is a zero dependency, isomorphic client. It runs in browsers, Node 18+, and Bun, and ships full type declarations.

## Construction and auth

```ts
import { HermesClient } from "@in-th3-l00p/hermes-remote-client";

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

When a `tokenProvider` is set and a request comes back 401, the client fetches a fresh token and retries once, so expired JWTs heal transparently.

## Methods

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

## Streaming

Streaming methods return async iterables of typed `ChatEvent`s:

```ts
for await (const event of client.sendMessage(session.id, { content: "hi" })) {
  switch (event.event) {
    case "delta":
      process.stdout.write(event.data.text);
      break;
    case "done":
      console.log("\nfinal:", event.data.content);
      break;
    case "error":
      console.error(event.data.message);
      break;
  }
}
```

Pass an `AbortSignal` to cancel from the consumer side, or call `stopTurn(sessionId)` to abort server side while keeping the partial reply.

## Errors

Failures throw `HermesApiError` with `status` and `code` (`unauthorized`, `missing_scope`, `session_not_found`, `rate_limited`, `payload_too_large`, `invalid_message`, ...), so handling is a switch on `error.code` rather than string matching.
