# Tools and OpenAI passthrough

Convenience routes over the agent's media and web tools, plus verbatim access to the upstream's OpenAI-compatible API.

## Tool runs

`images`, `search`, and `extract` work by starting a templated single-tool agent run upstream, polling it to completion, and returning:

```json
{ "runId": "run_1", "output": { "results": ["..."] }, "raw": "<the run's final output text>" }
```

`output` is structured when the tool result parses as JSON, otherwise it equals `raw`. All tool routes require `chat:invoke`. User-started runs carry the caller's verified identity, and every run is owned per principal like any other [run](/api/runs).

| Route | Body | Purpose |
| ----- | ---- | ------- |
| `POST /v1/media/images` | `{prompt, model?}` | Image generation |
| `POST /v1/web/search` | `{query}` | Web search |
| `POST /v1/web/extract` | `{url}` | Extract a page's content |
| `POST /v1/browser/tasks` | `{task}` | Start a browser-automation run; returns `{ runId }` immediately, follow it via `/v1/runs/:id` |

```bash
curl -s -X POST "$BASE/v1/web/search" \
  -H "Authorization: Bearer $TOKEN" -H "content-type: application/json" \
  -d '{"query":"bun sqlite fts5"}'
```

## Media

`POST /v1/media/tts` proxies the upstream audio API (`/v1/audio/speech`) and returns the audio bytes. It requires `chat:invoke` and only works when the agent reports `capabilities.features.audio_api`; otherwise you get 501 with the capability report so you can feature-detect. The request body passes through to the upstream unchanged.

## OpenAI passthrough

`POST /v1/chat/completions` and `POST /v1/responses` forward verbatim to the upstream agent's OpenAI-compatible API, streaming included. Two restrictions:

* API keys only (403 `api_key_required` for user tokens); the upstream surface has no per-user ownership, so it stays an operator tool.
* The key needs `chat:invoke`.

```bash
curl -N -X POST "$BASE/v1/chat/completions" \
  -H "Authorization: Bearer $HK_TOKEN" -H "content-type: application/json" \
  -d '{"messages":[{"role":"user","content":"hi"}],"stream":true}'
```

This is the escape hatch when you need an upstream feature the structured routes do not model, such as `previous_response_id` conversation state on `/v1/responses`.
