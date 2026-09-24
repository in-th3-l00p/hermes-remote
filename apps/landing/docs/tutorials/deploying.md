# Deploying

Hermes Remote runs on the same machine as the agent. The deployment story is: enable the agent's API server, run hermes-remote as a service, then expose it deliberately.

## 1. Enable the agent's API server

In the Hermes profile's `.env` (for example `~/.hermes/.env`):

```bash
API_SERVER_ENABLED=true
API_SERVER_KEY=$(openssl rand -hex 24)
```

Restart the gateway (`hermes gateway restart`). The agent now listens on `127.0.0.1:8642`; the key never needs to leave this machine.

## 2. Configure and install the service

```bash
npm i -g @intheloop-studio/hermes-remote-cli

hermes-remote init \
  --port 8643 \
  --cors https://app.example.com \
  --upstream http://127.0.0.1:8642 --upstream-key $API_SERVER_KEY \
  --supabase-url https://YOUR_PROJECT.supabase.co \
  --rate-limit 120 --rate-window 60

hermes-remote service install
```

`service install` writes a launchd plist on macOS or a systemd user unit on Linux and prints the activation command. After that, `hermes-remote serve` runs on boot with the config file, and `hermes-remote logs` tails it.

## 3. Expose it

Put TLS in front; never expose the raw HTTP port directly. By default the server listens on `127.0.0.1` only, so a reverse proxy or tunnel on the same machine is the way in. If the proxy runs elsewhere, set `--host` to a private interface and firewall the port. Any of these work:

* A reverse proxy (Caddy, nginx) terminating TLS for `agent.example.com` and forwarding to `127.0.0.1:8643`.
* A Cloudflare Tunnel from the agent machine, which avoids opening inbound ports at all.
* A VPN or tailnet if the audience is private.

Tell hermes-remote which proxies to trust so per-IP limits and `--cidr` key pins see real clients: `--trust-proxy 127.0.0.1` for a proxy on the same machine, or the proxy's network. Without it every request appears to come from the proxy, so one client's failed logins would lock everyone out and CIDR pins could never match. Make sure the proxy sets `X-Forwarded-For`.

Streaming responses must not be buffered: with nginx set `proxy_buffering off;` (and a `proxy_read_timeout` above 60 s) for the hermes-remote location. Caddy streams by default.

For health checks, point the proxy or load balancer at `GET /v1/status`: it needs no token and returns `{ ok, version }`.

## Or run it in Docker

The repository ships a `Dockerfile` and a `docker-compose.yml` for running hermes-remote beside an agent on the host. All state (keys, chat history, users, signing key, logs) lives in the `/data` volume.

```bash
echo "API_SERVER_KEY=<the agent's key>" > .env
docker compose run --rm hermes-remote keys create --name web \
  --scope chat:invoke --scope sessions:read --scope sessions:write
docker compose up -d
```

The compose file reaches the agent at `host.docker.internal:8642` and publishes the port on `127.0.0.1` only; put your TLS proxy in front as below. Inside the container the server binds `0.0.0.0`, which is what makes the published port reachable. Any CLI command works the same way (`docker compose exec hermes-remote bun /app/bin/hermes-remote.js doctor`). The image has a health check against `/v1/status`.

The Supabase and Clerk SDKs are not bundled into the image. To use those auth providers, use the npm install instead, or extend the image with `bun add @supabase/supabase-js` or `bun add @clerk/backend`. The generic JWT provider and token exchange work as is.

## 4. Lock it down

* Do not run `--anonymous` on anything public. Every caller should be an authenticated user or an API key.
* Give keys the minimum scopes; a chat frontend's backend needs `chat:invoke`, `sessions:read`, `sessions:write` and nothing else. Use `--cidr` to pin server-side keys to your infrastructure.
* Remember that `chat:invoke` is agent access: what a turn can do is bounded by the Hermes profile's toolsets. Serve a locked-down profile (web only, no terminal) to strangers; keep powerful profiles for yourself, and pin public keys with `--profile`.
* The audit log (`~/.hermes-remote/audit.log`) records every auth failure and mutation with the acting principal; ship it to your log pipeline.
* Rotate keys with `hermes-remote keys rotate <id>` on any suspicion; the id and scopes survive, the old secret dies instantly.
* Tier 3 scopes (config, hooks, installs, profiles) are host-level access. Grant them only to keys that stay inside your infrastructure.

Before going live, go through the [hardening checklist](/server/hardening). If something does not answer, see [troubleshooting](/guide/troubleshooting).

## What never to expose

The agent's own `API_SERVER_KEY`, the port 8642 listener, and unrestricted tier 3 scopes. Hermes Remote exists precisely so none of these ever face the internet.
