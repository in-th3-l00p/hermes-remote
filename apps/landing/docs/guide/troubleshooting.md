# Troubleshooting

Start with `hermes-remote doctor`. It checks the config file, the key store, the `hermes` binary, the bind address, anonymous mode, the signing key and whether the upstream agent answers, and exits non-zero on anything that stops the server from working.

Every error response carries a stable code in `{ "error": { "code", "message" } }`; the full list is in [conventions and errors](/api/#errors).

## 401 on a route that exists

Unauthenticated requests get 401 on every path, known or not, so the route map does not leak. A 401 means the token was missing or refused, never that the route is wrong. Check:

* The header is `Authorization: Bearer <token>`. Any other scheme is refused, even in anonymous mode.
* An API key is still active: `hermes-remote keys show <id>` shows whether it was revoked or expired.
* A key pinned with `--cidr` sees the client address you expect. Behind a proxy that address is the proxy's unless the proxy is listed in `--trust-proxy`.
* A user token was issued by the provider the server is configured for, has not expired, and was not issued in the future (30 seconds of clock skew are allowed).
* Too many failed attempts from one IP answer 429 `rate_limited` before the token is even checked; wait for `retry-after`.

## 404 once authenticated

With a valid token, 404 is a real answer: the route does not exist, or the resource does not. Sessions belonging to someone else also answer 404 `session_not_found`, so ids cannot be probed. Check the path against the [API reference](/api/) and that the client and server are from matching [release lines](/guide/compatibility#client-and-server-versions).

## 403

* `missing_scope`: the key lacks the scope in the message. Grant it with `hermes-remote keys grant <id> --scope <scope>`.
* `api_key_required`: management routes refuse user tokens. Call them from your backend with an API key.
* `profile_forbidden`: the key is pinned to another profile, or a user token sent `X-Hermes-Profile`.

## 502 `upstream_error`

The agent's API server did not answer or answered with an error. The message names the status.

* Is the gateway running? `hermes gateway status`, then `curl http://127.0.0.1:8642/health`.
* Does the server point at it? `upstreamUrl` in `~/.hermes-remote/config.json`, or `--upstream`.
* Does the key match? `upstreamKey` must equal the agent's `API_SERVER_KEY`; a mismatch comes back as an upstream 401.
* In Docker, the agent on the host is `host.docker.internal:8642`, not `127.0.0.1`.

## 502 `cli_error` and 503 `cli_unavailable`

`cli_unavailable` means the `hermes` binary could not be started: install it on the server's host or set `hermesBinary` to its full path. `cli_error` means it ran and failed; the message carries its exit code and output. See [compatibility](/guide/compatibility) if the agent was upgraded recently.

## `port 8643 already in use`

Another process holds the port, often an earlier `hermes-remote serve` or the installed service. Stop it (`hermes-remote service status` shows whether the service runs), or start on another port with `--port`.

## `auth provider "clerk" requires the optional peer dependency @clerk/backend`

The Supabase and Clerk providers load their official SDKs only when enabled, so they are not installed by default. Install the one named in the message next to the server (`bun add @clerk/backend` or `bun add @supabase/supabase-js`) and restart. The generic `jwt` provider needs nothing extra.

## The browser shows a CORS error

The server answers cross-origin requests only for origins listed in `--cors` / `cors`. Add your app's exact origin (scheme, host and port, no trailing slash) and restart.

## Streams stop after a minute

A proxy in front is closing idle connections. The server sends a keep-alive comment every 15 seconds; make sure the proxy does not buffer `text/event-stream` responses (nginx: `proxy_buffering off`) and allows long reads.
