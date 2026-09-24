# Chat sessions and SSE

The chat surface is the server's own product layer: sessions and messages persist in SQLite on the hermes-remote host, owned per user, and each turn is streamed to the upstream agent with the caller's verified identity injected.

## Routes

| Route | Scope | Purpose |
| ----- | ----- | ------- |
| `POST /v1/sessions` | `sessions:write` | Create a session, owned by the caller |
| `GET /v1/sessions?limit=&offset=&archived=` | `sessions:read` | List own sessions (archived ones with `archived=true`); anonymous callers (and keys with `sessions:read-all`) pass `?ids=a,b` |
| `GET /v1/sessions/search?q=&limit=` | `sessions:search` | Case-insensitive search over your own session titles and messages; anonymous callers get an empty list |
| `PATCH /v1/sessions/:id` | `sessions:write` | Body `{title?, archived?}`: rename (1 to 120 characters) and/or archive |
| `POST /v1/sessions/:id/fork` | `sessions:write` | Body `{messageId?}`: copy history (up to and including that message) into a new session you own |
| `GET /v1/sessions/:id/export?format=` | `sessions:read` | Download the session as JSON, or a Markdown transcript with `format=markdown` |
| `DELETE /v1/sessions/:id` | `sessions:write` | Delete a session and its messages |
| `GET /v1/sessions/:id/messages?limit=&offset=` | `sessions:read` | Message history with a `total` count |
| `POST /v1/sessions/:id/messages` | `chat:invoke` | Send `{content, attachments?}`; streams SSE |
| `PATCH /v1/sessions/:id/messages/:mid` | `chat:invoke` | Edit a user message, truncate after it, regenerate; streams SSE |
| `POST /v1/sessions/:id/messages/:mid/reactions` | `sessions:write` | Toggle `{emoji}` on a message |
| `POST /v1/sessions/:id/stop` | `chat:invoke` | Abort the in-flight turn, keep the partial reply |

Users see only sessions they own; a foreign session id gets 404, not 403. API keys own the sessions they create (the session's `keyId`); reaching another principal's session needs `sessions:read-all` to read it or `sessions:write-all` to post to, edit, stop or delete it. Anonymous sessions are capability URLs: whoever knows the id can use it, and anonymous callers can never reach a session owned by a user or a key.

## A full exchange

```bash
BASE=http://localhost:8643
TOKEN=hk_...

SESSION=$(curl -s -X POST "$BASE/v1/sessions" -H "Authorization: Bearer $TOKEN" | jq -r .id)

curl -N -X POST "$BASE/v1/sessions/$SESSION/messages" \
  -H "Authorization: Bearer $TOKEN" -H "content-type: application/json" \
  -d '{"content":"hello"}'
```

The response is `text/event-stream`:

```
event: user
data: {"id":"...","role":"user","content":"hello","status":"done"}

event: assistant
data: {"id":"a1"}

event: delta
data: {"id":"a1","text":"Hi"}

event: delta
data: {"id":"a1","text":" there."}

event: done
data: {"id":"a1","role":"assistant","content":"Hi there.","status":"done"}
```

## The SSE events

While the agent is thinking and no tokens arrive, the stream carries a `: keepalive` comment every 15 seconds, always between events. SSE parsers ignore comment lines, so clients need no special handling.

| Event | Payload |
| ----- | ------- |
| `user` | The stored user message, echoed back |
| `assistant` | `{ id }` of the reply placeholder |
| `delta` | `{ id, text }`, a token chunk to append |
| `done` | The final assistant message |
| `error` | `{ id, message }` when the agent fails |

The server accumulates deltas into the store as it streams. If the client disconnects mid-stream, the turn is cancelled upstream (so no tokens are spent on a reply nobody reads) and the partial reply is kept in history with status `done`. `POST /v1/sessions/:id/stop` does the same explicitly and the partial content arrives as `done`. Deleting a session also stops its running turn.

One turn runs per session at a time. A send or edit while a turn is streaming gets 409 `turn_in_flight` and changes nothing. If the server restarts mid-turn, the unfinished reply is marked `error` on startup.

## Attachments

Attachments are inline base64 image data URLs (`image/png`, `image/jpeg`, `image/gif` or `image/webp`; the `type` must match the data URL, and names are at most 255 characters), forwarded to the upstream model as vision content parts. Remote URLs and SVG are refused with 400:

```bash
curl -N -X POST "$BASE/v1/sessions/$SESSION/messages" \
  -H "Authorization: Bearer $TOKEN" -H "content-type: application/json" \
  -d '{"content":"what is in this photo?","attachments":[{"name":"a.png","type":"image/png","dataUrl":"data:image/png;base64,..."}]}'
```

Limits: 4 attachments per message, 2,000,000 characters per data URL, 8,000 characters per message. See [limits](/server/operations#request-limits).

## Edits and reactions

```bash
# Edit: truncates history after the message and regenerates (same SSE stream as a send)
curl -N -X PATCH "$BASE/v1/sessions/$SESSION/messages/$MESSAGE" \
  -H "Authorization: Bearer $TOKEN" -H "content-type: application/json" \
  -d '{"content":"ask this instead"}'

# Reaction: toggles, returns the updated message
curl -s -X POST "$BASE/v1/sessions/$SESSION/messages/$MESSAGE/reactions" \
  -H "Authorization: Bearer $TOKEN" -H "content-type: application/json" \
  -d '{"emoji":"\u2764"}'
```

## Identity injection

Every turn prepends one system message built from the verified principal: the user id and email for users, "a guest signed in anonymously" with a stable id when the auth provider marks the token anonymous (for example Supabase anonymous sign-ins), the API key name for keys, or "an unauthenticated guest" in `--anonymous` mode (no id is shared, since the only identifier would be the client IP). Nothing else ever goes in. Ask the agent "who am I?" and it answers from that context alone.

Claims are reduced to safe shapes before they are used: ids and key names keep a plain character set, and an email claim that isn't a plain address is left out rather than echoed, so a crafted claim can't read as an instruction.
