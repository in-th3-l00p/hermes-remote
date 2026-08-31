# Jobs (cron)

Scheduled-task administration. These routes are API-key only; user tokens are refused regardless of scope. Reads need `crons:read`, mutations need `crons:write`.

| Route | Scope | Backed by | Purpose |
| ----- | ----- | --------- | ------- |
| `GET /v1/jobs` | `crons:read` | HTTP proxy | List scheduled jobs |
| `GET /v1/jobs/:id` | `crons:read` | HTTP proxy | Inspect one job |
| `POST /v1/jobs` | `crons:write` | HTTP proxy | Create a job |
| `PATCH /v1/jobs/:id` | `crons:write` | HTTP proxy | Edit a job |
| `DELETE /v1/jobs/:id` | `crons:write` | HTTP proxy | Remove a job |
| `POST /v1/jobs/:id/pause` | `crons:write` | HTTP proxy | Pause |
| `POST /v1/jobs/:id/resume` | `crons:write` | HTTP proxy | Resume |
| `POST /v1/jobs/:id/run` | `crons:write` | HTTP proxy | Trigger now |
| `GET /v1/jobs/:id/runs` | `crons:read` | CLI (`hermes cron runs`) | Execution history, returns `{ok, raw}` |
| `GET /v1/jobs/:id/output` | `crons:read` | Filesystem | List stored output files from `cron/output/<id>/` |
| `GET /v1/jobs/:id/output/:file` | `crons:read` | Filesystem | Read one output file |

```bash
curl -s "$BASE/v1/jobs" -H "Authorization: Bearer $HK_TOKEN"
curl -s -X POST "$BASE/v1/jobs/$JOB/run" -H "Authorization: Bearer $HK_TOKEN"
curl -s "$BASE/v1/jobs/$JOB/output" -H "Authorization: Bearer $HK_TOKEN"
```

Job bodies pass through to the upstream agent's `/api/jobs` surface unchanged, so the accepted fields (schedule, prompt, model pin, delivery, and so on) are whatever your agent version supports. The `runs` history route is CLI-backed and best-effort against hermes 0.20.x; the `raw` field carries the CLI's actual output.
