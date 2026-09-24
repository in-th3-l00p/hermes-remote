# Security policy

## Reporting a vulnerability

Please report vulnerabilities privately through a [GitHub security advisory](https://github.com/in-th3-l00p/hermes-remote/security/advisories/new), or via the contact options on [tiscacatalin.com](https://www.tiscacatalin.com). Reports touching authentication, session ownership, or scope enforcement are treated as release blockers and fixed in an immediate patch release.

## Threat model in brief

`chat:invoke` is remote access to an agent that may hold terminal capabilities, so the server is built around that assumption:

* API key secrets are stored as argon2 hashes; keys are minted only by the host CLI, never over HTTP, and support expiry, rotation, revocation, IPv4 and IPv6 CIDR pinning, and a profile pin.
* User tokens from Supabase or a JWT provider are verified against the provider's public JWKS (ES256), or with a shared HS256 secret for legacy setups; Clerk tokens go through the official SDK. [Token exchange](https://hermes-remote.tiscacatalin.com/docs/auth/token-exchange.html) is the one case where the server signs tokens itself, with an HS256 key kept owner-only on the host.
* Scopes are a closed catalog enforced per route; user tokens and anonymous principals hold only the end-user scopes (chat, their own sessions, read-only discovery) and are refused on every management route.
* Failed authentication is rate limited per client IP by default (30 per minute). Per-principal rate limiting is opt-in (`--rate-limit`). Behind a reverse proxy, client IPs come from `X-Forwarded-For` only when the proxy is listed in `--trust-proxy`.
* When the audit log is enabled (the CLI enables it), every request except routine successful reads is written to an append-only log with the method, path, status, acting principal and client IP.
* The upstream agent key never appears in responses, logs, or client bundles; CLI output is passed through a secret redactor; and the agent's identity context contains only verified claims.
* The server listens on `127.0.0.1` unless `--host` says otherwise.

The full model is documented at [docs/internals/security](https://hermes-remote.tiscacatalin.com/docs/internals/security.html).

## Supported versions

The latest release line receives security fixes (currently 4.x). Earlier lines do not: upgrade to get fixes.
