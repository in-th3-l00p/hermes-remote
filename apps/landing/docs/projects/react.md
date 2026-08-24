# 1.3 The React hooks

`@in-th3-l00p/hermes-remote-react` wraps the client in two hooks. React 18+ is a peer dependency; the client is re-exported so one import covers most apps.

## useChat

The whole conversation state machine in one hook:

```tsx
import { HermesClient, useChat } from "@in-th3-l00p/hermes-remote-react";

const client = new HermesClient({ baseUrl: "http://localhost:8643", token: "hk_..." });

function Chat() {
  const { sessionId, messages, streaming, error, send, edit, react, open, reset, stop } =
    useChat({ client });

  return (
    <div>
      {messages.map((m) => (
        <p key={m.id}>{m.role}: {m.content}</p>
      ))}
      <button onClick={() => void send("hello")}>send</button>
      {streaming && <button onClick={() => void stop()}>stop</button>}
    </div>
  );
}
```

| Field | Meaning |
| ----- | ------- |
| `messages` | Ordered `ChatMessage[]`, updated token by token while streaming |
| `streaming` | True while a turn is in flight |
| `error` | Last agent or network error, or null |
| `send(content, attachments?)` | Sends a message (creates the session lazily) |
| `edit(messageId, content)` | Edits a user message; history after it is truncated and regenerated |
| `react(messageId, emoji)` | Toggles a reaction |
| `open(sessionId)` | Loads an existing session's history |
| `reset()` | Clears state so the next send starts a new session |
| `stop()` | Aborts the in flight turn, keeping the partial reply |

The hook takes any object matching `ChatClientLike`, so tests can pass a fake without network access.

## useSessions

The sidebar logic:

```tsx
import { useSessions } from "@in-th3-l00p/hermes-remote-react";

function Sidebar({ onOpen }: { onOpen: (id: string) => void }) {
  const { sessions, loading, error, refresh, remove } = useSessions({ client });
  if (loading) return <p>loading…</p>;
  return (
    <ul>
      {sessions.map((s) => (
        <li key={s.id}>
          <button onClick={() => onOpen(s.id)}>{s.title ?? "New chat"}</button>
          <button onClick={() => void remove(s.id)}>delete</button>
        </li>
      ))}
    </ul>
  );
}
```

For anonymous principals pass `ids` (for example from localStorage); authenticated users get their own sessions automatically. Call `refresh()` after a send completes so titles and ordering update.

## Provider

`HermesProvider` and `useHermesClient()` put one client in context for component trees that need it in many places.
