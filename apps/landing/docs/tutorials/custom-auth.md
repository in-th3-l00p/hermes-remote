# Custom auth providers

Supabase and Clerk are the packaged paths, but the server's user auth is one small interface. Any JWT issuer (Auth0, Firebase, or your own backend) can plug in. The full reference lives in [Custom providers](/auth/custom); this page is the short version.

## Standard JWTs: no code needed

If your issuer signs ordinary JWTs, configure the built-in `jwt` provider in `~/.hermes-remote/config.json` and you are done:

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

ES256 via JWKS or HS256 via `hs256Secret`, with `exp` always enforced and `iss`/`aud` pinned when configured.

## Everything else: implement AuthProvider

```ts
import type { AuthProvider, VerifiedUser } from "@intheloop-studio/hermes-remote";

const myProvider: AuthProvider = {
  name: "my-issuer",
  async verify(token: string): Promise<VerifiedUser | null> {
    const payload = await validateAgainstMyIssuer(token);
    if (payload === null) return null;
    return { sub: payload.userId, email: payload.email };
  },
};
```

Return `null` for anything invalid, or `{ sub, email?, isAnonymous? }` for a verified user. The `sub` becomes the owning user id for sessions, and the email (when present) is included in the identity context the agent sees.

Wire it in by running the server embedded:

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
  authProvider: myProvider,
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

User verification and `hk_` API keys coexist: tokens starting with `hk_` go through the key store (scopes, CIDR allowlists, expiry), everything else goes through your provider. A backend service and a browser user can share one server.
