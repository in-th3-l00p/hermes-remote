# 2.4 Deploying

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
npm i -g @in-th3-l00p/hermes-remote-cli

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

Put TLS in front; never expose the raw HTTP port directly. Any of these work:

* A reverse proxy (Caddy, nginx) terminating TLS for `agent.example.com` and forwarding to `127.0.0.1:8643`.
* A Cloudflare Tunnel from the agent machine, which avoids opening inbound ports at all.
* A VPN or tailnet if the audience is private.

## 4. Lock it down

* Do not run `--anonymous` on anything public. Every caller should be a Supabase user or an API key.
* Give keys the minimum scopes; a chat frontend's backend needs `chat:invoke`, `sessions:read`, `sessions:write` and nothing else. Use `--cidr` to pin server side keys to your infrastructure.
* Remember that `chat:invoke` is agent access: what a turn can do is bounded by the Hermes profile's toolsets. Serve a locked down profile (web only, no terminal) to strangers; keep powerful profiles for yourself.
* The audit log (`~/.hermes-remote/audit.log`) records every auth failure and mutation with the acting principal; ship it to your log pipeline.
* Rotate keys with `hermes-remote keys rotate <id>` on any suspicion; the id and scopes survive, the old secret dies instantly.

## What never to expose

The agent's own `API_SERVER_KEY`, the port 8642 listener, and unrestricted tier 3 scopes. Hermes Remote exists precisely so none of these ever face the internet.
