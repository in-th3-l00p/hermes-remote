# Discovery

Read-only routes that tell you what the server and the upstream agent can do. All are proxied from the agent's API server, or answered by the offline demo upstream when none is configured.

| Route | Scope | Returns |
| ----- | ----- | ------- |
| `GET /v1/status` | none (public) | `{ ok, version }` for hermes-remote itself |
| `GET /v1/health` | `status:read` | hermes-remote status plus the upstream agent's readiness report |
| `GET /v1/capabilities` | `status:read` | hermes-remote features plus the upstream's machine-readable capability set |
| `GET /v1/models` | `status:read` | Model discovery (proxied `GET /v1/models`) |
| `GET /v1/models/options` | `status:read` | Model options (proxied `GET /api/model/options`) |
| `GET /v1/skills` | `skills:read` | The agent's skill index |
| `GET /v1/toolsets` | `toolsets:read` | Toolset enumeration |

```bash
curl -s "$BASE/v1/health" -H "Authorization: Bearer $TOKEN"
curl -s "$BASE/v1/capabilities" -H "Authorization: Bearer $TOKEN"
```

Upstream failures come back as 502 with code `upstream_error` and the upstream status attached. `GET /v1/capabilities` is the right way to feature-detect before calling optional surfaces such as [TTS](/api/passthrough#media).
