# Runs

Runs are long-running agent tasks, proxied to the upstream `POST /v1/runs` surface. hermes-remote adds ownership: each run is recorded against the principal that created it, users only ever see their own, and user-started runs get the same verified-identity context injected as chat turns. API keys see all runs.

All routes require `chat:invoke`.

| Route | Purpose |
| ----- | ------- |
| `POST /v1/runs` | Start a run; returns the upstream run object with its id |
| `GET /v1/runs` | List runs visible to the caller |
| `GET /v1/runs/:id` | Poll one run's status |
| `GET /v1/runs/:id/events` | SSE event stream for the run, proxied |
| `POST /v1/runs/:id/stop` | Stop the run |
| `POST /v1/runs/:id/steer` | Send steering input to the run |
| `POST /v1/runs/:id/approval` | Answer a pending tool approval |

```bash
RUN=$(curl -s -X POST "$BASE/v1/runs" \
  -H "Authorization: Bearer $TOKEN" -H "content-type: application/json" \
  -d '{"input":"summarize my inbox"}' | jq -r .id)

curl -N "$BASE/v1/runs/$RUN/events" -H "Authorization: Bearer $TOKEN"

curl -s -X POST "$BASE/v1/runs/$RUN/steer" \
  -H "Authorization: Bearer $TOKEN" -H "content-type: application/json" \
  -d '{"text":"focus on unread"}'

curl -s -X POST "$BASE/v1/runs/$RUN/stop" -H "Authorization: Bearer $TOKEN"
```

The event stream's event names and payloads come straight from the upstream agent (status updates, tool progress, output). Run creation also publishes a `run.created` event on the [events firehose](/api/events).
