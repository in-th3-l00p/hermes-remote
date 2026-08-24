# 3.1 Architecture

## The integration point

A Hermes agent already ships an OpenAI compatible API server inside its gateway (`hermes gateway`, port 8642, bearer key auth). Hermes Remote deliberately builds on that instead of driving the agent through files or subprocesses: the agent keeps full ownership of its own tool loop, memory, and configuration, and Hermes Remote stays a pure network facade. One consequence is strict layering: the upstream key lives only in the server process, and clients authenticate with their own credentials.

The wider design (documented in the repo's ARCHITECTURE.md) reserves two more bridges for future surfaces: a CLI bridge for management operations the agent only exposes as commands (cron, skills, memory), and a filesystem bridge for read mostly artifacts. The 1.0 release ships the HTTP bridge, which covers the chat product surface end to end.

## The principal model

Every request resolves to exactly one principal before any route logic runs:

```ts
type Principal =
  | { type: "api_key"; record: ApiKeyRecord }   // hk_ tokens, scoped
  | { type: "user"; userId: string; email? }     // verified JWTs
  | { type: "anonymous" };                       // only when --anonymous
```

Rules that fall out of this:

* Sessions are owned by the creating user id; access checks compare owner to principal on every route. API keys are operator surfaces and can cross user boundaries, which is why they are never handed to browsers.
* There is no admin scope. An "admin" is just a key that was explicitly granted many scopes; each dangerous grant is a deliberate CLI act.
* Anonymous is a server start flag, not a client choice.

## The chat data model

SQLite (via `bun:sqlite`, synchronous and fast) with two tables: sessions (id, owner, title, timestamps) and messages (position ordered, with JSON columns for attachments and reactions). Titles are set from the first user message. Edits delete everything after the edited message inside a transaction shaped sequence, which keeps the regeneration semantics trivial: history is always exactly what the agent should see.

## Streaming

One SSE contract serves both directions. Downstream (server to browser) events are `user`, `assistant`, `delta`, `done`, `error`. Upstream, the server consumes the agent's OpenAI style `chat.completion.chunk` stream and re-emits deltas while accumulating the content into the store, so a client that disconnects mid stream still finds the full reply in history. Cancellation is an AbortController held in a per session map; `POST /stop` aborts it and the partial content is committed as a completed message.

## Identity injection

The one place product identity touches the agent: a single system message prepended to every turn, generated from the principal. It carries the user id and email (or the key name, or "guest") and an instruction to address the caller accordingly, and nothing else, so no platform data can leak into the agent's context by accident.
