# Production hardening checklist

Go through this list before a deployment faces the internet. `hermes-remote doctor` checks the items marked *(doctor)* for you. The reasoning behind each one is in [Deploying](/tutorials/deploying) and the [security model](/internals/security).

## Network

- The server listens on `127.0.0.1` (the default), or on a private interface with the port firewalled. *(doctor)*
- TLS terminates at a reverse proxy or tunnel in front of it; the plain HTTP port is never public.
- `--trust-proxy` lists exactly that proxy, so per-IP limits and CIDR pins see real clients, and the proxy sets `X-Forwarded-For`.
- The proxy passes server-sent events through unbuffered.
- The agent's API server (port 8642) is reachable only from the host, and its `API_SERVER_KEY` appears nowhere but the server's config.
- `--cors` lists only your apps' exact origins.

## Callers

- Anonymous mode is off. *(doctor)*
- User sign-in goes through an [auth provider](/auth/) or [token exchange](/auth/token-exchange), never a shared API key in a browser.
- Each API key has the fewest scopes that work, and server-side keys are pinned with `--cidr`.
- Keys with tier 3 scopes have an expiry and never leave your infrastructure. *(doctor warns on dangerous keys without one)*
- Expired keys are revoked. *(doctor)*
- Per-principal rate limiting is on (`--rate-limit`, `--rate-window`); it is off by default.

## The agent

- The profile served to end users has only the toolsets they need. Strangers should not get a profile with terminal access.
- Public keys are pinned to that profile with `--profile`.
- The slash-command relay (`commandRelay`) stays off unless you rely on it.

## The host

- `~/.hermes-remote` is owned by the service user, and its secrets (`config.json`, `keys.json`, `chat.db`, `users.db`, `signing.key`, `audit.log`) stay mode 0600. The CLI creates them that way and tightens `config.json` when it loads it; don't loosen them when copying or restoring.
- The server runs as a service (`hermes-remote service install`) so it restarts on boot and crash.
- The audit log is shipped to your log pipeline, and `/v1/metrics` is scraped with a `status:read` key.
- `/v1/status` is wired to your uptime checks.
- Backups of `~/.hermes-remote` are taken and restored at least once.

## Upgrades

- You read the [changelog](https://github.com/in-th3-l00p/hermes-remote/blob/main/CHANGELOG.md) for breaking changes before upgrading.
- After upgrading the agent, you check [compatibility](/guide/compatibility) and run `hermes-remote doctor`.
- You watch the repository's security advisories, and apply fixes to the [supported release line](https://github.com/in-th3-l00p/hermes-remote/blob/main/SECURITY.md).
