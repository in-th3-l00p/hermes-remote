# The React hooks

`@intheloop-studio/hermes-remote-react` wraps the client in hooks. React 18+ is a peer dependency; the client package is re-exported, so one import covers most apps.

## useChat

The whole conversation state machine in one hook:

```tsx
import { HermesClient, useChat } from "@intheloop-studio/hermes-remote-react";

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
| `stop()` | Aborts the in-flight turn, keeping the partial reply |

The hook accepts any object matching `ChatClientLike`, so tests can pass a fake without network access.

## useSessions

The sidebar logic:

```tsx
import { useSessions } from "@intheloop-studio/hermes-remote-react";

function Sidebar({ onOpen }: { onOpen: (id: string) => void }) {
  const { sessions, loading, error, refresh, remove } = useSessions({ client });
  if (loading) return <p>loading</p>;
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

## useAgentInfo, useRuns, useRunEvents

```tsx
import { useAgentInfo, useRunEvents, useRuns } from "@intheloop-studio/hermes-remote-react";

function AgentStatus({ client }: { client: HermesClient }) {
  const { health, models, loading } = useAgentInfo({ client });
  const { runs, create } = useRuns({ client });
  const { events, done } = useRunEvents({ client, runId: runs[0]?.id ?? null });
  if (loading) return <p>checking the agent</p>;
  return (
    <div>
      <p>agent: {(health as { status: string }).status}</p>
      <button onClick={() => create({ input: "tidy my notes" })}>
        start a run ({runs.length} so far)
      </button>
      <p>{events.length} events{done ? ", finished" : ""}</p>
    </div>
  );
}
```

`useAgentInfo` fetches health, capabilities, and models together with a `refresh()`. `useRuns` lists the caller's runs and creates new ones. `useRunEvents` subscribes to a run's SSE stream while mounted and aborts on unmount or `runId` change.

## Management hooks

Every management surface has a hook for dashboard building: `useProfiles`, `useAgentStatus`, `useConfig`, `useMemory`, `useSoul`, `useSkills`, `useBundles`, `useJobsAdmin`, `useCheckpoints`, `useHooksInfo`, `useGateway`, `useKanban`, `useProjects`, `useToolsets`, `useMcp`, `usePlugins`, `useAgentSessions`, `useCommands`. Each takes `{ client }` and returns `{ data, loading, error, refresh }`. They are built on two exported generics you can reuse for anything else: `useResource(fetcher, deps)` and `useAction(fn)`.

Two richer hooks:

```tsx
const { goal, set, pause, resume, addGate, addSubgoal } = useGoal({ client, sessionId });
const { events, connected } = useEvents({ client }); // the /v1/events SSE firehose
```

`useGoal` reads the goal state (text, contract, gates, subgoals, turns, verdict) and refreshes after every mutation. `useEvents` keeps a live subscription while mounted.

## Provider

`HermesProvider` and `useHermesClient()` put one client in context for component trees that need it in many places:

```tsx
import { HermesProvider, useHermesClient, useChat } from "@intheloop-studio/hermes-remote-react";

function App() {
  return (
    <HermesProvider client={client}>
      <Chat />
    </HermesProvider>
  );
}

function Chat() {
  const c = useHermesClient();
  const { messages } = useChat({ client: c });
  return <p>{messages.length} messages</p>;
}
```
