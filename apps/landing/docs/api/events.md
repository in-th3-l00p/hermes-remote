# Events

`GET /v1/events` is a server-wide SSE stream of the lifecycle events hermes-remote observes. It is the push channel for dashboards. Scope: `events:subscribe` (tier 1, so user tokens can hold it).

```bash
curl -N "$BASE/v1/events" -H "Authorization: Bearer $TOKEN"
```

```
: heartbeat

event: run.created
data: {"at":"2026-08-31T12:00:00.000Z","id":"run_1"}

event: agent_session.turn
data: {"at":"2026-08-31T12:00:09.000Z","sessionId":"sess_1"}
```

Event types currently published: `run.created` (also for media/web/browser tool runs), `run.stopped`, `agent_session.turn` (a chat or stream turn on an agent session), and `command` (a relayed slash command). Each frame's `data` carries an ISO `at` timestamp plus the event fields.

A comment-line heartbeat (`: heartbeat`) is sent every 15 seconds so proxies do not drop the connection. Close the connection to unsubscribe; there is no replay, the stream starts at now.

In the clients: `client.events.subscribe(signal?)` returns an async iterable, and the React hook `useEvents({ client })` keeps a live subscription while mounted.
