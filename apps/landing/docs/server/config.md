# Configuration

The server reads `~/.hermes-remote/config.json`. Set `HERMES_REMOTE_HOME` to move the whole state directory. The file is written by `hermes-remote init` with mode 0600 because it can hold secrets (the upstream key, a shared JWT secret).

A complete example:

```json
{
  "port": 8643,
  "cors": ["https://app.example.com"],
  "anonymous": false,
  "upstreamUrl": "http://127.0.0.1:8642",
  "upstreamKey": "YOUR_API_SERVER_KEY",
  "upstreamModel": "Hermes-4.3-36B",
  "auth": {
    "provider": "supabase",
    "url": "https://project.supabase.co",
    "publishableKey": "sb_publishable_..."
  },
  "rateLimit": { "limit": 120, "windowSeconds": 60 },
  "hermesBinary": "hermes",
  "profileHomes": { "indra": "/Users/me/.hermes/profiles/indra" },
  "commandRelay": false
}
```

## Keys

| Key | Default | Meaning |
| --- | ------- | ------- |
| `port` | `8643` | HTTP port |
| `cors` | `[]` | Origins allowed for browser calls. Empty disables CORS handling. |
| `anonymous` | `false` | Allow unauthenticated chat. Demos only. |
| `upstreamUrl` | none | The Hermes agent's API server. Without it, the demo agent answers. |
| `upstreamKey` | none | The agent's `API_SERVER_KEY`. Required when `upstreamUrl` is set. Never appears in responses or logs. |
| `upstreamModel` | none | Model name sent on upstream chat calls. |
| `auth` | none | User auth provider selection; see [Authentication](/auth/). |
| `supabaseUrl` / `supabaseJwtSecret` | none | Legacy user auth fields; superseded by `auth`. |
| `rateLimit` | off | Per-principal fixed window, `{ "limit": n, "windowSeconds": s }`. |
| `hermesBinary` | `"hermes"` | Path to the `hermes` binary for CLI-backed routes. |
| `profileHomes` | `{}` | Overrides the home directory per profile. Defaults to `~/.hermes/profiles/<name>`; the default profile uses `~/.hermes`. |
| `commandRelay` | `false` | Enables the slash-command relay; see [Goals and slash commands](/api/goals). |

## Auth section shapes

```json
{ "auth": { "provider": "supabase", "url": "https://p.supabase.co", "publishableKey": "sb_publishable_..." } }
```

```json
{ "auth": { "provider": "clerk", "secretKey": "sk_live_...", "authorizedParties": ["https://app.example.com"] } }
```

```json
{ "auth": { "provider": "jwt", "jwksUrl": "https://auth.example.com/.well-known/jwks.json", "issuer": "https://auth.example.com", "audience": "hermes-remote" } }
```

```json
{ "auth": { "provider": "jwt", "hs256Secret": "shared-secret" } }
```

## The state directory

| File | Purpose |
| ---- | ------- |
| `config.json` | Everything above |
| `keys.json` | API key records (argon2 hashes, never secrets) |
| `chat.db` | SQLite chat sessions and messages |
| `audit.log` | Append-only JSONL audit trail |
| `logs/server.log` | Server log, tailed by `hermes-remote logs` |

Back up the directory as a unit. Rotating a key (`keys rotate`) or revoking one takes effect immediately without a restart.
