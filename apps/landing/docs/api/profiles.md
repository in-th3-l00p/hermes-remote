# Profiles

Hermes profiles are fully isolated agent instances on the same host, each with its own home directory. hermes-remote targets them two ways:

* **Per request:** send `X-Hermes-Profile: <name>`. An unknown profile gets 404 `profile_not_found`.
* **Per key:** mint a key with `keys create --profile <name>`. The key is pinned; requests that name a different profile get 403 `profile_forbidden`.

CLI-backed and filesystem-backed routes resolve the profile before running, so one server can safely serve several isolated agents. Profile home directories default to `~/.hermes/profiles/<name>` and can be overridden with the `profileHomes` [config key](/server/config).

## Routes

| Route | Scope | Purpose |
| ----- | ----- | ------- |
| `GET /v1/profiles` | `status:read` | List profiles (parsed from `hermes profile list`, cached) |
| `GET /v1/profiles/:name` | `status:read` | Show one profile, `{ok, raw}` |
| `POST /v1/profiles` | `profiles:manage` | Create, body `{"name": "..."}` |
| `PATCH /v1/profiles/:name` | `profiles:manage` | Body `{"rename": "..."}` or `{"description": "..."}` |
| `DELETE /v1/profiles/:name` | `profiles:manage` | Delete |
| `POST /v1/profiles/:name/export` | `profiles:manage` | Export archive; the response body is the binary archive |
| `POST /v1/profiles/:name/import` | `profiles:manage` | Import, body `{"path": "<server-local path>"}` |
| `POST /v1/profiles/:name/install` | `profiles:manage` | Install from a source, body `{"source": "..."}` |
| `POST /v1/profiles/:name/update` | `profiles:manage` | Update |

`profiles:manage` is a tier 3 scope: API keys only, `--dangerous` at grant time. The mutation routes are CLI-backed (`{ok, raw}`) and best-effort against hermes 0.20.x subcommands.

```bash
curl -s "$BASE/v1/profiles" -H "Authorization: Bearer $TOKEN"
curl -s "$BASE/v1/agent/status" -H "Authorization: Bearer $TOKEN" -H "X-Hermes-Profile: indra"
```

In the TypeScript client, `client.withProfile("indra")` returns a client with the header set on every call.
