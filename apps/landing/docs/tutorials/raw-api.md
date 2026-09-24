# Using the raw API

Everything the clients do is plain HTTP plus server-sent events, so any language works. The full endpoint reference starts at [HTTP API conventions](/api/); this page is the hands-on tour.

## From any language

The TypeScript client and React hooks are conveniences, not requirements. From Python, Go, Ruby or anything else that speaks HTTP:

* **Authenticate** with `Authorization: Bearer <token>`: an `hk_` API key from your backend, or a user's access token. See [conventions](/api/#authentication).
* **Generate a client** from the OpenAPI 3.1 document at `GET /v1/openapi.json` (any authenticated token can read it) with the generator for your language, for example `openapi-generator-cli generate -g python -i openapi.json`. A copy of the document for each release is in the repository at `packages/hermes-api/openapi.json`.
* **Read streams** with any server-sent events library. Chat and run streams are ordinary SSE with the event names listed in [Chat sessions and SSE](/api/chat); lines starting with `:` are keep-alive comments to skip.
* **Handle errors** by the stable `error.code` in every failure body, not by message text.

The rest of this page does all of that with `curl`.

## Create a session and chat

```bash
TOKEN="hk_..."   # or a user access token
BASE="http://localhost:8643"

SESSION=$(curl -s -X POST "$BASE/v1/sessions" \
  -H "Authorization: Bearer $TOKEN" | jq -r .id)

curl -N -X POST "$BASE/v1/sessions/$SESSION/messages" \
  -H "Authorization: Bearer $TOKEN" \
  -H "content-type: application/json" \
  -d '{"content":"hello"}'
```

The response is an SSE stream:

```
event: user
data: {"id":"...","role":"user","content":"hello",...}

event: assistant
data: {"id":"a1"}

event: delta
data: {"id":"a1","text":"Hi"}

event: done
data: {"id":"a1","role":"assistant","content":"Hi there.","status":"done",...}
```

## Sessions and messages

```bash
curl -s "$BASE/v1/auth/whoami" -H "Authorization: Bearer $TOKEN"
curl -s "$BASE/v1/sessions?limit=20&offset=0" -H "Authorization: Bearer $TOKEN"
curl -s "$BASE/v1/sessions/$SESSION/messages?limit=50" -H "Authorization: Bearer $TOKEN"
curl -s -X POST "$BASE/v1/sessions/$SESSION/stop" -H "Authorization: Bearer $TOKEN"
curl -s -X DELETE "$BASE/v1/sessions/$SESSION" -H "Authorization: Bearer $TOKEN"
```

Reactions toggle:

```bash
curl -s -X POST "$BASE/v1/sessions/$SESSION/messages/$MESSAGE/reactions" \
  -H "Authorization: Bearer $TOKEN" -H "content-type: application/json" \
  -d '{"emoji":"\u2764"}'
```

Edits truncate and regenerate (the response is the same SSE stream as a send):

```bash
curl -N -X PATCH "$BASE/v1/sessions/$SESSION/messages/$MESSAGE" \
  -H "Authorization: Bearer $TOKEN" -H "content-type: application/json" \
  -d '{"content":"ask this instead"}'
```

## Beyond chat

```bash
curl -s "$BASE/v1/health" -H "Authorization: Bearer $TOKEN"
curl -s -X POST "$BASE/v1/runs" -H "Authorization: Bearer $TOKEN" \
  -H "content-type: application/json" -d '{"input":"tidy my notes"}'
curl -N "$BASE/v1/events" -H "Authorization: Bearer $TOKEN"
```

See [Runs](/api/runs), [Jobs](/api/jobs), [Management](/api/management), and the rest of the API section.

## Errors

Errors are JSON with stable codes:

```json
{ "error": { "code": "missing_scope", "message": "This route requires the chat:invoke scope" } }
```

The full code list is in [conventions](/api/#errors).
