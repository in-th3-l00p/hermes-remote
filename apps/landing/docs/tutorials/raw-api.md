# 2.5 Using the raw API

Everything the clients do is plain HTTP plus server sent events, so any language works.

## Create a session and chat

```bash
TOKEN="hk_..."   # or a Supabase access token
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
data: {"id":"a1","role":"assistant","content":"Hi there!","status":"done",...}
```

## Everything else

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
  -d '{"emoji":"🔥"}'
```

Edits truncate and regenerate (the response is the same SSE stream as a send):

```bash
curl -N -X PATCH "$BASE/v1/sessions/$SESSION/messages/$MESSAGE" \
  -H "Authorization: Bearer $TOKEN" -H "content-type: application/json" \
  -d '{"content":"ask this instead"}'
```

Errors are JSON with stable codes:

```json
{ "error": { "code": "missing_scope", "message": "This route requires the chat:invoke scope" } }
```
