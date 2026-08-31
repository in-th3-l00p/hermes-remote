# Custom providers

Two paths, depending on how far from a standard JWT your issuer is.

## Path 1: the generic `jwt` provider (no code)

Any issuer of standard JWTs works with the built-in, zero-dependency `jwt` provider. It verifies ES256 signatures against a JWKS endpoint (keys cached, one refetch on unknown `kid`) or HS256 against a shared secret, checks `exp`, and optionally pins `iss` and `aud`:

```json
{
  "auth": {
    "provider": "jwt",
    "jwksUrl": "https://auth.example.com/.well-known/jwks.json",
    "issuer": "https://auth.example.com",
    "audience": "hermes-remote"
  }
}
```

```json
{
  "auth": { "provider": "jwt", "hs256Secret": "shared-secret" }
}
```

Claims mapping: `sub` (required) becomes the owning user id, `email` and `is_anonymous` are passed through when present. Expired tokens, missing `sub`, wrong algorithm, and issuer or audience mismatches all verify to `null`, and the request gets a 401.

## Path 2: implement `AuthProvider`

For anything else, such as opaque tokens or a session lookup against your own backend, implement the interface:

```ts
import type { AuthProvider, VerifiedUser } from "@intheloop-studio/hermes-remote";

class MyBackendProvider implements AuthProvider {
  readonly name = "my-backend";

  constructor(private readonly baseUrl: string) {}

  async verify(token: string): Promise<VerifiedUser | null> {
    const res = await fetch(`${this.baseUrl}/sessions/introspect`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      return null;
    }
    const session = (await res.json()) as { userId: string; email?: string };
    return {
      sub: session.userId,
      ...(session.email === undefined ? {} : { email: session.email }),
    };
  }
}
```

Return `null` for anything invalid; never throw for a merely bad token. `sub` owns the sessions; `email` (when present) is included in the identity context the agent sees; `isAnonymous: true` introduces the caller to the agent as a guest with a stable id.

Wire it in by embedding the server:

```ts
import {
  startServer,
  ChatStore,
  HermesAgent,
  KeyStore,
} from "@intheloop-studio/hermes-remote";

await startServer({
  port: 8643,
  logPath: `${process.env.HOME}/.hermes-remote/logs/server.log`,
  store: new KeyStore(`${process.env.HOME}/.hermes-remote/keys.json`),
  authProvider: new MyBackendProvider("https://api.example.com"),
  corsOrigins: ["https://app.example.com"],
  chat: {
    store: new ChatStore(`${process.env.HOME}/.hermes-remote/chat.db`),
    agent: new HermesAgent({ baseUrl: "http://127.0.0.1:8642", apiKey: KEY }),
    turns: new Map(),
  },
});
```

## The token exchange pattern

If your platform has its own backend and does not want to expose its IdP tokens to the browser, broker access instead:

1. The user logs into your platform normally.
2. Your backend verifies them and mints a short-lived JWT of your own, signed with a secret only you and the server share.
3. The browser talks to Hermes Remote with that JWT, verified by `{ "provider": "jwt", "hs256Secret": "..." }`.

This keeps the platform IdP entirely out of the chat path and lets you decide exactly which claims the agent may see.

## API keys still work alongside

User verification and `hk_` API keys coexist: tokens starting with `hk_` go through the key store (scopes, CIDR allowlists, expiry), everything else goes through the auth provider. A backend service and a browser user can share one server.
