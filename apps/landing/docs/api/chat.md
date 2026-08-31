# Chat sessions and SSE

The chat surface is the server's own product layer: sessions and messages persist in SQLite on the hermes-remote host, owned per user, and each turn is streamed to the upstream agent with the caller's verified identity injected.

## Routes

| Route | Scope | Purpose |
| ----- | ----- | ------- |
| `POST /v1/sessions` | `sessions:write` | Create a session, owned by the caller |
| `GET /v1/sessions?limit=&offset=` | `sessions:read` | List own sessions; anonymous callers pass `?ids=a,b` |
| `DELETE /v1/sessions/:id` | `sessions:write` | Delete a session and its messages |
| `GET /v1/sessions/:id/messages?limit=&offset=` | `sessions:read` | Message history with a `total` count |
| `POST /v1/sessions/:id/messages` | `chat:invoke` | Send `{content, attachments?}`; streams SSE |
| `PATCH /v1/sessions/:id/messages/:mid` | `chat:invoke` | Edit a user message, truncate after it, regenerate; streams SSE |
| `POST /v1/sessions/:id/messages/:mid/reactions` | `sessions:write` | Toggle `{emoji}` on a message |
| `POST /v1/sessions/:id/stop` | `chat:invoke` | Abort the in-flight turn, keep the partial reply |

Users see only sessions they own; a foreign session id gets 404, not 403. API keys own the sessions they create. Anonymous sessions are capability URLs: whoever knows the id can use it.

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

| Event | Payload |
| ----- | ------- |
| `user` | The stored user message, echoed back |
| `assistant` | `{ id }` of the reply placeholder |
| `delta` | `{ id, text }`, a token chunk to append |
| `done` | The final assistant message |
| `error` | `{ id, message }` when the agent fails |

The server accumulates deltas into the store as it streams, so a client that disconnects mid-stream still finds the full reply in history. `POST /v1/sessions/:id/stop` aborts the turn server-side; the partial content is committed and arrives as `done`.

## Attachments

Attachments are image data URLs, forwarded to the upstream model as vision content parts:

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

Every turn prepends one system message built from the verified principal: the user id and email, the API key name, or "guest" with a stable id for anonymous callers. Nothing else ever goes in. Ask the agent "who am I?" and it answers from that context alone.
