# 2.3 Custom auth providers

Supabase is the packaged path, but the server's user auth is one small interface. Any JWT issuer (Auth0, Clerk, Firebase, or your own backend) can plug in.

## The UserTokenVerifier interface

```ts
import type { SupabaseUser, UserTokenVerifier } from "@in-th3-l00p/hermes-remote";

const myVerifier: UserTokenVerifier = {
  async verify(token: string): Promise<SupabaseUser | null> {
    const payload = await validateAgainstMyIssuer(token);
    if (payload === null) return null;
    return { sub: payload.userId, email: payload.email };
  },
};
```

Return `null` for anything invalid, or `{ sub, email?, is_anonymous? }` for a verified user. The `sub` becomes the owning user id for sessions, and the email (when present) is included in the identity context the agent sees.

## Wiring it in

Run the app embedded instead of via the CLI:

```ts
import {
  createApp,
  startServer,
  ChatStore,
  HermesAgent,
  KeyStore,
} from "@in-th3-l00p/hermes-remote";

await startServer({
  port: 8643,
  logPath: `${process.env.HOME}/.hermes-remote/logs/server.log`,
  store: new KeyStore(`${process.env.HOME}/.hermes-remote/keys.json`),
  userVerifier: myVerifier,
  corsOrigins: ["https://app.example.com"],
  chat: {
    store: new ChatStore(`${process.env.HOME}/.hermes-remote/chat.db`),
    agent: new HermesAgent({ baseUrl: "http://127.0.0.1:8642", apiKey: KEY }),
    turns: new Map(),
  },
});
```

## Ready made helpers

Two verifier implementations ship in the box:

```ts
import { SupabaseJwksVerifier, hs256Verifier } from "@in-th3-l00p/hermes-remote";

const jwks = new SupabaseJwksVerifier("https://project.supabase.co"); // ES256 via JWKS
const hs = hs256Verifier(process.env.JWT_SECRET!);                     // shared secret HS256
```

`SupabaseJwksVerifier` works with any issuer that exposes a JWKS of P-256 keys at `<url>/auth/v1/.well-known/jwks.json`; for other layouts, wrap your own fetch in a custom verifier.

## The token exchange pattern

If your platform has its own backend and does not want to expose its IdP tokens to the browser, broker access instead:

1. The user logs into your platform normally.
2. Your backend (holding an `hk_` API key) verifies them and mints a short lived JWT of your own, signed with a secret only you and the verifier share.
3. The browser talks to Hermes Remote with that JWT; your `UserTokenVerifier` validates it.

This keeps the platform IdP entirely out of the chat path and lets you decide exactly which claims the agent may see.

## API keys still work alongside

User verification and `hk_` API keys coexist: tokens starting with `hk_` go through the key store (scopes, CIDR allowlists, expiry), everything else goes through your verifier. A backend service and a browser user can share one server.
