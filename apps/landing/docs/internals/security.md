# 4.2 Security model

The threat model starts from one fact: `chat:invoke` is remote access to an agent that can run terminal commands. Everything below exists to make that safe to expose.

## Keys

API keys are `hk_<id>.<secret>`; the server stores only an argon2 hash of the secret (via `Bun.password`). Verification is constant time, revocation and expiry are checked before the hash, and rotation replaces the secret without touching the id or scopes. Keys can be pinned to source networks with IPv4 CIDR allowlists, enforced against the socket address on every request. Keys are minted only by the CLI on the host; there is no HTTP route that can create or escalate a key, so a leaked key can never mint another.

## Scopes

Four tiers, enforced per route. User tokens are hard limited to tier 1 and their own resources; tier 3 (host level configuration surfaces) requires an explicit `--dangerous` acknowledgment at grant time. The scope catalog is a closed set: unknown scopes are rejected at key creation, and a generated matrix test asserts every route's allow and deny behavior for every principal type.

## User tokens

Supabase access tokens are verified with the project's public JWKS (ES256, P-256, WebCrypto), so the server holds no signing secret at all. The verifier caches keys and refetches once on an unknown `kid` to survive rotations. Expiry and `sub` are validated after the signature; tampered, expired, or foreign tokens all resolve to null and the request dies with a 401. A legacy HS256 path exists for older projects, implemented with a timing safe comparison.

Why asymmetric wins: with JWKS, compromising the chat server yields nothing that can mint identities. With a shared secret, it would.

## Ownership and blast radius

Every session row carries its owner. All five mutating routes and both read routes re-check ownership on each request, so an id leaked in a log is not an access grant (except for deliberately anonymous sessions, which are capability URLs by design and carry no user data). Rate limiting is per principal, so one abusive guest cannot starve the rest. The audit log appends the acting principal for every mutation and every auth failure.

## What the agent never sees

The identity context is generated from verified claims only: user id, email, or key name. No IPs, no tokens, no platform metadata. Conversely, the agent's own credentials (the upstream `API_SERVER_KEY`) never appear in any response, log line, or client bundle.

## Reporting

Security reports: open a GitHub security advisory on the repository, or contact the maintainer through tiscacatalin.com. Fixes to auth or ownership ship as immediate patch releases.
