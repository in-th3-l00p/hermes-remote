# Runs — architecture

Chat is a conversation; a **run** is a job. You hand the agent one task, get a
`run_id` back immediately, and observe the work through a separate event
stream. This example is the whole lifecycle on one screen, driven by two
hooks.

## Submit and list

```tsx
const runs = useRuns({ client });          // { runs, create, refresh, loading, error }
const created = await runs.create({ input: "write a haiku about SSE" });
```

`create` POSTs `/v1/runs` and refreshes the list. The interesting part is the
list itself: the upstream inference API has no "list runs" endpoint at all, so
hermes-remote records every run it creates in its own ownership store —
`run_id → principal`. `GET /v1/runs` returns *your* runs: an anonymous
visitor's principal is their IP, a signed-in user's is their `sub`, and only
API keys see everything. Open this page in a private window and the list is
empty — that's the ownership store working.

## The event stream

```tsx
const events = useRunEvents({ client, runId });   // { events, done, error }
```

`useRunEvents` subscribes to `GET /v1/runs/:id/events` — a server-sent event
stream (`run.started`, `message.delta`, `run.completed`) — and appends each
frame to state. Two lifecycle details worth stealing:

- the subscription lives in a `useEffect` keyed on `runId`, holding an
  `AbortController` that cancels the HTTP stream on unmount or run change, so
  switching runs never leaks a connection;
- errors are only surfaced when the signal *wasn't* aborted — a canceled
  stream is not a failure.

## Stop, and what "ownership" enforces

Every per-run route (`GET /v1/runs/:id`, `/events`, `POST /stop`) checks the
ownership store before touching the upstream: an unowned or unknown id is a
plain 404 — the API doesn't even confirm the run exists. In the sandbox the
underlying "agent task" is a single capped completion on the free model; on a
real deployment the same routes proxy the agent's genuine long-running tasks,
with identity injected into user-submitted runs exactly like chat turns.
