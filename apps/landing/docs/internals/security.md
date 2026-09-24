# Security model

The threat model starts from one fact: `chat:invoke` is remote access to an agent that can run terminal commands. Everything below exists to make that safe to expose.

## Keys

API keys are `hk_<id>.<secret>`; the server stores only an argon2 hash of the secret (via `Bun.password`). Verification is constant time, revocation and expiry are checked before the hash, and rotation replaces the secret without touching the id or scopes. Keys can be pinned to source networks with IPv4 and IPv6 CIDR allowlists, enforced on every request against the socket address, or against the forwarded client address when the socket peer is a proxy listed in `trustProxy`. Keys are minted only by the CLI on the host; there is no HTTP route that can create or escalate a key, so a leaked key can never mint another.

## Scopes

Four tiers, enforced per route. User tokens and anonymous principals hold only the end-user scopes (chat, their own sessions, read-only discovery) and never reach management routes; tier 3 (host-level configuration surfaces) requires an explicit `--dangerous` acknowledgment at grant time. The scope catalog is a closed set: unknown scopes are rejected at key creation, and a generated matrix test asserts every route's allow and deny behavior for every principal type.

## User tokens

Supabase access tokens are verified with the project's public JWKS (ES256, P-256, WebCrypto), so for them the server holds no signing secret. The verifier caches keys and refetches once on an unknown `kid` to survive rotations. Expiry and `sub` are validated after the signature; tampered, expired, or foreign tokens all resolve to null and the request dies with a 401. A legacy HS256 path exists for older projects, implemented with a timing-safe comparison. Clerk tokens go through the official SDK with optional `authorizedParties` pinning.

Why asymmetric wins: with JWKS, compromising the chat server yields nothing that can mint identities. With a shared secret, it would. [Token exchange](/auth/token-exchange) is that trade-off made on purpose: the server signs its own short-lived HS256 user tokens with `signing.key` (mode 0600, created by the CLI), and bumping a user's generation invalidates every token issued to them.

## Ownership and blast radius

Every session row carries its owner. All mutating routes and both read routes re-check ownership on each request, so an id leaked in a log is not an access grant (except for deliberately anonymous sessions, which are capability URLs by design and carry no user data). Failed authentication is rate limited per client IP out of the box (30 attempts a minute). Per-principal rate limiting, which stops one abusive guest from starving the rest, is opt-in: set `--rate-limit` / `rateLimit`. With the audit log on (the CLI turns it on), every request except routine successful reads is appended with the acting principal, status and client IP, including every auth failure.

## The bridges

The CLI bridge runs only allowlisted argv templates, never a shell, with timeouts and a concurrency cap; parameters starting with `-` are refused, and output is passed through a secret redactor before it leaves the server. The filesystem bridge resolves paths inside the profile home, rejects traversal, and refuses credential files (`.env`, `auth.json`, keys) by construction. Management routes are API-key only; the profile middleware enforces key pinning before any bridge runs.

## What the agent never sees

The identity context is generated from verified claims only: user id, email, or key name. No IPs, no tokens, no platform metadata. Conversely, the agent's own credentials (the upstream `API_SERVER_KEY`) never appear in any response, log line, or client bundle.

## Reporting

Security reports: open a GitHub security advisory on the repository, or contact the maintainer through tiscacatalin.com. Fixes to auth or ownership ship as immediate patch releases.
