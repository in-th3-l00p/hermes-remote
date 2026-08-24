# Security policy

## Reporting a vulnerability

Please report vulnerabilities privately through a [GitHub security advisory](https://github.com/in-th3-l00p/hermes-remote/security/advisories/new), or via the contact options on [tiscacatalin.com](https://www.tiscacatalin.com). Reports touching authentication, session ownership, or scope enforcement are treated as release blockers and fixed in an immediate patch release.

## Threat model in brief

`chat:invoke` is remote access to an agent that may hold terminal capabilities, so the server is built around that assumption:

* API key secrets are stored as argon2 hashes; keys are minted only by the host CLI, never over HTTP, and support expiry, rotation, revocation, and IPv4 CIDR pinning.
* User tokens are verified against the identity provider's public JWKS (ES256); the server holds no signing secret.
* Scopes are a closed catalog enforced per route; user tokens are limited to tier 1 and to sessions they own.
* Rate limits are per principal; every mutation and auth failure is written to an append only audit log with the acting principal.
* The upstream agent key never appears in responses, logs, or client bundles, and the agent's identity context contains only verified claims.

The full model is documented at [docs/internals/security](https://hermes-remote.tiscacatalin.com/docs/internals/security.html).

## Supported versions

The latest 1.x release receives security fixes.
