# CLI reference

`@intheloop-studio/hermes-remote-cli` installs one binary, `hermes-remote` (`hermes-api` is an alias). All state lives under `~/.hermes-remote/`, or the directory named by the `HERMES_REMOTE_HOME` environment variable.

```
hermes-remote init [flags]          write config.json
hermes-remote serve [flags]         run the API server
hermes-remote keys <action>         manage API keys
hermes-remote service <action>      run serve on boot
hermes-remote logs [--tail 50]      show server logs
hermes-remote audit tail [--lines 50] show recent audit entries
hermes-remote users list|show|disable|enable|delete   manage token-exchange users
hermes-remote doctor                check the setup
```

## init

Writes `~/.hermes-remote/config.json` with owner-only permissions (the file can hold secrets). Every flag maps to a config key, so `serve` needs no flags afterwards:

```bash
hermes-remote init \
  --port 8643 \
  --cors https://app.example.com \
  --upstream http://127.0.0.1:8642 --upstream-key $API_SERVER_KEY \
  --rate-limit 120 --rate-window 60
```

Accepted flags: `--port`, `--host`, `--cors`, `--trust-proxy` (repeatable), `--anonymous`, `--upstream`, `--upstream-key`, `--model`, `--supabase-url`, `--supabase-jwt-secret`, `--rate-limit`, `--rate-window`. Running `init` again merges into the existing file. Keys that have no flag (`auth`, `hermesBinary`, `profileHomes`, `commandRelay`) are edited in the file directly; see [Configuration](/server/config).

## serve

Runs the server. Every setting resolves with the same precedence: flag, then environment variable, then `config.json`.

| Flag | Env | Config key | Meaning |
| ---- | --- | ---------- | ------- |
| `--port` | | `port` | HTTP port, default 8643 |
| `--host` | | `host` | Interface to listen on, default `127.0.0.1` (loopback only). Use `0.0.0.0` only when a firewall or reverse proxy guards the port. |
| `--cors a,b` | | `cors` | Allowed browser origins |
| `--trust-proxy a,b` | | `trustProxy` | Reverse-proxy CIDRs whose `X-Forwarded-For` is trusted |
| `--upstream` | `HERMES_UPSTREAM_URL` | `upstreamUrl` | Hermes agent API server URL |
| `--upstream-key` | `HERMES_UPSTREAM_KEY` | `upstreamKey` | The agent's `API_SERVER_KEY` |
| `--model` | `HERMES_UPSTREAM_MODEL` | `upstreamModel` | Upstream model name |
| `--anonymous` | | `anonymous` | Allow unauthenticated chat (demos only) |
| `--rate-limit` / `--rate-window` | | `rateLimit` | Requests per principal per window |
| `--supabase-url` | `SUPABASE_URL` | `supabaseUrl` | Legacy: verify user JWTs via the project's JWKS |
| `--supabase-jwt-secret` | `SUPABASE_JWT_SECRET` | `supabaseJwtSecret` | Legacy: HS256 verification |
| | `CLERK_SECRET_KEY` | | Enables the Clerk provider when nothing else is configured |

User auth providers (`supabase`, `clerk`, `jwt`) are selected by the `auth` section of `config.json`; an explicit `auth` section beats the legacy Supabase flags. See [Authentication](/auth/).

Without `--upstream` the server answers with a built-in demo agent. With `--upstream` but no `--upstream-key`, `serve` refuses to start.

## keys

API keys are minted only here, on the host. There is deliberately no HTTP endpoint for creating or escalating keys.

```bash
hermes-remote keys create --name my-app \
  --scope chat:invoke --scope sessions:read --scope sessions:write \
  [--user-grantable chat:invoke,sessions:read] \
  [--profile indra] [--expires 90d] [--cidr 10.0.0.0/8] [--dangerous]

hermes-remote keys list
hermes-remote keys show <id>          # record with the hash redacted
hermes-remote keys revoke <id>
hermes-remote keys rotate <id>        # new secret, same id and scopes
hermes-remote keys grant <id> --scope <s> [--dangerous]
hermes-remote keys ungrant <id> --scope <s>
```

* `create` and `rotate` print the token once. It cannot be recovered later; only an argon2 hash is stored.
* Tier 3 scopes require `--dangerous`; unknown scopes are rejected. See [API keys and scopes](/server/scopes).
* `--profile <name>` pins the key to one Hermes profile; requests targeting another profile get 403.
* `--name` is a single line of at most 64 characters. `--dangerous` is required for tier 3 scopes and for `auth:users`. `keys list` shows each key as `active`, `expired` or `revoked`.
* `--expires` takes durations like `30m`, `12h`, `90d` (zero is refused). `--cidr` restricts the key to source networks (IPv4 or IPv6 CIDR list, validated at creation). Behind a reverse proxy, set `--trust-proxy` on `serve` so pins match the real client.
* `--user-grantable` accepts tier 1 scopes only. It is reserved for the token-exchange pattern.

## service

```bash
hermes-remote service install     # launchd plist (macOS) or systemd user unit (Linux)
hermes-remote service uninstall
hermes-remote service status
```

`install` writes the unit and prints the activation command. After that, `serve` runs on boot with the config file.

## logs

```bash
hermes-remote logs --tail 100
```

Tails the server log (`~/.hermes-remote/logs/server.log`). The audit log is a separate file; see [Rate limits and audit log](/server/operations).

## audit

```bash
hermes-remote audit tail --lines 20
```

Prints the newest entries of `~/.hermes-remote/audit.log` (JSON lines).

## users

```bash
hermes-remote users list
hermes-remote users show usr_07a54c651a055be3f163
hermes-remote users disable usr_07a54c651a055be3f163
hermes-remote users delete usr_07a54c651a055be3f163 --cascade
```

Manages users created by [token exchange](/auth/token-exchange). `disable` takes effect on the running server immediately: the user's outstanding tokens stop working. `delete --cascade` also removes their chat sessions.

## doctor

```bash
hermes-remote doctor
```

Checks the local setup and prints one line per finding: `✓` fine, `!` advice (expired keys still unrevoked, dangerous keys without expiry, a non-loopback bind, anonymous mode, a missing `hermes` binary, no upstream), `✗` a problem (invalid `config.json`, an unreachable upstream). It exits non-zero only when there is a `✗`.
