# 2.3 Clerk provider

Verifies Clerk session tokens with the official `@clerk/backend` SDK. Clerk brings hosted sign-in UI, MFA, organizations, and user management; Hermes Remote consumes the session token your frontend already holds.

## Server

```bash
bun add @clerk/backend
```

Two verification modes:

```json
{
  "auth": { "provider": "clerk", "secretKey": "sk_live_..." }
}
```

```json
{
  "auth": { "provider": "clerk", "jwtKey": "-----BEGIN PUBLIC KEY-----\n..." }
}
```

* `secretKey` — your Clerk secret key; the SDK fetches and caches your instance's JWKS.
* `jwtKey` — the PEM public key from the Clerk dashboard (API keys → JWT public key) for fully networkless verification.

Optional hardening fields pass straight through to the SDK: `audience`, and `authorizedParties` (recommended — the list of origins allowed to hold your session tokens):

```json
{
  "auth": {
    "provider": "clerk",
    "secretKey": "sk_live_...",
    "authorizedParties": ["https://app.example.com"]
  }
}
```

Shortcut: with no `auth` section at all, setting the `CLERK_SECRET_KEY` environment variable enables this provider.

Embedded:

```ts
import { ClerkAuthProvider, createApp } from "@in-th3-l00p/hermes-remote";

const app = createApp({
  authProvider: new ClerkAuthProvider({
    secretKey: process.env.CLERK_SECRET_KEY as string,
    authorizedParties: ["https://app.example.com"],
  }),
});
```

## Making the email visible

Clerk's default session token carries the user id (`sub`) but not the email. The agent will know the caller's stable id either way; to introduce users by email too, add a claim to the session token in the Clerk dashboard (Sessions → Customize session token):

```json
{ "email": "{{user.primary_email_address}}" }
```

## Client

Use Clerk's `getToken()` as the token provider — it returns a fresh short-lived session token on every call:

```tsx
import { useAuth } from "@clerk/clerk-react";
import { HermesClient } from "@in-th3-l00p/hermes-remote-client";

function useHermes(): HermesClient {
  const { getToken } = useAuth();
  return new HermesClient({
    baseUrl: "http://localhost:8643",
    tokenProvider: async () => (await getToken()) ?? "",
  });
}
```

Full walkthrough with a React app: the [Clerk tutorial](/tutorials/clerk-auth).
